/**
 * THE WHOLE-REPO COVERAGE FLOOR IS ENFORCED ON THE PULL REQUEST, IN THE ONE TEST RUN (#3999, outcome 3, follows #3993).
 *
 * It used to be read only by `release.yml` and `nightly.yml`, so a floor that had been wrong since the packages left was found
 * by two RELEASE runs, where nobody who caused it could act. The `ts` job of `ci.yml` calls `reusable-build-test.yml` with
 * `run-coverage: true`, and that file's unit-test step runs `pnpm run coverage` (the same glob as `test:all`, under coverage,
 * failing under `.c8rc.json`'s thresholds) instead of `test:all`: ONE run, never a second.
 *
 * Pinned by PARSING both files, so a comment that names the command satisfies nothing. The positive control for each property is
 * a fixture with that one thing broken, which the checker must refuse by name; `[]` for the real files proves nothing alone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const CI = join(REPO, ".github/workflows/ci.yml");
const REUSABLE = join(REPO, ".github/workflows/reusable-build-test.yml");

interface Step { name?: string; run?: string; if?: string }
interface Workflow {
  on?: { workflow_call?: { inputs?: Record<string, { default?: boolean }> } };
  jobs?: Record<string, { uses?: string; with?: Record<string, unknown>; steps?: Step[] }>;
}

const read = (path: string): Workflow => parse(readFileSync(path, "utf8")) as Workflow;
const unitTestStep = (reusable: Workflow): Step | undefined => reusable.jobs?.run?.steps?.find((step) => step.name === "Unit tests");

function callerRefusals(ci: Workflow): string[] {
  const ts = ci.jobs?.ts;
  const found: string[] = [];
  if (!ts?.uses?.endsWith("reusable-build-test.yml")) found.push("ci.yml's `ts` job does not call reusable-build-test.yml");
  if (ts?.with?.["run-coverage"] !== true) found.push("ci.yml's `ts` job does not pass `run-coverage: true`");
  if (ts?.with?.["run-ts-tests"] !== true) found.push("ci.yml's `ts` job does not pass `run-ts-tests: true`, which `run-coverage` rides on");
  return found;
}

function stepRefusals(step: Step): string[] {
  const found: string[] = [];
  if (!/pnpm run coverage\b/.test(step.run ?? "")) found.push("the `Unit tests` step cannot run `pnpm run coverage`");
  if (!/pnpm run test:all\b/.test(step.run ?? "")) found.push("the `Unit tests` step no longer falls back to `pnpm run test:all` for the callers that did not ask for coverage");
  return found;
}

function reusableRefusals(reusable: Workflow): string[] {
  const step = unitTestStep(reusable);
  if (!step) return ["reusable-build-test.yml has no `Unit tests` step"];
  const found = stepRefusals(step);
  if (reusable.on?.workflow_call?.inputs?.["run-coverage"]?.default !== false) found.push("`run-coverage` is not an input defaulting to false, so trunk-guard's caller would change meaning");
  const second = (reusable.jobs?.run?.steps ?? []).filter((other) => other !== step && /pnpm run (coverage|test:all)\b/.test(other.run ?? ""));
  if (second.length > 0) found.push("a second step runs the suite again, so the floor is not in the SAME run");
  return found;
}

const refusals = (ci: Workflow, reusable: Workflow): string[] => [...callerRefusals(ci), ...reusableRefusals(reusable)];

const broken = (edit: (ci: Workflow, reusable: Workflow) => void): string[] => {
  const ci = parse(stringify(read(CI))) as Workflow;
  const reusable = parse(stringify(read(REUSABLE))) as Workflow;
  edit(ci, reusable);
  return refusals(ci, reusable);
};

test("the real `ts` job enforces the coverage floor in its one test run", () => {
  assert.deepEqual(refusals(read(CI), read(REUSABLE)), []);
});

test("positive control: the unit-test step exists, so the emptiness above is not a missing step", () => {
  assert.ok(unitTestStep(read(REUSABLE))?.run, "reusable-build-test.yml carries a `Unit tests` step with a command");
});

test("`ts` without `run-coverage: true` is REFUSED", () => {
  assert.deepEqual(broken((ci) => { delete ci.jobs!.ts.with!["run-coverage"]; }), ["ci.yml's `ts` job does not pass `run-coverage: true`"]);
});

test("a `Unit tests` step that cannot run coverage is REFUSED", () => {
  assert.deepEqual(broken((_ci, reusable) => { unitTestStep(reusable)!.run = "pnpm run test:all"; }), ["the `Unit tests` step cannot run `pnpm run coverage`"]);
});

test("a `Unit tests` step that always runs coverage, so trunk-guard's run changes too, is REFUSED", () => {
  assert.deepEqual(broken((_ci, reusable) => { unitTestStep(reusable)!.run = "pnpm run coverage"; }),
    ["the `Unit tests` step no longer falls back to `pnpm run test:all` for the callers that did not ask for coverage"]);
});

test("a second step that re-runs the suite is REFUSED: the floor must be in the SAME run", () => {
  assert.deepEqual(broken((_ci, reusable) => { reusable.jobs!.run.steps!.push({ name: "again", run: "pnpm run coverage" }); }),
    ["a second step runs the suite again, so the floor is not in the SAME run"]);
});

test("`run-coverage` defaulting to true is REFUSED", () => {
  assert.deepEqual(broken((_ci, reusable) => { reusable.on!.workflow_call!.inputs!["run-coverage"].default = true; }),
    ["`run-coverage` is not an input defaulting to false, so trunk-guard's caller would change meaning"]);
});
