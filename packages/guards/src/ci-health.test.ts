/**
 * `scripts/ci-health.ts` reads CI health per repository against `docs/ci-targets.json`. Its definitions are pure functions over a run list, so
 * this pins them without a network or a clock (every date is passed in).
 *
 * What has to hold or the weekly table quietly says something false:
 *   1. A PULL REQUEST IS A HEAD BRANCH (with its head repository), and only `pull_request` runs belong to one.
 *   2. A CANCELLED RUN IS NOT A VERDICT: it is out of the pass rate's denominator but IN the runs-per-pull-request count.
 *   3. A RATE WITH NOTHING UNDER IT IS null, never 0, and a rate with too little under it is UNREAD, never MET.
 *   4. THE FAILED-JOB BREAKDOWN SUMS to the failed-run count it is printed beside; unread jobs are not an empty set.
 *   5. THE WINDOW is seven whole UTC days, sliced one day at a time (the endpoint caps a filtered search at 1,000 runs), end exclusive.
 *   6. A TARGET THAT NAMES NO BOUND is refused when the file is read, not when a reading first needs it.
 *
 * THE POSITIVE CONTROLS: every emptiness assertion sits beside a case that yields the non-empty answer from the same function.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const ci = await import(pathToFileURL(join(REPO_ROOT, "scripts/ci-health.ts")).href);

const MINIMUM = 2;
const RATIO_TARGET = { label: "Pass", unit: "ratio", atLeast: 0.8 };
const COUNT_TARGET = { label: "Runs", unit: "count", atMost: 2 };
const DOLLAR_TARGET = { label: "Cost", unit: "dollars", below: 2.5 };

interface RunInput { id: number; event?: string; conclusion?: string | null; branch?: string; sha?: string; at?: string; repo?: string }

/** A run as the endpoint returns it, with only the fields the definitions read. */
function run({ id, event = "pull_request", conclusion = "success", branch = "feat", sha = `sha${id}`, at = "2026-10-01T10:00:00Z", repo = "a11ign/a11ign" }: RunInput) {
  return { id, event, conclusion, head_sha: sha, head_branch: branch, created_at: at, head_repository: { full_name: repo } };
}

const TARGETS = {
  workflow: "ci.yml",
  reportOn: { repository: "a11ign/a11ign", issue: 928 },
  repositories: ["a11ign/a11ign"],
  minimumPullRequests: MINIMUM,
  targets: {
    firstRunPassRate: RATIO_TARGET,
    mergeQueueFailureRate: { label: "Queue failure", unit: "ratio", below: 0.05 },
    ciRunsPerPullRequest: COUNT_TARGET,
    callsPerMergedPullRequest: { label: "Calls", unit: "count", atMost: 70, readBy: "the token row" },
    dollarsPerMergedPullRequest: DOLLAR_TARGET,
  },
};

test("completed: only success and failure reached a verdict", () => {
  assert.equal(ci.completed(run({ id: 1, conclusion: "success" })), true);
  assert.equal(ci.completed(run({ id: 2, conclusion: "failure" })), true);
  assert.equal(ci.completed(run({ id: 3, conclusion: "cancelled" })), false);
  assert.equal(ci.completed(run({ id: 4, conclusion: null })), false);
});

test("pullRequestKey: the head repository and branch, so two forks' patch-1 are two", () => {
  const a = ci.pullRequestKey(run({ id: 1, branch: "patch-1", repo: "alice/a11ign" }));
  const b = ci.pullRequestKey(run({ id: 2, branch: "patch-1", repo: "bob/a11ign" }));
  assert.equal(a, "alice/a11ign#patch-1");
  assert.notEqual(a, b);
  assert.equal(ci.pullRequestKey({ ...run({ id: 3, branch: "x" }), head_repository: null }), "#x");
});

test("pullRequestGroups: groups by pull request, oldest first, ties broken by id, ignoring other events", () => {
  const groups = ci.pullRequestGroups([
    run({ id: 3, branch: "a", at: "2026-10-01T12:00:00Z" }),
    run({ id: 2, branch: "a", at: "2026-10-01T10:00:00Z" }),
    run({ id: 1, branch: "a", at: "2026-10-01T10:00:00Z" }),
    run({ id: 4, branch: "b" }),
    run({ id: 5, branch: "a", event: "merge_group" }),
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].map((r: { id: number }) => r.id), [1, 2, 3]);
  assert.deepEqual(groups[1].map((r: { id: number }) => r.id), [4]);
});

