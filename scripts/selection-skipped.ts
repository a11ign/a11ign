#!/usr/bin/env node
// @ts-check
// command: for a CI run id, whether `rstest --changed` skipped the test that failed it; for a merge time, the first-run pass rate 14 days either side
//
// THE REGRESSION GUARD FOR #3215 (#3576, chairman via ceo, 2026-10-04). #3215's fix was a verify that runs what CI runs,
// because one that skipped tests left 41 of 63 pull requests red on their first completed run (#928). Local `verify` now
// runs the module-graph-affected set (#3572), which skips tests again BY DESIGN. It is not safe by construction; this is
// what says whether it is safe in fact, and `forceRerunTriggers` in `scripts/rstest/rstest.config.mjs` is what widens it.
//
// IT READS #3212'S FUNCTION AND COMPUTES NO SECOND ONE. `firstRunPassRate` and `inWindow` come from `ci-health.ts`; the
// red list below uses the same `pullRequestGroups` and `completed`, and `main` refuses to print when its count of reds
// disagrees with the rate's own (`counted - passed`), because two readings of "first completed run" drift apart silently.
//
// DERIVED FROM GIT, NEVER FROM A STAMP (a stamp is per worktree and never shared). The affected set of a red is what
// `rstest list --changed=<merge-base> --filesOnly` prints over the config AT THAT RUN'S HEAD. The merge-base is taken
// against `origin/main` as it stood when the run was created: after the pull request merges, its head is an ancestor of
// `main` and a merge-base against today's `main` would be the head itself, an empty diff that "skips" nothing.
//
// A TREE-WIDE GUARD IS NOT A `--changed` MISS. #3572 leaves the tests ABOUT the repository (`declareTreeWideGuard`) to CI
// on purpose and ruled that line, so a failing file the head's own `tree-wide-guards.mjs` lists reads `ci-only` even
// when it fails inside the `ts` job, and never `yes`: widening `forceRerunTriggers` for it would be the whole suite.
//
// THE SIX ANSWERS, because absence is not proof. `yes` and `no` are the headline. `gone` is a failing file the head does
// not hold, `predates-policy` a head that does not contain #3572 (its local verify never ran `--changed`, and its config
// has no triggers, so the list would answer a question nobody asked), `ci-only` a failure in a job `verify` never runs
// (`CI_ONLY`, a skip of #3572's other half, not of `--changed`), `no-test-file` a red with no test failure in it (lint,
// typecheck), and `unread` a red this reader could not trace. The last five are counted in NEITHER of the headline's two
// and are printed beside it so the six sum to the reds.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { refuseUnknownFlags } from "@a11ign/screenreader-fleet/cli-flags";
import { changedFiles } from "../packages/guards/src/changed-files.mjs";
import { sandboxGitEnv } from "../packages/guards/src/git-env.mjs";
import { AGGREGATE_JOB, completed, daySlices, firstRunPassRate, inWindow, pullRequestGroups } from "./ci-health.ts";
import { CI_ONLY, linkNodeModules } from "./verify.ts";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const RSTEST_CONFIG = "scripts/rstest/rstest.config.mjs";
const DEFAULT_REPOSITORY = "a11ign/a11ign";
const WINDOW_DAYS = 14;
const MS_PER_DAY = 86_400_000;
const PER_PAGE = 100;
const SEARCH_CAP = 1000;
const MAX_OUTPUT_BYTES = 67_108_864;
const MAX_CHANGED_SHOWN = 20;
const PERCENT = 100;
const SHORT_SHA = 12;

/**
 * @typedef {import("./ci-health.ts").Run} Run
 * @typedef {"yes" | "no" | "gone"} Skipped
 * @typedef {Skipped | "predates-policy" | "ci-only" | "no-test-file" | "unread"} Answer
 * @typedef {{ file: string, answer: Skipped | "ci-only" }} FileReading
 * @typedef {{ runId: number, answer: Answer, files: FileReading[], jobs: string[], why: string, changed: string[] }} Trace
 * @typedef {{ failedJobs: (runId: number) => { id: number, name: string }[] | null, log: (jobId: number) => string,
 *   affected: (run: Run) => { set: string[], changed: string[], treeWide: string[] } | null, exists: (run: Run, file: string) => boolean,
 *   hasPolicy: (run: Run) => boolean }} RedReader
 */

// ---- the definitions: pure functions over run lists and log text -----------------------------------------

