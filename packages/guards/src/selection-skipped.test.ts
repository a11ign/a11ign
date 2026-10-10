/**
 * `scripts/selection-skipped.ts` answers, for a first-run red, whether `rstest --changed` SKIPPED the test that failed it (#3576, the
 * regression guard for #3215). It is only worth running if its answers cannot be mistaken for each other, so the tests pin:
 *   1. THE LOG IS READ AS IT IS SHOWN: runner timestamps and colour stripped, each FAIL file once, in order; a roll-up `gate` log names
 *      the sibling run to follow.
 *   2. THE SIX ANSWERS ARE KEPT APART: `gone` before `yes` (a rename is not the policy's fault), a tree-wide guard reads `ci-only` and never
 *      `yes`, a head without the policy is `predates-policy`, an unreadable one `unread`, and a red with no test file `no-test-file`.
 *      A miss anywhere in a run outranks everything else in it.
 *   3. THE COUNTS SUM to the reds, and a report states a `yes` as a thing to act on and a clean window as nothing to widen.
 *   4. THE GIT READS answer from git itself: `containsCommit` tells "not an ancestor" (false) from "could not ask" (throws), and
 *      `affectedAt` merges against `main` as it stood when the run was created, cleans its worktree up, and returns null on a head it cannot fetch.
 *
 * THE POSITIVE CONTROLS: every answer has a trace that yields it and one that yields its neighbour; the null cases of `affectedAt` and
 * `containsCommit` sit beside the success cases in a real throwaway repository.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Answer, FileReading, Run, Trace } from "../../../scripts/selection-skipped.ts";
import { withGitSandbox, type GitSandbox } from "@a11ign/toolchain/lib/git-sandbox";

const skipped = await import("../../../scripts/selection-skipped.ts");
const {
  cleanLine, failingFiles, siblingRunId, skippedByChanged, runAnswer, firstRunReds, windowReading, windowsAround, traceRed,
  countAnswers, lineFor, renderReport, containsCommit, affectedAt,
} = skipped;

const ESCAPE_CODE = 27;
const BOM_CODE = 0xfeff;
const ESC = String.fromCharCode(ESCAPE_CODE);
const BOM = String.fromCharCode(BOM_CODE);
const stamp = "2026-10-05T01:02:03.456Z ";

const SHA = "0123456789abcdef0123456789abcdef01234567";
let nextId = 1;
const run = (overrides: Partial<Run> = {}): Run => ({
  id: nextId++, event: "pull_request", conclusion: "success", head_sha: SHA, head_branch: "branch-a",
  created_at: "2026-10-10T00:00:00Z", head_repository: { full_name: "a11ign/a11ign" }, ...overrides,
});

// ---- the log ---------------------------------------------------------------------------------------------

test("cleanLine strips the runner timestamp (with or without a BOM) and ANSI colour, and nothing else", () => {
  assert.equal(cleanLine(`${stamp}${ESC}[31mFAIL${ESC}[0m  a.test.ts`), "FAIL  a.test.ts");
  assert.equal(cleanLine(`${BOM}${stamp}plain`), "plain");
  assert.equal(cleanLine("2026-10-05 not a timestamp"), "2026-10-05 not a timestamp");
  assert.equal(cleanLine(""), "");
});

test("failingFiles lists each FAIL test file once, in order of appearance, through colour and timestamps", () => {
  const log = [
    `${stamp}${ESC}[1m${ESC}[31m FAIL ${ESC}[0m packages/lab/src/b.test.ts > a case`,
    `${stamp}  FAIL  packages/guards/src/a.test.ts`,
    `${stamp}  FAIL  packages/lab/src/b.test.ts`,
    `${stamp}  FAIL  scripts/c.test.mjs`,
  ].join("\n");
  assert.deepEqual(failingFiles(log), ["packages/lab/src/b.test.ts", "packages/guards/src/a.test.ts", "scripts/c.test.mjs"]);
});

test("failingFiles ignores lines that only mention FAIL, and an empty log", () => {
  assert.deepEqual(failingFiles("the FAIL word in prose\nPASS a.test.ts\nFAIL not-a-test.ts\n"), []);
  assert.deepEqual(failingFiles(""), []);
  assert.deepEqual(failingFiles("  FAIL  a.test.ts"), ["a.test.ts"]); // the positive control for the two empties
});

test("siblingRunId reads the run the roll-up names, and answers null when it names none", () => {
  assert.equal(siblingRunId(`${stamp}error: the pull_request run (12345) concluded 'failure'`), 12345);
  assert.equal(siblingRunId("nothing relevant here"), null);
  assert.equal(siblingRunId(""), null);
});

// ---- the answers -----------------------------------------------------------------------------------------

test("skippedByChanged: gone first, then no (the set held it), then yes (the set did not)", () => {
  const affectedSet = ["a.test.ts"];
  assert.equal(skippedByChanged({ file: "a.test.ts", affectedSet, existsAtHead: () => true }), "no");
  assert.equal(skippedByChanged({ file: "b.test.ts", affectedSet, existsAtHead: () => true }), "yes");
  assert.equal(skippedByChanged({ file: "a.test.ts", affectedSet, existsAtHead: () => false }), "gone"); // a rename is not the policy's fault
});

test("runAnswer: a miss anywhere is a miss, then a held file, then a tree-wide guard, then gone", () => {
  const read = (...answers: FileReading["answer"][]) => answers.map((answer, i) => ({ file: `f${i}`, answer }));
  assert.equal(runAnswer(read("no", "yes", "ci-only", "gone")), "yes");
  assert.equal(runAnswer(read("gone", "ci-only", "no")), "no");
  assert.equal(runAnswer(read("gone", "ci-only")), "ci-only");
  assert.equal(runAnswer(read("gone")), "gone");
  assert.equal(runAnswer([]), "gone");
});

// ---- the rates -------------------------------------------------------------------------------------------

test("firstRunReds returns the first COMPLETED run of each pull request when it failed, and only then", () => {
  const redFirst = run({ id: 101, head_branch: "red-first", conclusion: "failure", created_at: "2026-10-10T00:00:00Z" });
  const redThenGreen = [run({ id: 102, head_branch: "recovers", conclusion: "failure" }), run({ id: 103, head_branch: "recovers", conclusion: "success", created_at: "2026-10-10T01:00:00Z" })];
  const greenThenRed = [run({ id: 104, head_branch: "later-red", conclusion: "success" }), run({ id: 105, head_branch: "later-red", conclusion: "failure", created_at: "2026-10-10T01:00:00Z" })];
  const cancelledFirst = [run({ id: 106, head_branch: "cancelled", conclusion: "cancelled" }), run({ id: 107, head_branch: "cancelled", conclusion: "failure", created_at: "2026-10-10T01:00:00Z" })];
  const onlyCancelled = run({ id: 108, head_branch: "only-cancelled", conclusion: "cancelled" });
  const mergeGroup = run({ id: 109, head_branch: "queue", event: "merge_group", conclusion: "failure" });
  const reds = firstRunReds([redFirst, ...redThenGreen, ...greenThenRed, ...cancelledFirst, onlyCancelled, mergeGroup]);
  assert.deepEqual(reds.map((r: Run) => r.id), [101, 102, 107]);
});

test("firstRunReds of nothing, and of an all-green list, is empty (the positive control is the test above)", () => {
  assert.deepEqual(firstRunReds([]), []);
  assert.deepEqual(firstRunReds([run({ conclusion: "success" })]), []);
});

test("windowReading counts the window's pull requests beside firstRunPassRate over only the window's runs", () => {
  const inside = [run({ head_branch: "p1", conclusion: "success" }), run({ head_branch: "p2", conclusion: "failure" }), run({ head_branch: "p3", conclusion: "cancelled" })];
  const outside = run({ head_branch: "p4", conclusion: "failure", created_at: "2026-11-01T00:00:00Z" });
  const reading = windowReading([...inside, outside], { since: "2026-10-09T00:00:00Z", until: "2026-10-12T00:00:00Z" });
  assert.deepEqual(reading, {
    window: { since: "2026-10-09T00:00:00Z", until: "2026-10-12T00:00:00Z" },
    pullRequests: 3, passed: 1, counted: 2, rate: 0.5,
  });
});

test("windowReading of an empty window has a null rate, not zero", () => {
  const reading = windowReading([], { since: "2026-10-09T00:00:00Z", until: "2026-10-12T00:00:00Z" });
  assert.equal(reading.rate, null);
  assert.equal(reading.pullRequests, 0);
  assert.equal(reading.counted, 0);
});

test("windowsAround is fourteen days either side of the merge, sharing only the merge instant", () => {
  assert.deepEqual(windowsAround("2026-10-05T12:30:00Z"), {
    before: { since: "2026-09-21T12:30:00Z", until: "2026-10-05T12:30:00Z" },
    after: { since: "2026-10-05T12:30:00Z", until: "2026-10-19T12:30:00Z" },
  });
  // across a month and a year boundary
  assert.deepEqual(windowsAround("2027-01-05T00:00:00Z").before.since, "2026-12-22T00:00:00Z");
});

// ---- tracing a red ---------------------------------------------------------------------------------------

type Reader = Parameters<typeof traceRed>[1];
const failLog = (...files: string[]) => files.map((f) => `${stamp}FAIL  ${f}`).join("\n");

/** A reader over canned data. Anything a test does not override reads as "a head that holds the policy, with this affected set". */
function reader(overrides: Record<string, unknown> = {}): Reader {
  const jobs = { 1: failLog("packages/lab/src/a.test.ts") } as Record<number, string>;
  return {
    failedJobs: () => [{ id: 1, name: "ts" }],
    log: (id: number) => jobs[id] ?? "",
    affected: () => ({ set: ["packages/lab/src/other.test.ts"], changed: ["src/changed.ts"], treeWide: [] }),
    exists: () => true,
    hasPolicy: () => true,
    ...overrides,
  } as Reader;
}