test("pullRequestGroups: no pull_request runs yields no groups (control: one run yields one)", () => {
  assert.deepEqual(ci.pullRequestGroups([run({ id: 1, event: "push" }), run({ id: 2, event: "merge_group" })]), []);
  assert.equal(ci.pullRequestGroups([run({ id: 3 })]).length, 1);
});

test("ratio: null, never 0, when there is nothing to divide by", () => {
  assert.equal(ci.ratio(0, 0), null);
  assert.equal(ci.ratio(0, 4), 0);
  assert.equal(ci.ratio(1, 4), 0.25);
});

test("firstRunPassRate: the FIRST completed run decides, and a cancelled run is skipped", () => {
  const runs = [
    run({ id: 1, branch: "red-then-green", conclusion: "failure", at: "2026-10-01T01:00:00Z" }),
    run({ id: 2, branch: "red-then-green", conclusion: "success", at: "2026-10-01T02:00:00Z" }),
    run({ id: 3, branch: "cancelled-then-green", conclusion: "cancelled", at: "2026-10-01T01:00:00Z" }),
    run({ id: 4, branch: "cancelled-then-green", conclusion: "success", at: "2026-10-01T02:00:00Z" }),
    run({ id: 5, branch: "green", conclusion: "success" }),
    run({ id: 6, branch: "only-cancelled", conclusion: "cancelled" }),
  ];
  assert.deepEqual(ci.firstRunPassRate(runs), { passed: 2, counted: 3, rate: 2 / 3 });
});

test("firstRunPassRate: nothing completed is a null rate, not 0% (control: a pass is 1)", () => {
  assert.deepEqual(ci.firstRunPassRate([]), { passed: 0, counted: 0, rate: null });
  assert.deepEqual(ci.firstRunPassRate([run({ id: 1, conclusion: "cancelled" })]), { passed: 0, counted: 0, rate: null });
  assert.equal(ci.firstRunPassRate([run({ id: 2 })]).rate, 1);
});

test("mergeQueueFailureRate: only completed merge_group runs count", () => {
  const runs = [
    run({ id: 1, event: "merge_group", conclusion: "failure" }),
    run({ id: 2, event: "merge_group", conclusion: "success" }),
    run({ id: 3, event: "merge_group", conclusion: "success" }),
    run({ id: 4, event: "merge_group", conclusion: "success" }),
    run({ id: 5, event: "merge_group", conclusion: "cancelled" }),
    run({ id: 6, event: "pull_request", conclusion: "failure" }),
  ];
  assert.deepEqual(ci.mergeQueueFailureRate(runs), { failed: 1, completed: 4, rate: 0.25 });
});

test("mergeQueueFailureRate: no queue runs is a null rate (control: a pull_request failure alone does not enter)", () => {
  const empty = { failed: 0, completed: 0, rate: null };
  assert.deepEqual(ci.mergeQueueFailureRate([]), empty);
  assert.deepEqual(ci.mergeQueueFailureRate([run({ id: 1, conclusion: "failure" })]), empty);
  assert.equal(ci.mergeQueueFailureRate([run({ id: 2, event: "merge_group", conclusion: "failure" })]).rate, 1);
});

test("runsPerPullRequest: counts cancelled runs and repeats of an already-tested head", () => {
  const runs = [
    run({ id: 1, branch: "a", sha: "s1", conclusion: "cancelled", at: "2026-10-01T01:00:00Z" }),
    run({ id: 2, branch: "a", sha: "s1", conclusion: "cancelled", at: "2026-10-01T02:00:00Z" }),
    run({ id: 3, branch: "a", sha: "s1", conclusion: "failure", at: "2026-10-01T03:00:00Z" }),
    run({ id: 4, branch: "a", sha: "s2", conclusion: "success", at: "2026-10-01T04:00:00Z" }),
    run({ id: 5, branch: "b", sha: "s1", conclusion: "success" }),
    run({ id: 6, branch: "b", event: "push" }),
  ];
  assert.deepEqual(ci.runsPerPullRequest(runs), {
    runs: 5, pullRequests: 2, perPullRequest: 2.5, cancelled: 2, failed: 1, alreadyTestedHead: 2, alreadyTestedHeadCancelled: 1,
  });
});

test("runsPerPullRequest: no pull requests is a null per-pull-request figure", () => {
  assert.deepEqual(ci.runsPerPullRequest([]), {
    runs: 0, pullRequests: 0, perPullRequest: null, cancelled: 0, failed: 0, alreadyTestedHead: 0, alreadyTestedHeadCancelled: 0,
  });
});