const ESCAPE_CODE = 27;
const ESC = String.fromCharCode(ESCAPE_CODE);
const ANSI = new RegExp(`${ESC}\\[[0-9;]*m`, "g");
const TIMESTAMP_PREFIX = /^\uFEFF?\d{4}-\d\d-\d\dT[\d:.]+Z /;
const FAIL_LINE = /^\s*FAIL\s+(\S+\.test\.[cm]?[jt]sx?)(?:\s|$)/;
const SIBLING_RUN = /\((\d+)\) concluded 'failure'/;

/** A log line as it reads on screen: no runner timestamp, no colour. @param {string} line */
export const cleanLine = (line: string) => line.replace(TIMESTAMP_PREFIX, "").replace(ANSI, "");

/**
 * The test files rstest reported FAIL in a job's log, once each, in order of appearance.
 * @param {string} log @returns {string[]}
 */
export function failingFiles(log: string): string[] {
  const files = log.split("\n").map((line) => FAIL_LINE.exec(cleanLine(line))?.[1]).filter((file) => file !== undefined);
  return [...new Set(files)];
}

/**
 * `gate` fails whenever the OTHER kind of run on the same head failed (#3211) and names it, so a red whose only failed job
 * is `gate` is traced through that run. @param {string} gateLog @returns {number | null}
 */
export function siblingRunId(gateLog: string): number | null {
  const id = SIBLING_RUN.exec(gateLog.split("\n").map(cleanLine).join("\n"))?.[1];
  return id === undefined ? null : Number(id);
}

/**
 * THE ANSWER FOR ONE FAILING FILE. `gone` first: a file the head does not hold was never selectable, and calling it `yes`
 * would blame the policy for a rename.
 * @param {{ file: string, affectedSet: string[], existsAtHead: (file: string) => boolean }} reading @returns {Skipped}
 */
export function skippedByChanged({ file, affectedSet, existsAtHead }: { file: string; affectedSet: string[]; existsAtHead: (file: string) => boolean; }): Skipped {
  if (!existsAtHead(file)) return "gone";
  return affectedSet.includes(file) ? "no" : "yes";
}

/**
 * One answer for a run that failed in several files: a miss anywhere is a miss, then a file the set held, then a tree-wide
 * guard, then a file the head lacks. @param {FileReading[]} files @returns {Skipped | "ci-only"}
 */
export function runAnswer(files: FileReading[]): Skipped | "ci-only" {
  for (const answer of /** @type {const} */ (["yes", "no", "ci-only"])) if (files.some((f) => f.answer === answer)) return answer;
  return "gone";
}

/**
 * The first completed run of each pull request that FAILED: the reds `firstRunPassRate` counts against. Same grouping, same
 * `completed`, so `reds.length === counted - passed`, which `main` checks on the real run list.
 * @param {Run[]} runs @returns {Run[]}
 */
export function firstRunReds(runs: Run[]): Run[] {
  const firsts = pullRequestGroups(runs).map((group) => group.find(completed));
  return firsts.filter(/** @param {Run | undefined} run @returns {run is Run} */ (run: Run | undefined): run is Run => run !== undefined && run.conclusion === "failure");
}

/**
 * The rate over ONE window: `firstRunPassRate` called over `inWindow`'s slice, plus how many pull requests the window held
 * at all (the rate's own denominator leaves out one whose runs were all cancelled).
 * @param {Run[]} runs @param {{ since: string, until: string }} window
 */
export function windowReading(runs: Run[], window: { since: string; until: string; }) {
  const inside = inWindow(runs, window);
  return { window, pullRequests: pullRequestGroups(inside).length, ...firstRunPassRate(inside) };
}

/**
 * The two windows around a merge: 14 days before it and 14 days after, so no run is in both.
 * @param {string} merged ISO time ending in Z @returns {{ before: { since: string, until: string }, after: { since: string, until: string } }}
 */
export function windowsAround(merged: string): { before: { since: string; until: string; }; after: { since: string; until: string; }; } {
  const shift = (/** @type {number} */ days: number) => new Date(new Date(merged).getTime() + days * MS_PER_DAY).toISOString().replace(".000", "");
  return { before: { since: shift(-WINDOW_DAYS), until: merged }, after: { since: merged, until: shift(WINDOW_DAYS) } };
}