test("traceRed: a failing file outside the affected set is YES, and carries the diff that missed it", () => {
  const trace = traceRed(run({ id: 9 }), reader());
  assert.deepEqual(trace, {
    runId: 9, jobs: ["ts"], answer: "yes", why: "", changed: ["src/changed.ts"],
    files: [{ file: "packages/lab/src/a.test.ts", answer: "yes" }],
  });
});

test("traceRed: the same file inside the affected set is NO, with no diff carried", () => {
  const trace = traceRed(run(), reader({ affected: () => ({ set: ["packages/lab/src/a.test.ts"], changed: ["src/x.ts"], treeWide: [] }) }));
  assert.equal(trace.answer, "no");
  assert.deepEqual(trace.changed, []);
});

test("traceRed: a file the head does not hold is GONE, and a tree-wide guard is CI-ONLY, never YES", () => {
  assert.equal(traceRed(run(), reader({ exists: () => false })).answer, "gone");
  const treeWide = traceRed(run(), reader({ affected: () => ({ set: [], changed: ["x"], treeWide: ["packages/lab/src/a.test.ts"] }) }));
  assert.equal(treeWide.answer, "ci-only");
  assert.deepEqual(treeWide.changed, []);
});

test("traceRed: a head without the policy is PREDATES-POLICY and the affected set is never asked for", () => {
  let asked = false;
  const trace = traceRed(run({ head_sha: SHA }), reader({ hasPolicy: () => false, affected: () => { asked = true; return null; } }));
  assert.equal(trace.answer, "predates-policy");
  assert.equal(trace.why, "head 0123456789ab does not contain the local --changed run");
  assert.equal(asked, false);
});

