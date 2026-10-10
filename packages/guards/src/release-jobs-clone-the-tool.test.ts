// no-token: gh -- parses `release.yml` and walks the import graph of the scripts it runs, both as files in this tree; no `gh` or network is reached
/**
 * #4861: A JOB THAT RUNS A SCRIPT REACHING `repo-identity.ts` CLONES THE TOOL FIRST.
 *
 * `scripts/repo-identity.ts` reads the tool through `scripts/agent-org-newest-tag.ts`, and on a runner `toolRoot()` falls back to
 * `.agent-org/host.json`'s absolute host path, which does not exist there: the step dies on `ENOENT .../agent-org/package.json`.
 * `guards` and `decide` carried the clone step and `decide-outsider-pin` did not, so the first run after `OUTSIDER_PIN_REFRESH` was
 * set (2026-10-10T05:35Z, the first time that job could run at all) was red, and 49 changesets sat unreleased behind it.
 *
 * ## What is pinned
 *
 * For every job in `release.yml`: any step that runs a `scripts/*.ts` (or `.mjs`) file whose LOCAL IMPORT CLOSURE reaches
 * `repo-identity.ts` has a clone step (`node scripts/agent-org-newest-tag.ts --dest=...`) in an EARLIER step of the same job.
 * The reach is derived from `localImports`, never from a list of script names: a script that begins to import the identity
 * module next month is held to the rule without anyone remembering it.
 *
 * ## Positive control for the emptiness
 *
 * `assert.deepEqual(faults, [])` passes for a guard that never looks at anything. So:
 *   1. the population of jobs the rule APPLIES to is derived and asserted to hold at least `guards`, `decide` and
 *      `decide-outsider-pin`;
 *   2. for every one of them the clone step is removed from a copy of the parsed workflow, and the guard must fault exactly that
 *      job. For `decide-outsider-pin` that copy IS the job as it stood at `adcc8fc74`, the commit run 38065151444 failed at;
 *   3. the clone step moved to the END of its job must fault too: a clone that runs after the script it serves is no clone.
 * Break it so it never fires and (2) fails; break it so it always fires and the real workflow fails.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { localImports } from "@a11ign/toolchain/lib/local-import-closure";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const WORKFLOW = resolve(REPO, ".github/workflows/release.yml");
const IDENTITY_MODULE = resolve(REPO, "scripts/repo-identity.ts");
/** `scripts/` as a path SEGMENT start: `pnpm exec tsx scripts/x.ts` and `node scripts/x.ts` both match, `my-scripts/x.ts` does not. */
const SCRIPT_PATH = /(?<![\w.-])scripts\/[\w./-]+\.(?:ts|mjs)\b/g;
const CLONE_STEP = /\bagent-org-newest-tag\.ts\s+--dest=/;
/** The population floor: the three jobs this row names, so a derivation that found none of them has found nothing. */
const MUST_BE_CHECKED = ["guards", "decide", "decide-outsider-pin"];

type Step = { name?: string; run?: string };
type Job = { steps?: Step[] };
type Workflow = { jobs: Record<string, Job> };
type Fault = { job: string; step: number; script: string };

const loadWorkflow = (): Workflow => parseYaml(readFileSync(WORKFLOW, "utf8")) as Workflow;

/** Every file `entry` imports, transitively, itself included. */
function importClosure(entry: string, seen = new Set<string>()): Set<string> {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  for (const next of localImports(entry)) importClosure(next, seen);
  return seen;
}

const reachesIdentity = (script: string): boolean => importClosure(script).has(IDENTITY_MODULE);
const clonesTheTool = (step: Step): boolean => CLONE_STEP.test(step.run ?? "");

/** The scripts a step's `run` names, as absolute paths. A path that is not a file is refused loudly: it would otherwise read as "reaches nothing". */
function scriptsRunBy(step: Step, where: string): string[] {
  const named = [...(step.run ?? "").matchAll(SCRIPT_PATH)].map((m) => m[0]);
  return named.map((rel) => {
    const abs = resolve(REPO, rel);
    assert.ok(existsSync(abs), `${where} runs ${rel}, which is not a file under ${REPO}: the reach of what it imports cannot be read`);
    return abs;
  });
}

