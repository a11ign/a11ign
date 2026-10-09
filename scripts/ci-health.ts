#!/usr/bin/env node
// @ts-check
// command: read CI health per repository against docs/ci-targets.json and, with --post, comment the table on #928
//
// A TARGET NOBODY RE-READS IS DECORATION (chairman, 2026-10-03, #928, row #3212). The first reading was taken once, by
// hand; this makes the reading a schedule's work and puts the target beside the number. `.github/workflows/ci-health.yml`
// runs it weekly with the Actions job's own token, so the org's API pool is untouched.
//
// EVERY DEFINITION IS A PURE FUNCTION OVER A RUN LIST, so the test needs no network and a later reader gets the same
// number from the same runs. `main` only reads GitHub, hands the runs on, and posts what comes back.
//
// A PULL REQUEST IS A HEAD BRANCH, NOT `pull_requests[0]`. Measured 2026-10-03 on a11ign/a11ign: the runs endpoint left
// `pull_requests` EMPTY on 585 of 649 `pull_request` runs, so grouping by it would have dropped nine in ten. An event
// of `pull_request` has a pull request by construction, and its head branch (with the head repository, so two forks'
// `patch-1` are two) is the key the endpoint always fills.
//
// THE RUNS ENDPOINT IS CAPPED AT 1,000 RESULTS PER FILTERED SEARCH (docs.github.com, "List workflow runs"), and a week of
// a11ign's `ci.yml` is about 1,800. So the window is read one UTC day at a time, and a day that reports more than the
// cap is REFUSED rather than read short: a truncated list is a plausible number that is wrong.
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { refuseUnknownFlags } from "@a11ign/screenreader-fleet/cli-flags";
import { toolModule } from "./agent-org-newest-tag.mjs";
const { assertNoLeakInArgv, leakRefusalReason } = await toolModule("src/lib/leak-patterns.mjs");

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
export const TARGETS_FILE = join(REPO_ROOT, "docs/ci-targets.json");
const MS_PER_SECOND = 1000;
const MS_PER_DAY = 86_400_000;
const WINDOW_DAYS = 7;
const PER_PAGE = 100;
const SEARCH_CAP = 1000;
const SHORT_SHA = 12;
const PERCENT = 100;
const MAX_GH_OUTPUT_BYTES = 67_108_864;

/** The roll-up job: it fails whenever any other job does, so counting it would put every red run under one name. */
export const AGGREGATE_JOB = "gate";
export const ROLL_UP_ONLY = "(only the roll-up `gate` failed)";
export const JOBS_NOT_READ = "(its jobs could not be read)";

/**
 * @typedef {{ id: number, event: string, conclusion: string | null, head_sha: string, head_branch: string,
 *   created_at: string, head_repository?: { full_name?: string } | null }} Run
 * @typedef {{ label: string, unit: "ratio" | "count" | "dollars", atLeast?: number, atMost?: number, below?: number,
 *   readBy?: string }} Target
 * @typedef {{ workflow: string, reportOn: { repository: string, issue: number }, repositories: string[],
 *   minimumPullRequests: number, targets: Record<string, Target> }} Targets
 * @typedef {"MET" | "MISSED" | "UNREAD"} Verdict
 */

// ---- the definitions: pure functions over a run list ---------------------------------------------------

/** A run that reached a verdict. A cancelled run did not: the author paid for it and learned nothing. @param {Run} run */
export const completed = (run: Run) => run.conclusion === "success" || run.conclusion === "failure";

/** @param {Run} a @param {Run} b */
const oldestFirst = (a: Run, b: Run) => a.created_at.localeCompare(b.created_at) || a.id - b.id;

/** @param {Run} run */
export const pullRequestKey = (run: Run) => `${run.head_repository?.full_name ?? ""}#${run.head_branch}`;

/**
 * The `pull_request` runs grouped by pull request, each group oldest first.
 * @param {Run[]} runs @returns {Run[][]}
 */
export function pullRequestGroups(runs: Run[]): Run[][] {
  /** @type {Map<string, Run[]>} */
  const groups: Map<string, Run[]> = new Map();
  for (const run of runs.filter((r) => r.event === "pull_request")) {
    const key = pullRequestKey(run);
    groups.set(key, [...(groups.get(key) ?? []), run]);
  }
  return [...groups.values()].map((group) => group.sort(oldestFirst));
}