test("traceRed: an affected set that cannot be listed is UNREAD, naming the head", () => {
  const trace = traceRed(run(), reader({ affected: () => null }));
  assert.equal(trace.answer, "unread");
  assert.equal(trace.why, "the affected set at 0123456789ab could not be listed");
});

test("traceRed: jobs that cannot be read are UNREAD", () => {
  const trace = traceRed(run(), reader({ failedJobs: () => null }));
  assert.equal(trace.answer, "unread");
  assert.equal(trace.why, "the run's jobs could not be read");
});

test("traceRed: a failed job with no FAIL file is NO-TEST-FILE; a failed CI-only job beside a test job with no file is CI-ONLY", () => {
  const lint = traceRed(run(), reader({ failedJobs: () => [{ id: 2, name: "lint" }] }));
  assert.equal(lint.answer, "no-test-file");
  assert.equal(lint.why, "failed: lint");
  assert.deepEqual(lint.jobs, ["lint"]);

  // `guardSweep / run` is a reusable workflow's job: its prefix is the CI_ONLY key, so verify never runs it.
  const sweepOnly = traceRed(run(), reader({ failedJobs: () => [{ id: 3, name: "guardSweep / run" }] }));
  assert.equal(sweepOnly.answer, "ci-only");
  assert.equal(sweepOnly.why, "failed: guardSweep / run");
});