/**
 * Trace one red run to whether `--changed` skipped the test that failed it. `seen` stops a sibling that names its own
 * sibling from looping.
 * @param {Run} run @param {RedReader} read @param {Set<number>} [seen] @returns {Trace}
 */
export function traceRed(run: Run, read: RedReader, seen: Set<number> = new Set()): Trace {
  seen.add(run.id);
  const base = { runId: run.id, files: [], jobs: [], changed: [] };
  const failed = read.failedJobs(run.id);
  if (failed === null) return { ...base, answer: "unread", why: "the run's jobs could not be read" };
  const real = failed.filter((job) => job.name !== AGGREGATE_JOB);
  if (real.length === 0) return traceThroughSibling({ run, failed, read, seen });
  const jobs = real.map((job) => job.name);
  const testJobs = real.filter((job) => !(job.name.split(" / ")[0] in CI_ONLY));
  const files = [...new Set(testJobs.flatMap((job) => failingFiles(read.log(job.id))))];
  if (files.length === 0) {
    return { ...base, jobs, answer: testJobs.length < real.length ? "ci-only" : "no-test-file", why: `failed: ${jobs.join(", ")}` };
  }
  return traceFiles({ run, files, jobs, read });
}

/** @param {{ run: Run, files: string[], jobs: string[], read: RedReader }} red @returns {Trace} */
function traceFiles({ run, files, jobs, read }: { run: Run; files: string[]; jobs: string[]; read: RedReader; }): Trace {
  const base = { runId: run.id, jobs, files: [], changed: [] };
  if (!read.hasPolicy(run)) return { ...base, answer: "predates-policy", why: `head ${run.head_sha.slice(0, SHORT_SHA)} does not contain the local --changed run` };
  const affected = read.affected(run);
  if (affected === null) return { ...base, answer: "unread", why: `the affected set at ${run.head_sha.slice(0, SHORT_SHA)} could not be listed` };
  const readings = files.map((file) => ({ file, answer: fileAnswer({ file, affected, exists: (f) => read.exists(run, f) }) }));
  const answer = runAnswer(readings);
  return { ...base, files: readings, answer, changed: answer === "yes" ? affected.changed : [], why: "" };
}

/**
 * @param {{ file: string, affected: { set: string[], treeWide: string[] }, exists: (file: string) => boolean }} reading
 * @returns {FileReading["answer"]}
 */
function fileAnswer({ file, affected, exists }: { file: string; affected: { set: string[]; treeWide: string[]; }; exists: (file: string) => boolean; }): FileReading["answer"] {
  const answer = skippedByChanged({ file, affectedSet: affected.set, existsAtHead: exists });
  return answer === "yes" && affected.treeWide.includes(file) ? "ci-only" : answer;
}

/** @param {{ run: Run, failed: { id: number, name: string }[], read: RedReader, seen: Set<number> }} red @returns {Trace} */
function traceThroughSibling({ run, failed, read, seen }: { run: Run; failed: { id: number; name: string; }[]; read: RedReader; seen: Set<number>; }): Trace {
  const base = { runId: run.id, files: [], jobs: [], changed: [] };
  const gate = failed.find((job) => job.name === AGGREGATE_JOB);
  const sibling = gate ? siblingRunId(read.log(gate.id)) : null;
  if (sibling === null || seen.has(sibling)) {
    return { ...base, answer: "unread", why: "only the roll-up `gate` failed and it names no other run to follow" };
  }
  const traced = traceRed({ ...run, id: sibling }, read, seen);
  return { ...traced, runId: run.id, why: `${traced.why} (through run ${sibling})`.trim() };
}

/** @param {Trace[]} traces */
export function countAnswers(traces: Trace[]) {
  const counts = { yes: 0, no: 0, gone: 0, "predates-policy": 0, "ci-only": 0, "no-test-file": 0, unread: 0 };
  for (const trace of traces) counts[trace.answer] += 1;
  return counts;
}

/** The line the tool prints for one run id. @param {Trace} trace */
export function lineFor(trace: Trace) {
  const files = trace.files.map((f) => (f.answer === trace.answer ? f.file : `${f.file} (${f.answer})`)).join(", ");
  const detail = files || trace.why;
  return `skipped-by-changed: ${trace.answer}${detail ? ` -- ${detail}` : ""}`;
}

/** @param {number | null} rate */
const percent = (rate: number | null) => (rate === null ? "n/a" : `${(rate * PERCENT).toFixed(1)}%`);