test("failedJobBreakdown: a run is counted once under the set that failed, so the combinations sum to the failed runs", () => {
  const breakdown = ci.failedJobBreakdown([
    { id: 1, failedJobs: ["ts / run", "lint"] },
    { id: 2, failedJobs: ["lint", "ts / run"] },
    { id: 3, failedJobs: ["lint"] },
    { id: 4, failedJobs: ["gate"] },
    { id: 5, failedJobs: null },
    { id: 6, failedJobs: ["lint", "lint / matrix"] },
  ]);
  assert.equal(breakdown.failedRuns, 6);
  assert.equal(breakdown.summed, 6);
  assert.deepEqual(breakdown.combinations, [
    { jobs: "lint + ts", runs: 2 },
    { jobs: "lint", runs: 2 },
    { jobs: ci.JOBS_NOT_READ, runs: 1 },
    { jobs: ci.ROLL_UP_ONLY, runs: 1 },
  ].sort((a, b) => b.runs - a.runs || a.jobs.localeCompare(b.jobs)));
  // byJob does NOT sum: run 1 and 2 each failed in two jobs. The roll-up and unread runs add nothing.
  assert.deepEqual(breakdown.byJob, [{ jobs: "lint", runs: 4 }, { jobs: "ts", runs: 2 }]);
});

test("failedJobBreakdown: no failed runs is an empty breakdown (control: one failed run is not)", () => {
  assert.deepEqual(ci.failedJobBreakdown([]), { failedRuns: 0, combinations: [], byJob: [], summed: 0 });
  assert.equal(ci.failedJobBreakdown([{ id: 1, failedJobs: ["lint"] }]).combinations.length, 1);
});

test("verdictOf: each bound reads at its edge, and the strictness differs", () => {
  const verdict = (target: object, value: number | null, enough = true) => ci.verdictOf({ value, target, enough });
  assert.equal(verdict({ label: "x", unit: "ratio", atLeast: 0.8 }, 0.8), "MET");
  assert.equal(verdict({ label: "x", unit: "ratio", atLeast: 0.8 }, 0.79), "MISSED");
  assert.equal(verdict({ label: "x", unit: "count", atMost: 2 }, 2), "MET");
  assert.equal(verdict({ label: "x", unit: "count", atMost: 2 }, 2.1), "MISSED");
  assert.equal(verdict({ label: "x", unit: "ratio", below: 0.05 }, 0.05), "MISSED");
  assert.equal(verdict({ label: "x", unit: "ratio", below: 0.05 }, 0.049), "MET");
});

test("verdictOf: no value, or too little behind it, is UNREAD even when the value would meet", () => {
  assert.equal(ci.verdictOf({ value: null, target: RATIO_TARGET, enough: true }), "UNREAD");
  assert.equal(ci.verdictOf({ value: 1, target: RATIO_TARGET, enough: false }), "UNREAD");
  assert.equal(ci.verdictOf({ value: 1, target: RATIO_TARGET, enough: true }), "MET");
});

test("verdictOf: a target with no bound is refused by name", () => {
  assert.throws(() => ci.verdictOf({ value: 1, target: { label: "Loose", unit: "count" }, enough: true }), /target "Loose" names none of atLeast, atMost, below/);
});

test("targetText: words each bound in its unit", () => {
  assert.equal(ci.targetText(RATIO_TARGET), "at least 80.0%");
  assert.equal(ci.targetText(COUNT_TARGET), "at most 2");
  assert.equal(ci.targetText(DOLLAR_TARGET), "under $2.50");
  assert.equal(ci.targetText({ label: "x", unit: "count", atMost: 70.04 }), "at most 70");
});

test("targetsFrom: accepts the committed targets file, and refuses one whose target has no bound", () => {
  const committed = JSON.parse(readFileSync(ci.TARGETS_FILE, "utf8"));
  assert.equal(ci.targetsFrom(committed), committed);
  assert.ok(Object.keys(committed.targets).length > 0);
  const broken = { ...TARGETS, targets: { ...TARGETS.targets, loose: { label: "Loose", unit: "count" } } };
  assert.throws(() => ci.targetsFrom(broken), /Loose/);
});