/** @param {number} part @param {number} whole @returns {number | null} null, never 0, when there is nothing to divide by */
export const ratio = (part: number, whole: number): number | null => (whole === 0 ? null : part / whole);

/**
 * FIRST-RUN PASS RATE: of pull requests with at least one COMPLETED run, the share whose FIRST completed run was a
 * success. A cancelled run is not completed, so cancelled-then-green is a first-run pass and an only-cancelled pull
 * request is not in the denominator.
 * @param {Run[]} runs
 */
export function firstRunPassRate(runs: Run[]) {
  const firsts = pullRequestGroups(runs).map((group) => group.find(completed)).filter((run) => run !== undefined);
  const passed = firsts.filter((run) => run?.conclusion === "success").length;
  return { passed, counted: firsts.length, rate: ratio(passed, firsts.length) };
}

/**
 * MERGE-QUEUE FAILURE RATE: failed `merge_group` runs over those that completed. A `pull_request` run never enters it.
 * @param {Run[]} runs
 */
export function mergeQueueFailureRate(runs: Run[]) {
  const done = runs.filter((run) => run.event === "merge_group" && completed(run));
  const failed = done.filter((run) => run.conclusion === "failure").length;
  return { failed, completed: done.length, rate: ratio(failed, done.length) };
}

/**
 * CI RUNS PER PULL REQUEST, CANCELLED RUNS COUNTED (a cancelled run is one the author paid for). Also the chairman's
 * side figures: runs on a head an earlier run of the same pull request had already tested, and how many of those
 * were cancelled.
 * @param {Run[]} runs
 */
export function runsPerPullRequest(runs: Run[]) {
  const groups = pullRequestGroups(runs);
  const all = groups.flat();
  const repeats = groups.flatMap((group) => group.filter((run, i) => group.findIndex((r) => r.head_sha === run.head_sha) < i));
  return {
    runs: all.length,
    pullRequests: groups.length,
    perPullRequest: ratio(all.length, groups.length),
    cancelled: all.filter((run) => run.conclusion === "cancelled").length,
    failed: all.filter((run) => run.conclusion === "failure").length,
    alreadyTestedHead: repeats.length,
    alreadyTestedHeadCancelled: repeats.filter((run) => run.conclusion === "cancelled").length,
  };
}

/** A failed job's name as the table says it: a reusable workflow's `ts / run` is the caller's `ts`. @param {string} name */
const jobLabel = (name: string) => name.split(" / ")[0];

/**
 * WHICH JOB FAILED, per failed run. A run is counted ONCE, under the set of jobs that failed in it, so the
 * combinations sum to the failed-run count they are printed beside (a breakdown that does not add up is the figure
 * nobody checks). `byJob` answers the other question, how many runs each job failed in, and does NOT sum: a run can
 * fail several. `failedJobs: null` is a run whose jobs were not read, never an empty set.
 * @param {{ id: number, failedJobs: string[] | null }[]} failedRuns
 */
export function failedJobBreakdown(failedRuns: { id: number; failedJobs: string[] | null; }[]) {
  /** @type {Map<string, number>} */ const byCombination: Map<string, number> = new Map();
  /** @type {Map<string, number>} */ const byJob: Map<string, number> = new Map();
  const bump = (/** @type {Map<string, number>} */ map: Map<string, number>, /** @type {string} */ key: string) => map.set(key, (map.get(key) ?? 0) + 1);
  for (const { failedJobs } of failedRuns) {
    const names = [...new Set((failedJobs ?? []).map(jobLabel).filter((name) => name !== AGGREGATE_JOB))].sort();
    for (const name of names) bump(byJob, name);
    bump(byCombination, failedJobs === null ? JOBS_NOT_READ : names.join(" + ") || ROLL_UP_ONLY);
  }
  const ranked = (/** @type {Map<string, number>} */ map: Map<string, number>) =>
    [...map].map(([jobs, runs]) => ({ jobs, runs })).sort((a, b) => b.runs - a.runs || a.jobs.localeCompare(b.jobs));
  const combinations = ranked(byCombination);
  return { failedRuns: failedRuns.length, combinations, byJob: ranked(byJob), summed: combinations.reduce((n, c) => n + c.runs, 0) };
}