/** @param {string} label @param {ReturnType<typeof windowReading>} r */
const rateLine = (label: string, r: ReturnType<typeof windowReading>) =>
  `- **${label}** (${r.window.since} to ${r.window.until}): **${percent(r.rate)}** -- ${r.passed} of ${r.counted} pull requests passed their first completed run (${r.pullRequests} pull requests had a run in the window)`;

/**
 * THE POST FOR #928 AND THE ROW. A reading at a moment, with each definition once and the second window's caveat said with its time.
 * @param {{ merged: string, deleted?: string, before: ReturnType<typeof windowReading>, after: ReturnType<typeof windowReading>,
 *   traces: Trace[], asOf: string }} reading
 */
export function renderReport({ merged, deleted, before, after, traces, asOf }: {
        merged: string; deleted?: string; before: ReturnType<typeof windowReading>; after: ReturnType<typeof windowReading>;
        traces: Trace[]; asOf: string;
    }) {
  const counts = countAnswers(traces);
  const open = after.window.until > asOf ? ` **The after window is still open: it ends ${after.window.until}, this was read ${asOf}.**` : "";
  const deletion = deleted
    ? `The after window ALSO contains the deletion of the old selectors (#3573), merged ${deleted}${deleted >= after.window.since && deleted < after.window.until ? "" : " (outside the after window)"}: the two changes are not separable here.`
    : "The after window may ALSO contain the deletion of the old selectors (#3573) if that merged inside it; pass `--deleted=<merge time>` to say when.";
  return [
    `## First-run pass rate around the local \`--changed\` run (#3576)`,
    "",
    `Local \`--changed\` merged ${merged} (#3572). First-run pass rate = of pull requests with a completed \`ci.yml\` run in the window, the share whose FIRST completed run was \`success\`; a cancelled run is not completed (\`firstRunPassRate\` in \`scripts/ci-health.ts\`, called over \`inWindow\`'s window).`,
    "",
    rateLine("Before", before),
    rateLine("After", after),
    "",
    `${deletion}${open} A reading at a moment, not a verdict on the policy.`,
    "",
    `**First-run reds in the after window: ${traces.length}.** Skipped by \`--changed\`: **${counts.yes} yes, ${counts.no} no**. Counted in neither: ${counts.gone} gone (file absent at head), ${counts["predates-policy"]} predates-policy (the head does not contain #3572), ${counts["ci-only"]} ci-only (a job \`verify\` never runs), ${counts["no-test-file"]} no test file (lint, typecheck), ${counts.unread} unread.`,
    "",
    ...traces.map((t) => `- run ${t.runId}: ${lineFor(t)}${t.changed.length ? `; diff: ${t.changed.slice(0, MAX_CHANGED_SHOWN).join(", ")}` : ""}`),
    "",
    counts.yes > 0
      ? "**A red answered yes: the input that made the miss goes into `forceRerunTriggers` in `scripts/rstest/rstest.config.mjs`, in a pull request that cites the run id.**"
      : "Nothing answered yes, so nothing is widened by this reading.",
  ].join("\n");
}

// ---- the reads: GitHub's run list, git and `rstest list` --------------------------------------------------

/** `GIT_*` is stripped from the environment: git exports `GIT_DIR` into a hook, and a spawn that inherits it works on the wrong repository. @param {string} command @param {string[]} args @param {string} [cwd] @returns {string} */
const sh = (command: string, args: string[], cwd: string = REPO_ROOT): string => execFileSync(command, args, { encoding: "utf8", cwd, env: sandboxGitEnv(), maxBuffer: MAX_OUTPUT_BYTES, stdio: ["ignore", "pipe", "pipe"] });

/** @param {string} path @returns {any} */
const ghJson = (path: string): any => JSON.parse(sh("gh", ["api", path]));

/** One UTC day of `ci.yml` runs. A day over the endpoint's cap is REFUSED, never read short. @param {string} repository @param {string} slice @returns {Run[]} */
function readSlice(repository: string, slice: string): Run[] {
  const base = `repos/${repository}/actions/workflows/ci.yml/runs?per_page=${PER_PAGE}&created=${slice}`;
  /** @type {Run[]} */ const runs: Run[] = [];
  for (let page = 1; ; page += 1) {
    const body = ghJson(`${base}&page=${page}`);
    if (body.total_count > SEARCH_CAP) throw new Error(`selection-skipped: ${repository} ${slice} holds ${body.total_count} runs, over the ${SEARCH_CAP} the endpoint returns; refusing a short list.`);
    runs.push(...body.workflow_runs);
    if (page * PER_PAGE >= body.total_count) return runs;
  }
}