test("readRepository: builds all five rows, the two other rows' targets printed as not read here", () => {
  const runs = [
    run({ id: 1, branch: "a", conclusion: "failure", at: "2026-10-01T01:00:00Z" }),
    run({ id: 2, branch: "a", conclusion: "success", at: "2026-10-01T02:00:00Z" }),
    run({ id: 3, branch: "b" }),
    run({ id: 4, event: "merge_group", branch: "queue" }),
  ];
  const failedRuns = [{ id: 1, event: "pull_request", failedJobs: ["lint"] }];
  const reading = ci.readRepository({ repository: "a11ign/a11ign", runs, failedRuns, targets: TARGETS });
  assert.equal(reading.rows.length, 5);
  assert.deepEqual(reading.rows[0], {
    measure: "Pass", target: "at least 80.0%", reading: "50.0%",
    count: "1 of 2 pull requests with a completed run passed first (2 pull requests in the window)", verdict: "MISSED",
  });
  assert.equal(reading.rows[1].reading, "0.0%");
  assert.equal(reading.rows[1].verdict, "UNREAD"); // one queue run is under the minimum of two
  assert.equal(reading.rows[2].reading, "1.5");
  assert.equal(reading.rows[2].verdict, "MET");
  assert.deepEqual(reading.rows[3], { measure: "Calls", target: "at most 70", reading: "not read here", count: "read by the token row", verdict: "UNREAD" });
  assert.equal(reading.rows[4].count, "read by another row"); // this target carries no readBy
  assert.equal(reading.per.pullRequests, 2);
  assert.equal(reading.queueCompleted, 1);
  assert.equal(reading.breakdowns.pull_request.failedRuns, 1);
  assert.equal(reading.breakdowns.merge_group.failedRuns, 0);
});

test("readRepository: an empty week reads as no reading and UNREAD, never 0% MISSED", () => {
  const reading = ci.readRepository({ repository: "a11ign/a11ign", runs: [], failedRuns: [], targets: TARGETS });
  for (const row of reading.rows.slice(0, 3)) {
    assert.equal(row.reading, "no reading");
    assert.equal(row.verdict, "UNREAD");
  }
});

test("readRepository: a notReadHere target without readBy falls back to another row", () => {
  const targets = { ...TARGETS, targets: { ...TARGETS.targets, callsPerMergedPullRequest: { label: "Calls", unit: "count", atMost: 70 } } };
  const reading = ci.readRepository({ repository: "r", runs: [], failedRuns: [], targets });
  assert.equal(reading.rows[3].count, "read by another row");
});

test("commentHeading and alreadyPosted: a re-run of the same week finds its own heading", () => {
  const heading = ci.commentHeading({ date: "2026-09-30" });
  assert.equal(heading, "## CI health, week of 2026-09-30");
  assert.equal(ci.alreadyPosted([`unrelated`, `${heading}\n\nbody`], heading), true);
  assert.equal(ci.alreadyPosted(["unrelated", `text ${heading}`], heading), false); // must START with it
  assert.equal(ci.alreadyPosted([], heading), false);
});

