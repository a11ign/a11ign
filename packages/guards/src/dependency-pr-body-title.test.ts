/**
 * `.github/workflows/dependency-pr-body.yml` auto-declares a Dependabot pull request only when its TITLE matches `title_pattern`, and a
 * title that misses it is silently "not auto-declared": no `Acceptance:` and no `Closes` are written, and `acceptance` and `gate` fail
 * (#5491). Dependabot's own prefix is `deps: bump`, but a11ign#5485 arrived as `deps: Bump @guidepup/setup ...`, the only capital in
 * the last 40, and the lower-case pattern never matched it.
 *
 * The pattern is READ OUT OF THE WORKFLOW rather than copied here, so the test cannot pass against a pattern the workflow does not run.
 * The major-bump refusal lives in the script, not in the pattern, so it is not asserted here.
 *
 * POSITIVE CONTROLS: the lower-case title must match (the pattern was found and works at all), and each non-bump title is paired with
 * the same title as a bump that matches, so an always-false pattern fails the first and an always-true one fails the second.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));

type Workflow = { jobs: Record<string, { steps?: { run?: string }[] }> };

/** The single-quoted bash assignment `title_pattern='...'`, the one place the workflow states what it auto-declares. */
function titlePatternFromWorkflow(): RegExp {
  const workflow = parseYaml(readFileSync(join(REPO, ".github/workflows/dependency-pr-body.yml"), "utf8")) as Workflow;
  const scripts = Object.values(workflow.jobs).flatMap((job) => (job.steps ?? []).map((step) => step.run ?? ""));
  const assignments = scripts.flatMap((script) => [...script.matchAll(/^\s*title_pattern='([^']+)'\s*$/gm)].map((m) => m[1]));
  assert.equal(assignments.length, 1, "exactly one title_pattern assignment is expected in the workflow");
  // bash's ERE and JavaScript agree on every construct this pattern uses (classes, groups, `?`, `+`, `*`, `\.`).
  return new RegExp(assignments[0]);
}

const pattern = titlePatternFromWorkflow();

test("a lower-case Dependabot bump title is auto-declared", () => {
  assert.match("deps: bump x from 1.2.3 to 1.2.4", pattern);
});

test("a capital-B Dependabot bump title is auto-declared (a11ign#5485)", () => {
  assert.match("deps: Bump x from 1.2.3 to 1.2.4", pattern);
  assert.match("deps: Bump @guidepup/setup from 0.29.1 to 0.29.2", pattern);
});

test("a scoped package and an ` in /dir` suffix still match in either case", () => {
  assert.match("deps: bump @scope/pkg from 2.9.0 to 2.9.1 in /packages/example", pattern);
  assert.match("deps: Bump @scope/pkg from 2.9.0 to 2.9.1 in /packages/example", pattern);
});

test("a title that is not a bump is not auto-declared", () => {
  assert.doesNotMatch("chore: update x", pattern);
  assert.doesNotMatch("chore: bump x from 1.2.3 to 1.2.4", pattern);
  assert.doesNotMatch("deps: Update x from 1.2.3 to 1.2.4", pattern);
  assert.doesNotMatch("deps: Bump x", pattern);
});