test("traceRed ignores a CI-only job's log when a test job also failed", () => {
  const read = reader({
    failedJobs: () => [{ id: 1, name: "ts / run" }, { id: 3, name: "guardSweep / run" }],
    log: (id: number) => (id === 1 ? failLog("a.test.ts") : failLog("sweep.test.ts")),
    affected: () => ({ set: [], changed: [], treeWide: [] }),
  });
  assert.deepEqual(traceRed(run(), read).files.map((f: { file: string }) => f.file), ["a.test.ts"]);
});

test("traceRed follows a roll-up-only failure through the sibling run it names", () => {
  const sibling = 777;
  const read = reader({
    failedJobs: (id: number) => (id === sibling ? [{ id: 1, name: "ts" }] : [{ id: 50, name: "gate" }]),
    log: (id: number) => (id === 50 ? `${stamp}the pull_request run (${sibling}) concluded 'failure'` : failLog("a.test.ts")),
  });
  const trace = traceRed(run({ id: 5 }), read);
  assert.equal(trace.runId, 5);
  assert.equal(trace.answer, "yes");
  assert.equal(trace.why, `(through run ${sibling})`);
});

test("traceRed: a roll-up that names no run, or names itself, is UNREAD and does not loop", () => {
  const none = traceRed(run({ id: 5 }), reader({ failedJobs: () => [{ id: 50, name: "gate" }], log: () => "no sibling named" }));
  assert.equal(none.answer, "unread");
  assert.match(none.why, /only the roll-up `gate` failed and it names no other run to follow/);

  const loop = traceRed(run({ id: 5 }), reader({ failedJobs: () => [{ id: 50, name: "gate" }], log: () => "run (5) concluded 'failure'" }));
  assert.equal(loop.answer, "unread");
});

// ---- the report ------------------------------------------------------------------------------------------

const trace = (answer: Answer, overrides: Partial<Trace> = {}): Trace =>
  ({ runId: nextId++, answer, files: [], jobs: [], why: "", changed: [], ...overrides });

test("countAnswers tallies every one of the seven keys, zero included", () => {
  const counts = countAnswers([trace("yes"), trace("yes"), trace("no"), trace("unread")]);
  assert.deepEqual(counts, { yes: 2, no: 1, gone: 0, "predates-policy": 0, "ci-only": 0, "no-test-file": 0, unread: 1 });
});

test("lineFor prints the files that carry the answer plainly and the others with theirs in brackets; else the reason", () => {
  const files: FileReading[] = [{ file: "a.test.ts", answer: "yes" }, { file: "b.test.ts", answer: "ci-only" }];
  assert.equal(lineFor(trace("yes", { files })), "skipped-by-changed: yes -- a.test.ts, b.test.ts (ci-only)");
  assert.equal(lineFor(trace("unread", { why: "jobs unread" })), "skipped-by-changed: unread -- jobs unread");
  assert.equal(lineFor(trace("no")), "skipped-by-changed: no");
});

