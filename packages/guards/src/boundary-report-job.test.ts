// no-token: gh -- parses `ci.yml` and the committed baseline in the tree, and fixtures of its own; no `gh` or network is reached
/**
 * #4434 (epic #4425, phase 2): CI REPORTS THE CROSS-REPOSITORY REACHES ON EVERY PULL REQUEST, AND THE REPORT CAN NEVER HOLD A MERGE.
 *
 * `ci.yml` runs `boundary-check` (`@a11ign/toolchain`) against `packages/guards/layer-edges.baseline.json` and uploads its report. Three things
 * are pinned, each with a positive and a negative control:
 *   1. the job RUNS `boundary-check` with `--baseline=<the baseline>` and UPLOADS `boundary-report.json`;
 *   2. it is `continue-on-error` and ABSENT from `gate`'s `needs` (a report that gate waits on is a required check by another name);
 *   3. the baseline file the job names is a file that EXISTS in the tree (a typo would make the report read no baseline and call everything new).
 * The toolchain version is pinned in `package.json` and the job reads it from there, so that pin is asserted to carry the bin's release.
 *
 * POSITIVE CONTROLS: the checker is run on fixtures, each broken one way (no baseline flag, no upload, no `continue-on-error`, `gate` needing the
 * job, a baseline path that does not exist), and each must be refused for its own reason while the intact fixture passes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const JOB = "boundary";
const BASELINE = "packages/guards/layer-edges.baseline.json";
const REPORT = "boundary-report.json";
/** The first `@a11ign/toolchain` release whose package carries the `boundary-check` bin (#4432). */
const FIRST_RELEASE_WITH_BIN = [0, 4, 0];

type Step = { uses?: string; run?: string; with?: Record<string, unknown> };
type Job = { "continue-on-error"?: boolean; needs?: string | string[]; steps?: Step[] };
type Workflow = { jobs?: Record<string, Job> };

const asList = (needs: string | string[] | undefined): string[] => (needs === undefined ? [] : [needs].flat());
const runs = (job: Job): string[] => (job.steps ?? []).flatMap((step) => (step.run === undefined ? [] : [step.run]));

/** Every way `workflow` fails to report the boundary as a non-blocking job; `exists` says whether a repo-relative path is a file. */
function refusalsOf(workflow: Workflow, exists: (path: string) => boolean): string[] {
  const job = workflow.jobs?.[JOB];
  if (job === undefined) return [`no \`${JOB}\` job`];
  const refusals: string[] = [];
  const invocation = runs(job).join("\n").match(/boundary-check\b[^\n]*--baseline=(\S+)/);
  if (invocation === null) refusals.push("the job does not run boundary-check with --baseline=");
  else if (!exists(invocation[1])) refusals.push(`the baseline it names does not exist: ${invocation[1]}`);
  else if (invocation[1] !== BASELINE) refusals.push(`the baseline it names is not ${BASELINE}: ${invocation[1]}`);
  const uploads = (job.steps ?? []).some((step) => step.uses?.startsWith("actions/upload-artifact") === true && String(step.with?.path ?? "").includes(REPORT));
  if (!uploads) refusals.push(`the job does not upload ${REPORT}`);
  if (job["continue-on-error"] !== true) refusals.push("the job is not continue-on-error: true");
  if (asList(workflow.jobs?.gate?.needs).includes(JOB)) refusals.push("gate needs the job, so a red report would hold a merge");
  return refusals;
}

const ci = parseYaml(readFileSync(join(REPO, ".github/workflows/ci.yml"), "utf8")) as Workflow;
const onDisk = (path: string) => existsSync(join(REPO, path));

/** A workflow shaped like the real job, for the controls to break one way at a time. */
const intact = (): Workflow => ({
  jobs: {
    [JOB]: {
      "continue-on-error": true,
      steps: [
        { run: `npx --yes --package "@a11ign/toolchain@1" boundary-check --root=. --baseline=${BASELINE} --out=${REPORT}` },
        { uses: "actions/upload-artifact@v7", with: { path: REPORT } },
      ],
    },
    gate: { needs: ["changed", "ts"] },
  },
});
const intactExists = (path: string) => path === BASELINE;

test("ci.yml reports the boundary as a non-blocking job against the committed baseline", () => {
  assert.deepEqual(refusalsOf(ci, onDisk), []);
});

test("the baseline the job names exists, and is a non-empty list (the control for a vacuous 'accepted')", () => {
  const entries = JSON.parse(readFileSync(join(REPO, BASELINE), "utf8")) as unknown[];
  assert.ok(Array.isArray(entries) && entries.length > 0, `${BASELINE} is empty or not a list`);
});

test("package.json pins a toolchain release that carries the boundary-check bin", () => {
  const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as { devDependencies: Record<string, string> };
  const pinned = pkg.devDependencies["@a11ign/toolchain"];
  assert.match(pinned, /^\d+\.\d+\.\d+$/, `the pin must be an exact version, got ${pinned}`);
  const parts = pinned.split(".").map(Number);
  const atLeast = parts.findIndex((part, i) => part !== FIRST_RELEASE_WITH_BIN[i]);
  assert.ok(atLeast === -1 || parts[atLeast] > FIRST_RELEASE_WITH_BIN[atLeast], `${pinned} predates ${FIRST_RELEASE_WITH_BIN.join(".")}, which first carried boundary-check`);
});

test("the intact fixture is accepted (the controls below are refusals of a passing shape)", () => {
  assert.deepEqual(refusalsOf(intact(), intactExists), []);
});

test("a workflow without the job is refused", () => {
  const workflow = intact();
  delete workflow.jobs?.[JOB];
  assert.deepEqual(refusalsOf(workflow, intactExists), [`no \`${JOB}\` job`]);
});

test("a job that runs boundary-check without --baseline is refused", () => {
  const workflow = intact();
  workflow.jobs![JOB].steps![0].run = `npx --yes --package @a11ign/toolchain boundary-check --root=. --out=${REPORT}`;
  assert.deepEqual(refusalsOf(workflow, intactExists), ["the job does not run boundary-check with --baseline="]);
});

test("a job naming a baseline that does not exist is refused", () => {
  assert.deepEqual(refusalsOf(intact(), () => false), [`the baseline it names does not exist: ${BASELINE}`]);
});

test("a job naming another baseline that exists is refused", () => {
  const workflow = intact();
  workflow.jobs![JOB].steps![0].run = "boundary-check --root=. --baseline=package.json";
  assert.deepEqual(refusalsOf(workflow, () => true), [`the baseline it names is not ${BASELINE}: package.json`]);
});

test("a job that does not upload the report is refused", () => {
  const workflow = intact();
  workflow.jobs![JOB].steps!.pop();
  assert.deepEqual(refusalsOf(workflow, intactExists), [`the job does not upload ${REPORT}`]);
});

test("a job that is not continue-on-error is refused", () => {
  const workflow = intact();
  delete workflow.jobs![JOB]["continue-on-error"];
  assert.deepEqual(refusalsOf(workflow, intactExists), ["the job is not continue-on-error: true"]);
});

test("a workflow whose gate needs the job is refused, as a list and as a single name", () => {
  const asArray = intact();
  asArray.jobs!.gate.needs = ["changed", JOB];
  const asString = intact();
  asString.jobs!.gate.needs = JOB;
  const expected = ["gate needs the job, so a red report would hold a merge"];
  assert.deepEqual(refusalsOf(asArray, intactExists), expected);
  assert.deepEqual(refusalsOf(asString, intactExists), expected);
});