/** @param {string} repository @param {{ since: string, until: string }} window @returns {Run[]} */
function readRuns(repository: string, window: { since: string; until: string; }): Run[] {
  const byId = new Map(daySlices(window).flatMap((slice) => readSlice(repository, slice)).map((r) => [r.id, r]));
  return inWindow([...byId.values()], window);
}

/** @param {{ repository: string, policy: string | undefined }} where @returns {RedReader} */
function gitReader({ repository, policy }: { repository: string; policy: string | undefined; }): RedReader {
  return {
    failedJobs: (runId) => {
      try {
        const { jobs } = ghJson(`repos/${repository}/actions/runs/${runId}/jobs?per_page=${PER_PAGE}`);
        return jobs.filter((/** @type {any} */ j: any) => j.conclusion === "failure").map((/** @type {any} */ j: any) => ({ id: j.id, name: j.name }));
      } catch (cause) {
        process.stderr.write(`selection-skipped: jobs of run ${runId} unread: ${cause instanceof Error ? cause.message : cause}\n`);
        return null;
      }
    },
    // the log is coloured, which `gh` refuses unless told; `cleanLine` strips it
    log: (jobId) => sh("gh", ["api", "--allow-escape-sequences", `repos/${repository}/actions/jobs/${jobId}/logs`]),
    affected: (red) => affectedAt({ red, list: rstestList, treeWide: treeWideGuards }),
    exists: (r, file) => sh("git", ["ls-tree", "--name-only", r.head_sha, "--", file]).trim() !== "",
    hasPolicy: (r) => {
      if (policy === undefined) return true;
      sh("git", ["fetch", "--quiet", "--no-tags", "origin", r.head_sha]);
      return containsCommit({ head: r.head_sha, commit: policy });
    },
  };
}

/**
 * Whether `head` has `commit` in its history. @param {{ head: string, commit: string, cwd?: string }} pair
 */
export function containsCommit({ head, commit, cwd = REPO_ROOT }: { head: string; commit: string; cwd?: string; }) {
  try {
    sh("git", ["merge-base", "--is-ancestor", commit, head], cwd);
    return true;
  } catch (cause) {
    if (/** @type {{ status?: number }} */ (cause).status === 1) return false; // exit 1 is "not an ancestor"; anything else is a failure to ask
    throw cause;
  }
}

/**
 * `rstest list --changed=<mergeBase> --filesOnly` over the config AT the head's own tree, which has no `node_modules` of its
 * own, so it gets the hybrid one `verify` builds for its clone. @param {{ tree: string, mergeBase: string }} where @returns {string[]}
 */
function rstestList({ tree, mergeBase }: { tree: string; mergeBase: string; }): string[] {
  linkNodeModules({ from: join(REPO_ROOT, "node_modules"), to: join(tree, "node_modules") });
  const listed = sh("pnpm", ["exec", "rstest", "list", "--config", RSTEST_CONFIG, `--changed=${mergeBase}`, "--filesOnly"], tree);
  return listed.split("\n").map((line) => line.trim()).filter((line) => /\.test\.[cm]?[jt]sx?$/.test(line));
}

/**
 * The tree-wide guards AT THE HEAD, from the head's own `tree-wide-guards.mjs` (the population is derived from its tree, and
 * a guard declared since is not one then). Run in the head's worktree, which `rstestList` has already linked.
 * @param {{ tree: string }} where @returns {string[]}
 */
function treeWideGuards({ tree }: { tree: string; }): string[] {
  return sh("node", ["packages/guards/src/tree-wide-guards.mjs"], tree).split("\n").filter(Boolean);
}

/**
 * The affected set of a pull request's head against its merge-base with `origin/main` AS IT STOOD WHEN THE RUN WAS CREATED,
 * and the files that diff changed. `list` is injected: it gets the head's worktree and the merge-base and returns the files.
 * Null when the head cannot be fetched or listed: absence of a reading is not a reading of `no`.
 * @param {{ red: Run, list: (where: { tree: string, mergeBase: string }) => string[], treeWide: (where: { tree: string }) => string[], cwd?: string }} what
 * @returns {{ set: string[], changed: string[], treeWide: string[], mergeBase: string } | null}
 */