type Window = { since: string; until: string };
const reading = (window: Window, figures: { rate: number | null; passed: number; counted: number; pullRequests: number }) => ({ window, ...figures });
const BEFORE = reading({ since: "2026-09-21T00:00:00Z", until: "2026-10-05T00:00:00Z" }, { rate: 0.5, passed: 5, counted: 10, pullRequests: 11 });
const AFTER = reading({ since: "2026-10-05T00:00:00Z", until: "2026-10-19T00:00:00Z" }, { rate: 0.75, passed: 6, counted: 8, pullRequests: 9 });
const report = (overrides: Record<string, unknown> = {}) =>
  renderReport({ merged: "2026-10-05T00:00:00Z", deleted: undefined, before: BEFORE, after: AFTER, traces: [], asOf: "2026-10-20T00:00:00Z", ...overrides });

test("renderReport states both rates as percentages with their numerators and denominators", () => {
  const text = report();
  assert.match(text, /\*\*Before\*\* \(2026-09-21T00:00:00Z to 2026-10-05T00:00:00Z\): \*\*50\.0%\*\* -- 5 of 10 pull requests passed their first completed run \(11 pull requests had a run in the window\)/);
  assert.match(text, /\*\*After\*\* .*\*\*75\.0%\*\* -- 6 of 8/);
  assert.match(report({ after: { ...AFTER, rate: null } }), /\*\*After\*\* .*\*\*n\/a\*\*/);
});

test("renderReport says nothing is widened on a clean window and tells the reader to widen on a yes", () => {
  assert.match(report({ traces: [trace("no")] }), /Nothing answered yes, so nothing is widened by this reading\./);
  const withYes = report({ traces: [trace("yes", { files: [{ file: "a.test.ts", answer: "yes" }], changed: ["src/a.ts", "src/b.ts"] })] });
  assert.match(withYes, /A red answered yes: the input that made the miss goes into `forceRerunTriggers`/);
  assert.match(withYes, /; diff: src\/a\.ts, src\/b\.ts$/m);
  assert.match(withYes, /\*\*First-run reds in the after window: 1\.\*\* Skipped by `--changed`: \*\*1 yes, 0 no\*\*/);
});

test("renderReport caps the diff shown per run at twenty paths", () => {
  const changed = Array.from({ length: 25 }, (_, i) => `f${i}.ts`);
  const text = report({ traces: [trace("yes", { changed })] });
  assert.ok(text.includes("f19.ts"));
  assert.ok(!text.includes("f20.ts"));
});

test("renderReport flags an after window still open at read time, and is silent once it has closed", () => {
  assert.match(report({ asOf: "2026-10-12T00:00:00Z" }), /The after window is still open: it ends 2026-10-19T00:00:00Z, this was read 2026-10-12T00:00:00Z\./);
  assert.doesNotMatch(report(), /still open/);
});

test("renderReport states the deletion's time, and whether it fell outside the after window", () => {
  assert.match(report(), /pass `--deleted=<merge time>` to say when/);
  assert.match(report({ deleted: "2026-10-10T00:00:00Z" }), /merged 2026-10-10T00:00:00Z: the two changes are not separable here\./);
  assert.match(report({ deleted: "2026-09-01T00:00:00Z" }), /merged 2026-09-01T00:00:00Z \(outside the after window\)/);
  assert.match(report({ deleted: "2026-10-19T00:00:00Z" }), /\(outside the after window\)/); // the window's end is exclusive
});

// ---- git -------------------------------------------------------------------------------------------------

const commitFile = (git: GitSandbox, file: string, message: string): string => {
  writeFileSync(join(git.dir, file), message);
  git.run(["add", file]);
  git.commit(message);
  return git.run(["rev-parse", "HEAD"]).trim();
};