// ---- the verdict ---------------------------------------------------------------------------------------

/**
 * MET, MISSED or UNREAD, never blank. UNREAD when there is no value or too little behind it to be a rate.
 * @param {{ value: number | null, target: Target, enough: boolean }} input
 * @returns {Verdict}
 */
export function verdictOf({ value, target, enough }: { value: number | null; target: Target; enough: boolean; }): Verdict {
  if (value === null || !enough) return "UNREAD";
  if (target.atLeast !== undefined) return value >= target.atLeast ? "MET" : "MISSED";
  if (target.atMost !== undefined) return value <= target.atMost ? "MET" : "MISSED";
  if (target.below !== undefined) return value < target.below ? "MET" : "MISSED";
  throw new Error(`ci-health: target "${target.label}" names none of atLeast, atMost, below.`);
}

/** @param {number} n @param {Target["unit"]} unit */
function formatValue(n: number, unit: Target["unit"]) {
  if (unit === "ratio") return `${(n * PERCENT).toFixed(1)}%`;
  return unit === "dollars" ? `$${n.toFixed(2)}` : String(Number(n.toFixed(1)));
}

/** The target as the table words it, from the file's own fields. @param {Target} target */
export function targetText(target: Target) {
  if (target.atLeast !== undefined) return `at least ${formatValue(target.atLeast, target.unit)}`;
  if (target.atMost !== undefined) return `at most ${formatValue(target.atMost, target.unit)}`;
  return `under ${formatValue(/** @type {number} */ (target.below), target.unit)}`;
}

/** @param {unknown} parsed @returns {Targets} the file, refused when a target names no bound */
export function targetsFrom(parsed: unknown): Targets {
  const targets = /** @type {Targets} */ (parsed);
  for (const target of Object.values(targets.targets)) verdictOf({ value: 0, target, enough: true });
  return targets;
}

// ---- one repository's reading --------------------------------------------------------------------------

/**
 * @typedef {{ measure: string, target: string, reading: string, count: string, verdict: Verdict }} Row
 */

/** @param {Target} target @param {number | null} value @param {boolean} enough @param {string} count @returns {Row} */
function rowOf(target: Target, value: number | null, enough: boolean, count: string): Row {
  return {
    measure: target.label, target: targetText(target),
    reading: value === null ? "no reading" : formatValue(value, target.unit),
    count, verdict: verdictOf({ value, target, enough }),
  };
}

/** The two targets another row measures, printed rather than left out so the table is the whole target set. @param {Target} target @returns {Row} */
const notReadHere = (target: Target): Row => ({
  measure: target.label, target: targetText(target), reading: "not read here",
  count: `read by ${target.readBy ?? "another row"}`, verdict: "UNREAD",
});

/**
 * One repository's table rows, breakdown and the counts every figure came from.
 * @param {{ repository: string, runs: Run[], failedRuns: { id: number, event: string, failedJobs: string[] | null }[], targets: Targets }} input
 */
export function readRepository({ repository, runs, failedRuns, targets }: { repository: string; runs: Run[]; failedRuns: { id: number; event: string; failedJobs: string[] | null; }[]; targets: Targets; }) {
  const t = targets.targets;
  const first = firstRunPassRate(runs);
  const queue = mergeQueueFailureRate(runs);
  const per = runsPerPullRequest(runs);
  const enoughPullRequests = per.pullRequests >= targets.minimumPullRequests;
  const enoughQueueRuns = queue.completed >= targets.minimumPullRequests;
  const rows = [
    rowOf(t.firstRunPassRate, first.rate, enoughPullRequests,
      `${first.passed} of ${first.counted} pull requests with a completed run passed first (${per.pullRequests} pull requests in the window)`),
    rowOf(t.mergeQueueFailureRate, queue.rate, enoughQueueRuns, `${queue.failed} of ${queue.completed} completed merge_group runs failed`),
    rowOf(t.ciRunsPerPullRequest, per.perPullRequest, enoughPullRequests,
      `${per.runs} pull_request runs over ${per.pullRequests} pull requests (${per.cancelled} cancelled, ${per.failed} failed)`),
    notReadHere(t.callsPerMergedPullRequest),
    notReadHere(t.dollarsPerMergedPullRequest),
  ];
  const ofEvent = (/** @type {string} */ event: string) => failedJobBreakdown(failedRuns.filter((run) => run.event === event));
  return { repository, rows, per, queueCompleted: queue.completed, minimum: targets.minimumPullRequests,
    breakdowns: { pull_request: ofEvent("pull_request"), merge_group: ofEvent("merge_group") } };
}