/** Steps that need the tool and have no clone step before them. The clone step itself is the remedy, never a step that needs one. */
function faultsOf(name: string, job: Job): Fault[] {
  const steps = job.steps ?? [];
  const faults: Fault[] = [];
  steps.forEach((step, index) => {
    if (clonesTheTool(step)) return;
    const cloned = steps.slice(0, index).some(clonesTheTool);
    for (const script of scriptsRunBy(step, `${name} step ${index}`)) {
      if (!cloned && reachesIdentity(script)) faults.push({ job: name, step: index, script: script.slice(REPO.length + 1) });
    }
  });
  return faults;
}

const faultsIn = (workflow: Workflow): Fault[] => Object.entries(workflow.jobs).flatMap(([name, job]) => faultsOf(name, job));

/** The jobs the rule applies to: those with a step running a script that reaches the identity module, clone step or not. */
function jobsNeedingTheTool(workflow: Workflow): string[] {
  return Object.entries(workflow.jobs)
    .filter(([name, job]) =>
      (job.steps ?? []).some((step, i) => !clonesTheTool(step) && scriptsRunBy(step, `${name} step ${i}`).some(reachesIdentity)))
    .map(([name]) => name);
}

/** A copy of the workflow with `job`'s clone steps taken out, or moved to the end of the job. */
function withoutCloneBefore(workflow: Workflow, job: string, how: "remove" | "move-to-end"): Workflow {
  const copy = structuredClone(workflow);
  const steps = copy.jobs[job].steps ?? [];
  const clones = steps.filter(clonesTheTool);
  assert.ok(clones.length > 0, `${job} has no clone step to ${how}: the control cannot be built`);
  copy.jobs[job].steps = steps.filter((s) => !clonesTheTool(s));
  if (how === "move-to-end") copy.jobs[job].steps.push(...clones);
  return copy;
}

test("the jobs the rule applies to are derived, and hold the three this row names (positive control for every assertion below)", () => {
  const workflow = loadWorkflow();
  const needing = jobsNeedingTheTool(workflow);
  for (const name of MUST_BE_CHECKED) {
    assert.ok(needing.includes(name), `${name} was not found to run a script reaching repo-identity.ts; found ${JSON.stringify(needing)}`);
  }
  assert.ok(importClosure(resolve(REPO, "scripts/outsider/generate.ts")).has(IDENTITY_MODULE), "the reach walks real imports: generate.ts reaches the identity module");
  assert.equal(
    importClosure(resolve(REPO, "scripts/agent-org-newest-tag.ts")).has(IDENTITY_MODULE), false,
    "the clone script must NOT reach the module it serves, or no job could ever satisfy the rule",
  );
});

test("every release.yml job that runs a script reaching repo-identity.ts clones the tool in an earlier step", () => {
  assert.deepEqual(faultsIn(loadWorkflow()), []);
});

test("removing the clone step from any one needing job faults exactly that job, and decide-outsider-pin as it was at adcc8fc74 is one", () => {
  const workflow = loadWorkflow();
  const needing = jobsNeedingTheTool(workflow);
  assert.ok(needing.length >= MUST_BE_CHECKED.length);
  for (const name of needing) {
    const broken = faultsIn(withoutCloneBefore(workflow, name, "remove"));
    assert.ok(broken.length > 0, `${name}: with its clone step removed the guard still passed`);
    assert.deepEqual([...new Set(broken.map((f) => f.job))], [name], `${name}: the fault named a job other than the one broken`);
  }
  const atAdcc8fc74 = faultsIn(withoutCloneBefore(workflow, "decide-outsider-pin", "remove"));
  assert.ok(
    atAdcc8fc74.some((f) => f.script === "scripts/outsider/generate.ts"),
    `the step that died in run 38065151444 was not named: ${JSON.stringify(atAdcc8fc74)}`,
  );
});

test("a clone step AFTER the script it serves is no clone", () => {
  const workflow = loadWorkflow();
  for (const name of jobsNeedingTheTool(workflow)) {
    const late = faultsIn(withoutCloneBefore(workflow, name, "move-to-end"));
    assert.ok(late.some((f) => f.job === name), `${name}: a clone step placed last still satisfied the guard`);
  }
});