test("containsCommit: an ancestor is true, a non-ancestor is false, and a failure to ask throws", () => {
  withGitSandbox((git) => {
    git.run(["checkout", "-q", "-b", "main"]);
    const first = commitFile(git, "a.txt", "first");
    const second = commitFile(git, "b.txt", "second");
    git.run(["checkout", "-q", "-b", "side", first]);
    const side = commitFile(git, "c.txt", "side");
    assert.equal(containsCommit({ head: second, commit: first, cwd: git.dir }), true);
    assert.equal(containsCommit({ head: first, commit: second, cwd: git.dir }), false);
    assert.equal(containsCommit({ head: side, commit: second, cwd: git.dir }), false);
    assert.throws(() => containsCommit({ head: second, commit: "0".repeat(40), cwd: git.dir }), /Command failed/);
  });
});

/** A work repository whose `origin` is a bare repository beside it, with `main` pushed and a feature branch pushed from `main`'s first commit. */
function withOrigin(fn: (git: GitSandbox, shas: { base: string; head: string }) => void): void {
  const origin = mkdtempSync(join(tmpdir(), "selection-skipped-origin-"));
  try {
    withGitSandbox((git) => {
      git.run(["init", "--quiet", "--bare", origin]);
      git.run(["checkout", "-q", "-b", "main"]);
      const base = commitFile(git, "base.txt", "base");
      commitFile(git, "later-on-main.txt", "main moves on");
      git.run(["remote", "add", "origin", origin]);
      git.run(["push", "-q", "origin", "main"]);
      git.run(["checkout", "-q", "-b", "feature", base]);
      const head = commitFile(git, "feature.txt", "feature");
      git.run(["push", "-q", "origin", "feature"]);
      fn(git, { base, head });
    });
  } finally {
    rmSync(origin, { recursive: true, force: true });
  }
}

test("affectedAt merges against main as it stood at the run, lists inside a real worktree, and removes it afterwards", () => {
  withOrigin((git, { base, head }) => {
    const seen: { tree?: string; mergeBase?: string; existedDuringList?: boolean; treeFile?: boolean } = {};
    const result = affectedAt({
      red: { head_sha: head, created_at: "2099-01-01T00:00:00Z" },
      cwd: git.dir,
      list: ({ tree, mergeBase }: { tree: string; mergeBase: string }) => {
        Object.assign(seen, { tree, mergeBase, existedDuringList: existsSync(tree), treeFile: existsSync(join(tree, "feature.txt")) });
        return ["packages/x/y.test.ts"];
      },
      treeWide: () => ["packages/guards/src/z.test.ts"],
    });
    assert.deepEqual(result, { set: ["packages/x/y.test.ts"], changed: ["feature.txt"], treeWide: ["packages/guards/src/z.test.ts"], mergeBase: base });
    assert.equal(seen.mergeBase, base);
    assert.equal(seen.existedDuringList, true);
    assert.equal(seen.treeFile, true); // the worktree is the HEAD's tree
    assert.equal(existsSync(seen.tree as string), false);
    assert.doesNotMatch(git.run(["worktree", "list"]), /selection-skipped-/);
  });
});

test("affectedAt answers null, naming the head on stderr, for a head it cannot fetch (the control is the test above)", () => {
  withOrigin((git) => {
    const written: string[] = [];
    const realWrite = process.stderr.write;
    process.stderr.write = ((chunk: string) => { written.push(String(chunk)); return true; }) as typeof process.stderr.write;
    try {
      const missing = "f".repeat(40);
      const result = affectedAt({ red: { head_sha: missing, created_at: "2099-01-01T00:00:00Z" }, cwd: git.dir, list: () => [], treeWide: () => [] });
      assert.equal(result, null);
      assert.match(written.join(""), new RegExp(`selection-skipped: affected set at ${missing} unread: `));
    } finally {
      process.stderr.write = realWrite;
    }
  });
});