// ---- the comment ---------------------------------------------------------------------------------------

/** @param {{ date: string }} week */
export const commentHeading = ({ date }: { date: string; }) => `## CI health, week of ${date}`;

/** @param {Row} row */
const rowLine = (row: Row) => `| ${row.measure} | ${row.target} | ${row.reading} | ${row.count} | **${row.verdict}** |`;

/** @param {ReturnType<typeof failedJobBreakdown>} breakdown @param {string} event */
function breakdownLines(breakdown: ReturnType<typeof failedJobBreakdown>, event: string) {
  if (breakdown.failedRuns === 0) return [`Failed \`${event}\` runs: 0.`];
  return [
    `Failed \`${event}\` runs by failed job (the roll-up \`${AGGREGATE_JOB}\` left out; a run is counted once, under the set that failed in it):`,
    "", "| Failed job(s) | Runs |", "|---|---|",
    ...breakdown.combinations.map((c) => `| ${c.jobs} | ${c.runs} |`),
    `| **Total** | **${breakdown.summed}** (of ${breakdown.failedRuns} failed runs) |`, "",
    `Runs each job failed in (a run can fail several, so this does not sum): ${breakdown.byJob.map((j) => `${j.jobs} ${j.runs}`).join(", ") || "none"}.`,
  ];
}

/** @param {ReturnType<typeof readRepository>} reading */
function repositorySection(reading: ReturnType<typeof readRepository>) {
  const { per } = reading;
  return [
    `### ${reading.repository}`, "",
    "| Measure | Target | Reading | Count it came from | Verdict |", "|---|---|---|---|---|",
    ...reading.rows.map(rowLine), "",
    `Runs on a head an earlier run of the same pull request had already tested: ${per.alreadyTestedHead} of ${per.runs}, ${per.alreadyTestedHeadCancelled} of them cancelled.`,
    ...(per.pullRequests < reading.minimum ? [`UNREAD above: ${per.pullRequests} pull requests is under the ${reading.minimum} a rate needs.`] : []),
    "", ...breakdownLines(reading.breakdowns.pull_request, "pull_request"),
    "", ...breakdownLines(reading.breakdowns.merge_group, "merge_group"), "",
  ].join("\n");
}

/**
 * THE COMMENT: a reading is a moment, so it names its window, the commit of this script and the rate-limit header it saw.
 * @param {{ date: string, window: { since: string, until: string }, commit: string, rateLimit: string,
 *   readings: ReturnType<typeof readRepository>[] }} input
 */
export function renderComment({ date, window, commit, rateLimit, readings }: {
        date: string; window: { since: string; until: string; }; commit: string; rateLimit: string;
        readings: ReturnType<typeof readRepository>[];
    }) {
  return [
    commentHeading({ date }), "",
    `Window: runs of \`ci.yml\` created from ${window.since} to ${window.until} (UTC, end exclusive). Script: \`scripts/ci-health.ts\` at \`${commit}\`. Rate limit seen: ${rateLimit}.`,
    "Definitions and targets: `docs/ci-targets.json`. A reading is a moment, and every figure is beside the count it came from.", "",
    ...readings.map(repositorySection),
  ].join("\n");
}

// ---- the window ----------------------------------------------------------------------------------------

/** @param {Date} date @returns {string} `YYYY-MM-DD` */
const dayOf = (date: Date): string => date.toISOString().slice(0, "YYYY-MM-DD".length);

