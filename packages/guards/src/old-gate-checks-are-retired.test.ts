/**
 * A11-127: the old org's checks that read GitHub rows are retired, and `gate` is green without them.
 *
 * Rows moved to Linear at the ticket-mode cutover and every GitHub copy was closed, so `refusalOwners` ("every owner a refusal names is an open
 * issue") could only fail, and `gate` (the required check) failed with it on every pull request. Two facts follow, and both are read off the PARSED
 * workflow and the real script, never off their text:
 *   1. `ci.yml` has no `refusalOwners` job, `gate` waits for exactly the jobs it reads, and it reads every one of them. A job `gate` needs and never
 *      reads is excused by its own failure, and a read of a job it does not need is always empty, so a half-removed job would leave `gate` green
 *      over a check nobody looks at.
 *   2. `gate:lab-held` still REFUSES (exit 1, naming what it holds) and no longer claims an open row owns what it holds: that row was closed, and
 *      nothing reads the claim now.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

interface Job { needs?: string | string[]; steps?: { run?: string }[] }
const ciJobs = (): Record<string, Job> => (parseYaml(readFileSync(join(REPO_ROOT, ".github/workflows/ci.yml"), "utf8")) as { jobs: Record<string, Job> }).jobs;
const needsOf = (job: Job): string[] => [job.needs ?? []].flat();
const scripts = (): Record<string, string> => (JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;

test("ci.yml: `refusalOwners` is retired, and `gate` waits for the jobs it reads and reads every job it waits for", () => {
  const jobs = ciJobs();
  const gate = jobs["gate"];
  assert.ok(gate, "control: `gate` is found, so the reads below are not over an empty workflow");
  assert.ok(!("refusalOwners" in jobs), "the refusal-owner job is retired with the old gate: rows live in Linear, so every owner it could name reads closed");
  const needs = needsOf(gate);
  assert.ok(needs.includes("acceptance"), "`acceptance` stays in `gate`: it runs the pull request's own `Acceptance:` command, which is not an old-gate check");
  for (const need of needs) assert.ok(need in jobs, `\`gate\` waits for \`${need}\`, which is not a job of ci.yml`);
  const run = (gate.steps ?? []).map((step) => step.run ?? "").join("\n");
  const read = new Set([...run.matchAll(/needs\.([A-Za-z0-9_-]+)\.result/g)].map((match) => match[1]));
  assert.deepEqual([...read].sort(), [...needs].sort(), "`gate` reads the result of every job it waits for and of no other");
});

test("`gate:lab-held` still refuses and names what it holds, and names no GitHub row as its owner", () => {
  const script = scripts()["gate:lab-held"];
  assert.ok(script, "control: the script is found");
  const run = spawnSync("sh", ["-c", `${script} scorer:verify rules:gate`], { encoding: "utf8" });
  assert.equal(run.status, 1, "the refusal keeps its exit code, so a release chain that reaches it stops");
  assert.match(run.stderr, /^REFUSED: scorer:verify, rules:gate are held by a11ign\/lab/, "and it names the gates it holds");
  assert.match(run.stderr, /this chain does not claim they passed/, "and says the chain does not claim them");
  assert.doesNotMatch(run.stderr, /#4425|open row/, "no closed row is named as the owner, and no row is claimed open");
});

test("`release:gate` and `candidate:gate` still reach `gate:lab-held`", () => {
  for (const chain of ["release:gate", "candidate:gate"]) {
    assert.match(scripts()[chain] ?? "", /run gate:lab-held -- /, `${chain} keeps the refusal in its chain`);
  }
});