export function affectedAt({ red, list, treeWide, cwd = REPO_ROOT }: { red: Run; list: (where: { tree: string; mergeBase: string; }) => string[]; treeWide: (where: { tree: string; }) => string[]; cwd?: string; }): { set: string[]; changed: string[]; treeWide: string[]; mergeBase: string; } | null {
  const dir = mkdtempSync(join(tmpdir(), "selection-skipped-"));
  const tree = join(dir, "head");
  try {
    sh("git", ["fetch", "--quiet", "--no-tags", "origin", red.head_sha], cwd);
    const main = sh("git", ["rev-list", "-1", "--first-parent", `--before=${red.created_at}`, "origin/main"], cwd).trim();
    const mergeBase = sh("git", ["merge-base", red.head_sha, main], cwd).trim();
    sh("git", ["worktree", "add", "--quiet", "--detach", tree, red.head_sha], cwd);
    const changed = changedFiles([mergeBase, red.head_sha], { repoRoot: cwd });
    return { set: list({ tree, mergeBase }), changed, treeWide: treeWide({ tree }), mergeBase };
  } catch (cause) {
    process.stderr.write(`selection-skipped: affected set at ${red.head_sha} unread: ${cause instanceof Error ? cause.message.split("\n")[0] : cause}\n`);
    return null;
  } finally {
    if (existsSync(tree)) sh("git", ["worktree", "remove", "--force", tree], cwd);
    rmSync(dir, { recursive: true, force: true });
  }
}

/** @param {string} flag @returns {string | undefined} `--flag=value` from argv */
const flagValue = (flag: string): string | undefined => process.argv.slice(2).find((arg) => arg.startsWith(`${flag}=`))?.slice(flag.length + 1);

/** @param {string} repository @param {number} id */
const readRun = (repository: string, id: number) => ghJson(`repos/${repository}/actions/runs/${id}`);

function main() {
  refuseUnknownFlags(["--run=", "--merged=", "--policy=", "--deleted=", "--repo="], { entry: import.meta.url, command: "node --import tsx scripts/selection-skipped.ts" });
  const repository = flagValue("--repo") ?? DEFAULT_REPOSITORY;
  sh("git", ["fetch", "--quiet", "origin", "main"]);
  const runId = flagValue("--run");
  if (runId) {
    process.stdout.write(`${lineFor(traceRed(readRun(repository, Number(runId)), gitReader({ repository, policy: flagValue("--policy") })))}\n`);
    return;
  }
  const merged = flagValue("--merged");
  const policy = flagValue("--policy");
  if (!merged || !policy) throw new Error("selection-skipped: give --run=<id>, or --merged=<ISO time ending in Z> with --policy=<the merge commit of #3572>");
  process.stdout.write(`${measure({ repository, merged, policy, deleted: flagValue("--deleted") })}\n`);
}

/** A red that throws mid-trace is `unread` WITH the reason, and the other reds are still read. @param {Run} red @param {RedReader} reader @returns {Trace} */
function traceOrUnread(red: Run, reader: RedReader): Trace {
  try {
    return traceRed(red, reader);
  } catch (cause) {
    const why = cause instanceof Error ? cause.message.split("\n")[0] : String(cause);
    process.stderr.write(`selection-skipped: run ${red.id} unread: ${why}\n`);
    return { runId: red.id, answer: "unread", files: [], jobs: [], changed: [], why };
  }
}

/** @param {{ repository: string, merged: string, policy: string, deleted: string | undefined }} what */
function measure({ repository, merged, policy, deleted }: { repository: string; merged: string; policy: string; deleted: string | undefined; }) {
  const { before, after } = windowsAround(merged);
  const runs = readRuns(repository, { since: before.since, until: after.until });
  const afterReading = windowReading(runs, after);
  const reds = firstRunReds(inWindow(runs, after));
  if (reds.length !== afterReading.counted - afterReading.passed) {
    throw new Error(`selection-skipped: ${reds.length} first-run reds disagree with firstRunPassRate's ${afterReading.counted - afterReading.passed}; refusing to print two numbers for one thing.`);
  }
  const reader = gitReader({ repository, policy });
  const traces = reds.map((red) => traceOrUnread(red, reader));
  return renderReport({ merged, deleted, before: windowReading(runs, before), after: afterReading, traces, asOf: new Date().toISOString().replace(/\.\d+Z$/, "Z") });
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  main();
}