/**
 * The seven whole UTC days before `now`'s day, which is what makes a Monday run read Monday to Sunday and a re-run the same week.
 * @param {Date} now @returns {{ since: string, until: string }}
 */
export function weeklyWindow(now: Date): { since: string; until: string; } {
  const until = new Date(`${dayOf(now)}T00:00:00Z`);
  return { since: `${dayOf(new Date(until.getTime() - WINDOW_DAYS * MS_PER_DAY))}T00:00:00Z`, until: until.toISOString().replace(".000", "") };
}

/**
 * One `created=<start>..<end>` filter per UTC day the window touches, because one filter returns at most 1,000 runs.
 * @param {{ since: string, until: string }} window @returns {string[]}
 */
export function daySlices({ since, until }: { since: string; until: string; }): string[] {
  const slices = [];
  for (let day = new Date(since); day < new Date(until); day = new Date(day.getTime() + MS_PER_DAY)) {
    const last = new Date(day.getTime() + MS_PER_DAY - MS_PER_SECOND);
    slices.push(`${day.toISOString().replace(".000", "")}..${last.toISOString().replace(".000", "")}`);
  }
  return slices;
}

/** The slices read whole days, so the window's exact edges are applied here. @param {Run[]} runs @param {{ since: string, until: string }} window */
export const inWindow = (runs: Run[], { since, until }: { since: string; until: string; }) =>
  runs.filter((run) => run.created_at >= since && run.created_at < until);

/** Already posted when a comment under this week's heading exists, so a dispatch re-run posts nothing. @param {string[]} commentBodies @param {string} heading */
export const alreadyPosted = (commentBodies: string[], heading: string) => commentBodies.some((body) => body.startsWith(heading));

/** @param {string} text a `gh api -i` response @returns {{ headers: Map<string, string>, body: any }} */
export function parseInclude(text: string): { headers: Map<string, string>; body: any; } {
  const split = text.search(/\r?\n\r?\n/);
  const head = text.slice(0, split).split(/\r?\n/).slice(1);
  const headers = new Map(head.map((line) => [line.slice(0, line.indexOf(":")).toLowerCase(), line.slice(line.indexOf(":") + 1).trim()]));
  return { headers, body: JSON.parse(text.slice(split).trim() || "null") };
}

// ---- reading GitHub and posting ------------------------------------------------------------------------

/** @type {string} the last rate-limit header any call saw: the lowest remaining, since each call can only lower it */
let rateLimitSeen: string = "no call made";

/** @param {string[]} args @returns {string} */
const gh = (args: string[]): string => {
  assertNoLeakInArgv("gh", args); // #1053: a body this script sends is checked where it is spawned, as every tracker writer's is
  return execFileSync("gh", args, { encoding: "utf8", cwd: REPO_ROOT, maxBuffer: MAX_GH_OUTPUT_BYTES });
};

/** One real call, so the rate-limit header is read off it (`gh api rate_limit` is a broken gauge, gh-api-budget.md). @param {string} path */
function ghGet(path: string) {
  const { headers, body } = parseInclude(gh(["api", "-i", path]));
  rateLimitSeen = `X-Ratelimit-Remaining ${headers.get("x-ratelimit-remaining")} of ${headers.get("x-ratelimit-limit")}, resource ${headers.get("x-ratelimit-resource")}, as of the last read`;
  return body;
}

/** @param {string} repository @param {string} workflow @param {string} slice @returns {Run[]} */
function readSlice(repository: string, workflow: string, slice: string): Run[] {
  const base = `repos/${repository}/actions/workflows/${workflow}/runs?per_page=${PER_PAGE}&created=${slice}`;
  /** @type {Run[]} */ const runs: Run[] = [];
  for (let page = 1; ; page += 1) {
    const body = ghGet(`${base}&page=${page}`);
    if (body.total_count > SEARCH_CAP) throw new Error(`ci-health: ${repository} ${slice} holds ${body.total_count} runs, over the ${SEARCH_CAP} the endpoint returns; refusing a short list.`);
    runs.push(...body.workflow_runs);
    if (page * PER_PAGE >= body.total_count) return runs;
  }
}

