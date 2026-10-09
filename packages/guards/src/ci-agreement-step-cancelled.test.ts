/**
 * #4413: the #3211 agreement step in `ci.yml` must not read a run that CONCURRENCY cancelled as a verdict, and a pull-request description edit
 * that touched nothing a check reads must not cost the PR its green. Both pieces are shell inside the workflow, so this runs THAT SHELL, taken
 * out of the parsed `ci.yml` and never retyped here, on fixture run listings behind a fake `gh`:
 *   1. THE AGREEMENT STEP, in both directions of the pair (a code run reading its meta sibling, a meta run reading its code sibling):
 *      a cancelled sibling with a newer replacement yields the REPLACEMENT's verdict; a cancelled sibling alone is no failure; a genuine
 *      `failure` still fails and a `success` still passes (the controls that stop "never fails" from passing).
 *   2. THE PROSE-ONLY CLASSIFIER (`bodyEdit`): an edit differing only in prose is prose-only; one touching the Acceptance block, the Closes line,
 *      a `Field:` line or a section a check reads is not; and each of the refusals that would hide an unchecked edit (a base change, a label
 *      event, an unsettled previous meta run, an unreadable run list) is not.
 *
 * EVERY "does not fail" ASSERTION SITS BESIDE ITS "does fail" TWIN on the same fixture shape, so neither can pass on an empty or inert script.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CI_YML = join(REPO_ROOT, ".github/workflows/ci.yml");

interface Step { id?: string; name?: string; run?: string }
const workflow = parseYaml(readFileSync(CI_YML, "utf8")) as { jobs: Record<string, { steps?: Step[] }> };

function stepScript(job: string, pick: (step: Step) => boolean): string {
  const step = workflow.jobs[job]?.steps?.find(pick);
  assert.ok(step?.run, `ci.yml job ${job} has no step the test can find; the test would be reading nothing`);
  return step.run;
}
const AGREEMENT = stepScript("gate", (s) => s.name?.startsWith("The other kind of run on this head agrees") === true);
const CLASSIFY = stepScript("bodyEdit", (s) => s.id === "classify");

// ---------------------------------------------------------------------------------------------------------------------------------------
// A fake `gh` that answers the two endpoints the scripts read from fixture files, and fails when a fixture is absent.

interface Run { id: number; at: string; meta?: boolean; status?: string; conclusion?: string | null }
interface Job { name: string; status?: string; conclusion?: string | null }

const FAKE_GH = `#!/bin/sh
# usage: gh api <path>
case "$2" in
  */actions/workflows/ci.yml/runs?*) cat "$FIXTURES/runs.json" ;;
  */actions/runs/*/jobs?*) id=\${2#*/actions/runs/}; id=\${id%%/*}; cat "$FIXTURES/jobs-$id.json" ;;
  *) echo "fake gh: unexpected path $2" >&2; exit 2 ;;
esac
`;

interface Fixtures { runs?: Run[]; jobs?: Record<number, Job[]> }
function fixtureDir({ runs, jobs = {} }: Fixtures): string {
  const dir = mkdtempSync(join(tmpdir(), "agreement-"));
  mkdirSync(join(dir, "bin"));
  writeFileSync(join(dir, "bin/gh"), FAKE_GH);
  chmodSync(join(dir, "bin/gh"), 0o755);
  if (runs) {
    const workflow_runs = runs.map((r) => ({
      id: r.id,
      created_at: r.at,
      display_title: r.meta ? "A title [meta event, edited]" : "A title",
      status: r.status ?? "completed",
      conclusion: r.conclusion === undefined ? "success" : r.conclusion,
    }));
    writeFileSync(join(dir, "runs.json"), JSON.stringify({ workflow_runs }));
  }
  for (const [id, list] of Object.entries(jobs)) {
    const full = list.map((j) => ({ status: "completed", conclusion: "success", ...j }));
    writeFileSync(join(dir, `jobs-${id}.json`), JSON.stringify({ jobs: full }));
  }
  return dir;
}

function runScript(script: string, dir: string, env: Record<string, string>): { code: number | null; out: string; output: string } {
  const file = join(dir, "step.sh");
  writeFileSync(file, script);
  const outputFile = join(dir, "github-output");
  writeFileSync(outputFile, "");
  const result = spawnSync("bash", ["-e", file], {
    encoding: "utf8",
    env: { PATH: `${join(dir, "bin")}:${process.env.PATH}`, FIXTURES: dir, GITHUB_OUTPUT: outputFile, REPO: "a11ign/a11ign", HEAD_SHA: "head1", ...env },
  });
  return { code: result.status, out: `${result.stdout}${result.stderr}`, output: readFileSync(outputFile, "utf8") };
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// 1. The agreement step

const T = (n: number) => `2026-10-09T07:${String(n).padStart(2, "0")}:00Z`;
const AGREEMENT_ENV = { ATTEMPTS: "1", POLL_SECONDS: "0" };
const JOBS_OK: Job[] = [{ name: "acceptance" }, { name: "gate", status: "in_progress", conclusion: null }];

function agree(kind: "code" | "meta", self: number, fixtures: Fixtures) {
  return runScript(AGREEMENT, fixtureDir(fixtures), { ...AGREEMENT_ENV, KIND: kind, GITHUB_RUN_ID: String(self) });
}

test("a code run: a cancelled meta sibling is replaced by the newer meta run, whose verdict decides", () => {
  const runs: Run[] = [{ id: 100, at: T(0) }, { id: 101, at: T(1), meta: true, conclusion: "cancelled" }, { id: 102, at: T(2), meta: true }];
  const passes = agree("code", 100, { runs, jobs: { 101: [{ name: "acceptance", conclusion: "cancelled" }], 102: JOBS_OK } });
  assert.equal(passes.code, 0, passes.out);
  assert.match(passes.out, /\(102\) concluded success/);

  const fails = agree("code", 100, { runs, jobs: { 101: JOBS_OK, 102: [{ name: "acceptance", conclusion: "failure" }] } });
  assert.equal(fails.code, 1, "the replacement's own failure must still fail the code run");
  assert.match(fails.out, /\(102\) concluded 'failure'/);
});

test("a code run: a cancelled meta sibling ALONE is not a failure, and names what it skipped", () => {
  const cancelled = agree("code", 100, { runs: [{ id: 100, at: T(0) }, { id: 101, at: T(1), meta: true, conclusion: "cancelled" }] });
  assert.equal(cancelled.code, 0, cancelled.out);
  assert.match(cancelled.out, /cancelled, not counted: '101'/);
  assert.doesNotMatch(cancelled.out, /::error::/);

  const failed = agree("code", 100, { runs: [{ id: 100, at: T(0) }, { id: 101, at: T(1), meta: true, conclusion: "failure" }], jobs: { 101: [{ name: "acceptance", conclusion: "failure" }] } });
  assert.equal(failed.code, 1, "the same shape with `failure` instead of `cancelled` must fail: it is the control");
});

test("a code run: success passes, and a meta run that started BEFORE this code run is not a sibling", () => {
  const passes = agree("code", 100, { runs: [{ id: 100, at: T(5) }, { id: 101, at: T(6), meta: true }], jobs: { 101: JOBS_OK } });
  assert.equal(passes.code, 0, passes.out);
  assert.match(passes.out, /\(101\) concluded success/);
  const earlier = agree("code", 100, { runs: [{ id: 100, at: T(5) }, { id: 101, at: T(1), meta: true, conclusion: "failure" }] });
  assert.equal(earlier.code, 0, "a red meta run older than this code run is out of scope, as before the change");
});

test("a code run: a CANCELLED JOB inside a run still listed as running is pending, never 'concluded cancelled'", () => {
  const runs: Run[] = [{ id: 100, at: T(0) }, { id: 101, at: T(1), meta: true, status: "in_progress", conclusion: null }];
  const raced = agree("code", 100, { runs, jobs: { 101: [{ name: "acceptance", conclusion: "cancelled" }] } });
  assert.equal(raced.code, 1, "one poll never reaches a verdict");
  assert.doesNotMatch(raced.out, /concluded 'cancelled'/);
  assert.match(raced.out, /no conclusion \('pending'\)/);
  const failing = agree("code", 100, { runs, jobs: { 101: [{ name: "acceptance", conclusion: "failure" }] } });
  assert.match(failing.out, /concluded 'failure'/, "the control: the same run with a failed job is read as failed");
});

test("a meta run: a cancelled code sibling is replaced by the newer code run, whose conclusion decides", () => {
  const runs: Run[] = [{ id: 200, at: T(1), conclusion: "cancelled" }, { id: 201, at: T(2) }, { id: 202, at: T(5), meta: true }];
  const passes = agree("meta", 202, { runs });
  assert.equal(passes.code, 0, passes.out);
  assert.match(passes.out, /\(201\) concluded success/);

  const fails = agree("meta", 202, { runs: [runs[0], { id: 201, at: T(2), conclusion: "failure" }, runs[2]] });
  assert.equal(fails.code, 1);
  assert.match(fails.out, /\(201\) concluded 'failure'/);
});

test("a meta run: only cancelled code runs is a MISSING verdict that names the run to re-run, not a failure of the work", () => {
  const out = agree("meta", 202, { runs: [{ id: 200, at: T(1), conclusion: "cancelled" }, { id: 202, at: T(5), meta: true }] });
  assert.equal(out.code, 1, "this meta run cannot be green on work it did not see");
  assert.doesNotMatch(out.out, /concluded 'cancelled'/);
  assert.match(out.out, /no conclusion \('none'\).*not a verdict: 200; re-run the newest of them/);
  const control = agree("meta", 202, { runs: [{ id: 200, at: T(1), conclusion: "failure" }, { id: 202, at: T(5), meta: true }] });
  assert.match(control.out, /concluded 'failure'/, "the control: a failed code run is still reported as the failure it is");
});

// ---------------------------------------------------------------------------------------------------------------------------------------
// 2. The prose-only classifier

const BODY = [
  "Narrative paragraph one, which says why.",
  "",
  "Acceptance:",
  "```bash",
  "npx rstest run packages/guards/src/x.test.ts",
  "```",
  "",
  "Closes #4413",
  "",
  "Class: defect",
  "",
  "## Refutation",
  "It could be wrong because of Y.",
  "",
  "## Notes",
  "Some closing remarks for the reader.",
].join("\n");

const edit = (from: string, after: string) => from.length > 0 && after.length > 0 ? { from, after } : assert.fail("empty body");
const SETTLED: Run[] = [{ id: 300, at: T(0) }, { id: 301, at: T(1), meta: true }, { id: 302, at: T(5), meta: true, status: "in_progress", conclusion: null }];
const CLASSIFY_ENV = { EVENT: "pull_request", ACTION: "edited", BASE_CHANGED: "false", BODY_CHANGED: "true", GITHUB_RUN_ID: "302" };

function classify(change: { from: string; after: string }, overrides: Record<string, string> = {}, fixtures: Fixtures = { runs: SETTLED }) {
  const result = runScript(CLASSIFY, fixtureDir(fixtures), { ...CLASSIFY_ENV, BODY_BEFORE: change.from, BODY_AFTER: change.after, ...overrides });
  assert.equal(result.code, 0, `the classifier must always succeed with an answer: ${result.out}`);
  return { proseOnly: /^proseOnly=true$/m.test(result.output), out: result.out };
}

test("an edit that differs only in prose is prose-only (the positive control for every refusal below)", () => {
  const prose = classify(edit(BODY, BODY.replace("Narrative paragraph one, which says why.", "A rewritten opening, with another point.")));
  assert.equal(prose.proseOnly, true, prose.out);
  const trailing = classify(edit(BODY, BODY.replace("Some closing remarks for the reader.", "Other remarks.\n\nAnd a new paragraph.")));
  assert.equal(trailing.proseOnly, true, "prose under a heading no check reads");
  const windows = classify(edit(BODY, BODY.replace(/\n/g, "\r\n").replace("paragraph one", "paragraph 1")));
  assert.equal(windows.proseOnly, true, "CRLF is not a difference");
});

test("an edit that touches the Acceptance block, the Closes line, a field or a read section is NOT prose-only", () => {
  const touched: Record<string, string> = {
    "the Acceptance command": BODY.replace("x.test.ts", "y.test.ts"),
    "a new line in the fence": BODY.replace("```bash\n", "```bash\ntrue\n"),
    "the Closes line": BODY.replace("Closes #4413", "Closes #4414"),
    "a new Closes line": `${BODY}\nCloses #1`,
    "Closes made none": BODY.replace("Closes #4413", "Closes: none -- reason"),
    "a Field: line": BODY.replace("Class: defect", "Class: chore"),
    "text under ## Refutation": BODY.replace("It could be wrong because of Y.", "It could not be wrong."),
    "a heading": BODY.replace("## Notes", "## Mutation"),
    "a GitHub closing keyword": BODY.replace("Some closing remarks for the reader.", "This fixes #9."),
  };
  for (const [what, after] of Object.entries(touched)) {
    const verdict = classify(edit(BODY, after));
    assert.equal(verdict.proseOnly, false, `${what} must be re-checked: ${verdict.out}`);
  }
});

test("a prose edit is still checked when skipping it could hide something", () => {
  const prose = BODY.replace("Narrative paragraph one, which says why.", "A rewritten opening.");
  const change = edit(BODY, prose);
  assert.equal(classify(change).proseOnly, true, "control: the same edit with nothing amiss is prose-only");

  assert.equal(classify(change, { BASE_CHANGED: "true" }).proseOnly, false, "a retarget moves the diff ownedPaths reads");
  assert.equal(classify(change, { ACTION: "labeled" }).proseOnly, false, "a label is never prose (the hold)");
  assert.equal(classify(change, { EVENT: "merge_group", ACTION: "" }).proseOnly, false, "no pull request, no prose edit");

  const cancelledBefore = classify(change, {}, { runs: [{ id: 300, at: T(0) }, { id: 301, at: T(1), meta: true, conclusion: "cancelled" }, SETTLED[2]] });
  assert.equal(cancelledBefore.proseOnly, false, "the edit before this one was cancelled by it, so its change may be unchecked");
  assert.match(cancelledBefore.out, /may be unchecked/);
  const stillRunning = classify(change, {}, { runs: [{ id: 301, at: T(1), meta: true, status: "in_progress", conclusion: null }, SETTLED[2]] });
  assert.equal(stillRunning.proseOnly, false, "an unsettled previous meta run is not a settled one");

  const unreadable = classify(change, {}, {});
  assert.equal(unreadable.proseOnly, false, "a run list that cannot be read is not 'nothing unchecked'");
});

test("a title edit (no body change) is prose-only, and a first meta run on the head has nothing to be unsettled", () => {
  const title = classify({ from: "", after: BODY }, { BODY_CHANGED: "false" });
  assert.equal(title.proseOnly, true, title.out);
  const first = classify(edit(BODY, BODY.replace("paragraph one", "paragraph 1")), {}, { runs: [{ id: 300, at: T(0) }, SETTLED[2]] });
  assert.equal(first.proseOnly, true, first.out);
});