test("renderComment: names the window, commit and rate limit, then each repository's table and breakdowns", () => {
  const runs = [run({ id: 1, branch: "a", conclusion: "failure" }), run({ id: 2, branch: "b" })];
  const failedRuns = [{ id: 1, event: "pull_request", failedJobs: ["ts / run", "gate"] }];
  const readings = [ci.readRepository({ repository: "a11ign/a11ign", runs, failedRuns, targets: TARGETS })];
  const text = ci.renderComment({
    date: "2026-09-30", window: { since: "2026-09-30T00:00:00Z", until: "2026-10-07T00:00:00Z" }, commit: "abc123", rateLimit: "4999 of 5000", readings,
  });
  const lines = text.split("\n");
  assert.equal(lines[0], "## CI health, week of 2026-09-30");
  assert.match(text, /created from 2026-09-30T00:00:00Z to 2026-10-07T00:00:00Z \(UTC, end exclusive\)/);
  assert.match(text, /`scripts\/ci-health\.mjs` at `abc123`\. Rate limit seen: 4999 of 5000\./);
  assert.match(text, /### a11ign\/a11ign/);
  assert.match(text, /\| Pass \| at least 80\.0% \| 50\.0% \| 1 of 2 pull requests/);
  assert.match(text, /\*\*MISSED\*\*/);
  assert.match(text, /Runs on a head an earlier run of the same pull request had already tested: 0 of 2, 0 of them cancelled\./);
  assert.doesNotMatch(text, /UNREAD above/); // two pull requests meet the minimum of two
  assert.match(text, /\| ts \| 1 \|/);
  assert.match(text, /\| \*\*Total\*\* \| \*\*1\*\* \(of 1 failed runs\)/);
  assert.match(text, /Runs each job failed in \(a run can fail several, so this does not sum\): ts 1\./);
  assert.match(text, /Failed `merge_group` runs: 0\./);
});

test("renderComment: a week below the minimum says UNREAD above; a failed run with only the roll-up says so (control for both)", () => {
  const thin = ci.readRepository({ repository: "r", runs: [run({ id: 1 })], failedRuns: [], targets: TARGETS });
  const text = ci.renderComment({ date: "d", window: { since: "s", until: "u" }, commit: "c", rateLimit: "l", readings: [thin] });
  assert.match(text, /UNREAD above: 1 pull requests is under the 2 a rate needs\./);
  const rollUp = ci.readRepository({
    repository: "r", runs: [], targets: TARGETS, failedRuns: [{ id: 9, event: "merge_group", failedJobs: ["gate"] }],
  });
  assert.match(ci.renderComment({ date: "d", window: { since: "s", until: "u" }, commit: "c", rateLimit: "l", readings: [rollUp] }), new RegExp(`\\| ${ci.ROLL_UP_ONLY.replace(/[()`]/g, "\\$&")} \\| 1 \\|`));
  const enough = ci.readRepository({ repository: "r", runs: [run({ id: 1, branch: "a" }), run({ id: 2, branch: "b" })], failedRuns: [], targets: TARGETS });
  assert.doesNotMatch(ci.renderComment({ date: "d", window: { since: "s", until: "u" }, commit: "c", rateLimit: "l", readings: [enough] }), /UNREAD above/);
});

test("weeklyWindow: the seven whole UTC days before now's day, the same for any hour of it", () => {
  const expected = { since: "2026-09-30T00:00:00Z", until: "2026-10-07T00:00:00Z" };
  assert.deepEqual(ci.weeklyWindow(new Date("2026-10-07T00:00:00Z")), expected);
  assert.deepEqual(ci.weeklyWindow(new Date("2026-10-07T23:59:59Z")), expected);
  assert.deepEqual(ci.weeklyWindow(new Date("2026-10-08T00:00:00Z")), { since: "2026-10-01T00:00:00Z", until: "2026-10-08T00:00:00Z" });
});

test("weeklyWindow: crosses a month and a year boundary", () => {
  assert.deepEqual(ci.weeklyWindow(new Date("2027-01-03T08:00:00Z")), { since: "2026-12-27T00:00:00Z", until: "2027-01-03T00:00:00Z" });
});

test("daySlices: one filter per UTC day, each ending a second before the next begins", () => {
  assert.deepEqual(ci.daySlices({ since: "2026-10-01T00:00:00Z", until: "2026-10-03T00:00:00Z" }), [
    "2026-10-01T00:00:00Z..2026-10-01T23:59:59Z",
    "2026-10-02T00:00:00Z..2026-10-02T23:59:59Z",
  ]);
  assert.equal(ci.daySlices(ci.weeklyWindow(new Date("2026-10-07T09:00:00Z"))).length, 7);
});

test("daySlices: an empty window has no slices (control: a one-day window has one)", () => {
  assert.deepEqual(ci.daySlices({ since: "2026-10-01T00:00:00Z", until: "2026-10-01T00:00:00Z" }), []);
  assert.equal(ci.daySlices({ since: "2026-10-01T00:00:00Z", until: "2026-10-02T00:00:00Z" }).length, 1);
});

test("inWindow: since is in, until is out", () => {
  const window = { since: "2026-10-01T00:00:00Z", until: "2026-10-02T00:00:00Z" };
  const kept = ci.inWindow([
    run({ id: 1, at: "2026-09-30T23:59:59Z" }),
    run({ id: 2, at: "2026-10-01T00:00:00Z" }),
    run({ id: 3, at: "2026-10-01T23:59:59Z" }),
    run({ id: 4, at: "2026-10-02T00:00:00Z" }),
  ], window);
  assert.deepEqual(kept.map((r: { id: number }) => r.id), [2, 3]);
});

test("parseInclude: splits `gh api -i` into lower-cased headers and a JSON body", () => {
  const text = "HTTP/2.0 200 OK\r\nX-Ratelimit-Remaining: 4999\r\nx-ratelimit-resource: core\r\nContent-Type: application/json; charset=utf-8\r\n\r\n{\"total_count\": 2}\n";
  const { headers, body } = ci.parseInclude(text);
  assert.equal(headers.get("x-ratelimit-remaining"), "4999");
  assert.equal(headers.get("x-ratelimit-resource"), "core");
  assert.equal(headers.get("content-type"), "application/json; charset=utf-8");
  assert.deepEqual(body, { total_count: 2 });
});

test("parseInclude: accepts bare newlines and an empty body as null", () => {
  const { headers, body } = ci.parseInclude("HTTP/2 204\nx-a: b\n\n");
  assert.equal(headers.get("x-a"), "b");
  assert.equal(body, null);
});

test("parseInclude: a body that is not JSON throws rather than guessing", () => {
  assert.throws(() => ci.parseInclude("HTTP/2 200\nx-a: b\n\nnot json"), SyntaxError);
});