/** @param {string} repository @param {string} workflow @param {{ since: string, until: string }} window @returns {Run[]} */
function readRuns(repository: string, workflow: string, window: { since: string; until: string; }): Run[] {
  const byId = new Map(daySlices(window).flatMap((slice) => readSlice(repository, workflow, slice)).map((run) => [run.id, run]));
  return inWindow([...byId.values()], window);
}

/** The jobs that failed in one run, or null when they could not be read, which is not the same as none. @param {string} repository @param {number} id */
function readFailedJobs(repository: string, id: number) {
  try {
    const body = ghGet(`repos/${repository}/actions/runs/${id}/jobs?per_page=${PER_PAGE}`);
    return body.jobs.filter((/** @type {any} */ job: any) => job.conclusion === "failure").map((/** @type {any} */ job: any) => job.name);
  } catch (error) {
    process.stderr.write(`ci-health: jobs of run ${id} unread: ${error instanceof Error ? error.message : error}\n`);
    return null;
  }
}

/** @param {string} repository @param {Targets} targets @param {{ since: string, until: string }} window */
function readOne(repository: string, targets: Targets, window: { since: string; until: string; }) {
  const runs = readRuns(repository, targets.workflow, window);
  const failedRuns = runs.filter((run) => run.conclusion === "failure")
    .map((run) => ({ id: run.id, event: run.event, failedJobs: readFailedJobs(repository, run.id) }));
  return readRepository({ repository, runs, failedRuns, targets });
}

/** The commit this script ran at: the run's own. A local run has none and says so, rather than guessing from a checkout. */
const scriptCommit = () => process.env.GITHUB_SHA?.slice(0, SHORT_SHA) ?? "unknown (GITHUB_SHA unset, a local run)";

/** @param {string} body @param {{ repository: string, issue: number }} on */
function post(body: string, on: { repository: string; issue: number; }) {
  const leak = leakRefusalReason(body); // `--body-file` is a FILE, which `assertNoLeakInArgv` cannot see, so the text is checked here
  if (leak) throw new Error(leak);
  const dir = mkdtempSync(join(tmpdir(), "ci-health-"));
  try {
    const file = join(dir, "comment.md");
    writeFileSync(file, body);
    gh(["issue", "comment", String(on.issue), "--repo", on.repository, "--body-file", file]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** @param {string} flag @returns {string | undefined} `--flag=value` from argv */
const flagValue = (flag: string): string | undefined => process.argv.slice(2).find((arg) => arg.startsWith(`${flag}=`))?.slice(flag.length + 1);

/** @returns {{ since: string, until: string }} the week before today, unless `--since=DATE` and `--until=ISO-UTC` say otherwise (a reconciliation reads an arbitrary window) */
function windowFromArgv(): { since: string; until: string; } {
  const week = weeklyWindow(new Date());
  const since = flagValue("--since");
  return { since: since ? `${since}T00:00:00Z` : week.since, until: flagValue("--until") ?? week.until };
}

function main() {
  refuseUnknownFlags(["--since=", "--until=", "--post"], { entry: import.meta.url, command: "node --import tsx scripts/ci-health.ts" });
  const targets = targetsFrom(JSON.parse(readFileSync(TARGETS_FILE, "utf8")));
  const window = windowFromArgv();
  const readings = targets.repositories.map((repository) => readOne(repository, targets, window));
  const date = window.since.slice(0, "YYYY-MM-DD".length);
  const comment = renderComment({ date, window, commit: scriptCommit(), rateLimit: rateLimitSeen, readings });
  process.stdout.write(`${comment}\n`);
  if (!process.argv.includes("--post")) return;
  const { repository, issue } = targets.reportOn;
  const existing = ghGet(`repos/${repository}/issues/${issue}/comments?per_page=${PER_PAGE}&since=${window.until}`);
  if (alreadyPosted(existing.map((/** @type {{ body: string }} */ c: { body: string; }) => c.body), commentHeading({ date }))) {
    process.stdout.write(`ci-health: "${commentHeading({ date })}" is already on #${issue}; posting nothing.\n`);
    return;
  }
  post(comment, targets.reportOn);
  process.stdout.write(`ci-health: posted on ${repository}#${issue}.\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  main();
}
