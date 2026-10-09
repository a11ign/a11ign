#!/usr/bin/env node
// @ts-check
// command: read the fleet part's `qualification` commit status for the release's sha, and say proceed, wait, rerun or regression
//
// #3136 (child of #928, ADR 0041 decision 3). The release job proves what a RUNNER can prove; the stability gate
// and the NVDA layer need a Windows worker and cannot run on one (nine of release:gate's fourteen stages,
// `release-gate-scope.ts`). This reads the lab's verdict on the commit instead of ignoring it, in the way
// `release-reuses-verdict.mjs` reads another workflow's job: BY THE EXACT SHA, never "the latest".
//
// THE CONTRACT (`ceo`): the lab posts a COMMIT STATUS on the sha, context `qualification`, state `success`,
// `failure` or `pending`, description naming the stages and the run. A status is readable from a runner with no
// lab access, which is the point. The writer is #3289 (the lab's side, `orchestrator`'s); until it exists every
// real release lands in `wait`, which is the safe state and the one a user can see.
//
// FOUR OUTCOMES, NEVER TWO, and only `proceed` publishes (a wait past `WAIT_BOUND_MINUTES` also raises a row, #3291):
//   proceed     `success` on the exact sha, or on an earlier commit with no read path changed since; or no fleet
//               stage gates any package in this release (the log says so)
//   rerun       ONE `failure`: a candidate regression, NOT YET A PROVEN ONE. The lab re-runs the fleet part ONCE on a
//               fresh capture. No threshold moves and no stage is skipped to get a pass; no revert (fix forward)
//   regression  TWO `failure`s since the last `success`: real. A row is filed (`regression` label) by release.yml's
//               `qualification-row` job, which holds `issues: write` and nothing else; the publishing job never does (#3291)
//   wait        absent, `pending`, or a `NO VERDICT` failure (a launch refused before any capture, #4574): NOT a pass and NOT a failure. NO NEWS IS NEVER GOOD NEWS -- the absent case is
//               the one a default of "proceed" would pass, and `release-reads-qualification.test.ts` pins it
//
// A FAILURE IS NEVER SOFTENED by an older success: the NEAREST commit that carries a status decides.
//
// ONLY THE LAB'S IDENTITY WRITES IT (#3969): a status of that context counts when its `creator.login` is `QUALIFICATION_WRITER`, and one from
// anyone else is ignored and named in the log, in either direction (a forged `success` and a forged `failure` alike).
import { realpathSync, appendFileSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { refuseUnknownFlags, flagValue } from "./cli-flags.ts";
import { REPO } from "./repo-identity.ts";
const { gh } = await toolExport("merge-guard-lookups");
import { sandboxGitEnv } from "../packages/guards/src/git-env.ts";
import { changedFiles } from "../packages/guards/src/changed-files.ts";
import { toolExport } from "./agent-org-newest-tag.ts";

export type Status = { state: string, description?: string };
export type HistoryEntry = { sha: string, changedPaths: string[], statuses: Status[] };
export type Outcome = "proceed" | "wait" | "rerun" | "regression";

export const QUALIFICATION_CONTEXT = "qualification";

// WHO MAY SAY `qualification` (#3969). A commit status is writable by anyone holding `repo:status` here, and the context is only a name, so
// reading by context alone made every such holder a source of the fleet's verdict: harmless while a verdict gated a publish to `next`, and
// not once it moves `latest`. The lab's poster runs on the agents host and posts as that host's routed account, which #3289 measured as this
// login (`creator` of status 55536724380, read back on 2026-10-04). If the host is ever routed to another account the release WAITS, which
// is the safe state, and the log below names whose status it ignored; moving this constant is the one change that restores it.
export const QUALIFICATION_WRITER = "a11ign-ai-leads";

// Outcome 4's table, consumed as DATA from #3132 (reading 3, derived from what each stage reads; posted on #3136 by
// `orchestrator`). Directories under `packages/`. A package named in NEITHER list is treated as GATED: a new package
// is held to the fleet part until someone says otherwise, never released past it by omission. The test pins that
// every `packages/*` directory is classified, so adding one fails there rather than at a release.
// `toolchain` left with #3625 and is no longer a directory here: its readers are test and build tooling, none in `gate:stability`'s closure
// (`orchestrator`'s reading, #3578), and a version of it now reaches a release as a bump of the pin in `pnpm-lock.yaml`, which is on the read side below.
// The limit: if a fleet-side job ever runs its tests through `@a11ign/toolchain`'s rstest config the answer changes.
// `worker-fleet` left with #3504: its code is read through the release the lockfile pins, and `pnpm-lock.yaml` is on the read side below.
export const FLEET_GATED_PACKAGES = ["lab", "evidence", "control"];
// Gated by runner-only or corpus-only stages that need no worker. No private package is left in the workspace: `nvda-speech`, the last, left with the worker layer (#3447).
export const RUNNER_ONLY_PACKAGES = ["scorer", "judge", "guards", "cli"];
/** @type {string[]} */
export const PRIVATE_PACKAGES: string[] = [];

// The wall-clock after which a wait is a problem to raise rather than a state to sit in: the longest first verdict
// measured, doubled for one re-run, rounded up. That is 54:24 (`pending` 13:06:02Z to `success` 14:00:26Z on sha
// 86b33f0d9cf3, read by `orchestrator` on #3289: 47 s dispatch, 53:32 of captures) x 2 = 108:48 -> 109. It replaces
// #3132's 46:15 + 45:02 = 91:17 -> 92, which the first run after the lab became a layer exceeded. One run, an observed
// maximum and NOT a guarantee, and it leaves out the wake-to-serving time of a SLEEPING fleet (#2656): neither #3132
// nor the 54:24 run timed one (the worker was already up). So an overdue wait is a prompt to look, never a licence to skip.
export const WAIT_BOUND_MINUTES = 109;

// Paths a change to which cannot change what the fleet part reads. EVERYTHING ELSE counts as read: the list is of
// exemptions, so a path nobody thought of invalidates the verdict rather than inheriting it. The first four are
// not code; the rest are what a release-carrying merge brings. `.changeset/` is the changeset that merge ADDS, so
// the release sha's own diff against the commit that was qualified always holds one. No version pull request exists
// (#3717) and the version commit is detached, so nothing writes a package's `CHANGELOG.md` or `package.json` to `main` any
// more; they stay exempt on their own grounds: a changelog is prose, and `package.json` because an install affecting edit
// to one must carry a `pnpm-lock.yaml` change under `--frozen-lockfile`, and the lockfile is NOT exempt.
const NOT_READ_BY_THE_FLEET_PART = [
  /^docs\//, /^\.github\//, /^\.agent-org\//, /^\.claude\//,
  /^\.changeset\//,
  /^packages\/[^/]+\/(CHANGELOG\.md|package\.json)$/,
  /^[^/]+\.md$/,
];

/** @param {string} path */
export function fleetPartReads(path: string) {
  return !NOT_READ_BY_THE_FLEET_PART.some((exempt) => exempt.test(path));
}

/** @param {string} directory a name under `packages/` */
export function isFleetGated(directory: string) {
  return !RUNNER_ONLY_PACKAGES.includes(directory) && !PRIVATE_PACKAGES.includes(directory);
}

/**
 * GitHub's own `error` state is a terminal not-success and is read as `failure`. ANY OTHER value is refused: an
 * unrecognised state must stop the release, never fall through to a default that reads as a pass.
 * @param {string} state
 * @returns {"success" | "failure" | "pending"}
 */
function readState(state: string): "success" | "failure" | "pending" {
  if (state === "success" || state === "pending") return state;
  if (state === "failure" || state === "error") return "failure";
  throw new Error(`CANNOT_TELL: a ${QUALIFICATION_CONTEXT} status in state "${state}", which is none of success, failure, pending`);
}

// The lab writes this description on a `failure` when the launch died BEFORE any capture (the laid-copy check on the lab host, #4572): it
// read nothing, so it is neither a failed run nor a pass. Counting it as a failure raised a `regression` row for a sha no capture ever ran on.
const NO_VERDICT = /^NO VERDICT/;

/** A status as the decision reads it: `no-verdict` is a `failure`/`error` whose description begins `NO VERDICT`, and only those. It is
 * deliberately NOT a fourth state of `readState`: every other caller of that must still refuse an unknown state.
 * @param {Status} status
 * @returns {"success" | "failure" | "pending" | "no-verdict"} */
function readStatus(status: Status): "success" | "failure" | "pending" | "no-verdict" {
  const state = readState(status.state);
  return state === "failure" && NO_VERDICT.test(status.description ?? "") ? "no-verdict" : state;
}

/**
 * The nearest commit, going back from the release sha, that carries a status -- and only while no path the fleet
 * part reads has changed between it and the release. The first commit that did change one ends the search, because
 * every older one differs by at least that much (and a revert that makes the diff empty is read as "changed": the
 * conservative direction).
 * @param {HistoryEntry[]} history nearest first
 */
function nearestVerdict(history: HistoryEntry[]) {
  for (const entry of history) {
    if (entry.changedPaths.some(fleetPartReads)) return null;
    if (entry.statuses.length > 0) return entry;
  }
  return null;
}

/** `failure`s since the last `success`, newest first in, so a pending re-run in between does not hide the first one. A `no-verdict` is
 * skipped, not counted: it neither adds a failure nor hides one older than it.
 * @param {string[]} states */
function failuresSinceSuccess(states: string[]) {
  const lastSuccess = states.indexOf("success");
  const since = lastSuccess === -1 ? states : states.slice(0, lastSuccess);
  return since.filter((state) => state === "failure").length;
}

/**
 * What the decision says about the status history of the nearest qualified commit.
 * @param {HistoryEntry} entry statuses NEWEST FIRST, the order GitHub lists them in
 * @param {string} releaseSha
 * @returns {{ outcome: Outcome, reason: string }}
 */
function verdictFor(entry: HistoryEntry, releaseSha: string): { outcome: Outcome; reason: string; } {
  const states = entry.statuses.map(readStatus);
  const failures = failuresSinceSuccess(states);
  const where = entry.sha === releaseSha ? releaseSha
    : `${entry.sha} (the release sha ${releaseSha} changed no path the fleet part reads since)`;
  const named = entry.statuses[0].description ? ` -- ${entry.statuses[0].description}` : "";
  if (states[0] === "success") return { outcome: "proceed", reason: `qualification succeeded on ${where}${named}` };
  if (states[0] === "pending") {
    const rerun = failures > 0 ? "the re-run after a failure" : "the first run";
    return { outcome: "wait", reason: `qualification is pending on ${where}: ${rerun} has not reported${named}` };
  }
  if (states[0] === "no-verdict") {
    const counted = failures > 0 ? `; ${failures} earlier failed run${failures === 1 ? " is" : "s are"} still counted` : "";
    return { outcome: "wait", reason: `no verdict has been read on ${where}: the last status is a NO VERDICT, which is a launch that read nothing, not a failed run${counted}${named}` };
  }
  if (failures >= 2) {
    return { outcome: "regression", reason: `qualification FAILED twice on ${where}: a real regression, file a row with the \`regression\` label${named}` };
  }
  return { outcome: "rerun", reason: `qualification FAILED once on ${where}: a CANDIDATE regression, not yet a proven one. The lab re-runs the fleet part once on a fresh capture; no threshold moves and no stage is skipped${named}` };
}

/**
 * Does the release publish? PURE: `history` is gathered by `gatherHistory`, so this is testable against a table with
 * no `gh` or git process.
 *
 * @param {{
 *   releaseSha: string,
 *   packages: string[],
 *   history: HistoryEntry[],
 *   waitedMinutes: number,
 * }} input `packages` are the directories under `packages/` this release publishes; `history[0]` is the release sha
 *   itself; `waitedMinutes` is how long that sha has existed, which only a `wait` reads.
 * @returns {{ outcome: Outcome, reason: string, overdue: boolean }}
 */
export function qualificationDecision({ releaseSha, packages, history, waitedMinutes }: {
        releaseSha: string;
        packages: string[];
        history: HistoryEntry[];
        waitedMinutes: number;
    }): { outcome: Outcome; reason: string; overdue: boolean; } {
  if (packages.length === 0) {
    throw new Error("CANNOT_TELL: the release names no package, so whether any fleet stage gates it is unknown");
  }
  if (history.length === 0 || history[0].sha !== releaseSha) {
    throw new Error(`CANNOT_TELL: the history does not begin at the release sha ${releaseSha}`);
  }
  if (!packages.some(isFleetGated)) {
    return { outcome: "proceed", overdue: false,
      reason: `no fleet stage gates ${packages.join(", ")}: released on the runner part alone` };
  }
  const entry = nearestVerdict(history);
  if (entry === null) {
    return waiting(`no ${QUALIFICATION_CONTEXT} status on ${releaseSha} or on an earlier commit with no path the fleet part reads changed since`, waitedMinutes);
  }
  const verdict = verdictFor(entry, releaseSha);
  return verdict.outcome === "wait" ? waiting(verdict.reason, waitedMinutes) : { ...verdict, overdue: false };
}

/** @param {string} reason @param {number} waitedMinutes
 * @returns {{ outcome: Outcome, reason: string, overdue: boolean }} */
function waiting(reason: string, waitedMinutes: number): { outcome: Outcome; reason: string; overdue: boolean; } {
  const overdue = waitedMinutes > WAIT_BOUND_MINUTES;
  return { outcome: "wait", overdue,
    reason: overdue ? `${reason}; waited ${waitedMinutes} min, past the ${WAIT_BOUND_MINUTES} min bound: raise a row, do not skip` : reason };
}

const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
const HISTORY_DEPTH = 30; // main commits back from the release; far past any qualification that is still current

/** @param {string[]} args */
function git(args: string[]) {
  return execFileSync("git", args, { encoding: "utf8", env: sandboxGitEnv() }).trim();
}

/** The lab's own `qualification` statuses out of a commit's listing, in the order GitHub gave them (newest first). A status of that context
 * from any other identity is IGNORED AND NAMED through `report`, never counted and never silent; a creator that cannot be read is another
 * identity, because absence is not the lab. PURE apart from `report`.
 * @param {{ context: string, state: string, description?: string | null, creator?: { login?: string } | null }[]} listing
 * @param {string} sha
 * @param {(line: string) => void} [report] one line per ignored status
 * @returns {Status[]} */
export function qualificationStatusesFrom(listing: { context: string; state: string; description?: string | null; creator?: { login?: string; } | null; }[], sha: string, report: (line: string) => void = (line) => process.stderr.write(`${line}\n`)): Status[] {
  /** @type {Status[]} */ const kept: Status[] = [];
  for (const status of listing) {
    if (status.context !== QUALIFICATION_CONTEXT) continue;
    const login = status.creator?.login;
    if (login === QUALIFICATION_WRITER) kept.push({ state: status.state, description: status.description ?? undefined });
    else report(`release-reads-qualification: IGNORED a ${QUALIFICATION_CONTEXT} status "${status.state}" on ${sha} from ${login ?? "a creator that could not be read"}: only ${QUALIFICATION_WRITER} writes it`);
  }
  return kept;
}

/** Newest first. A lookup failure THROWS: CANNOT ASK is never the same as "no status", which reads as `wait`.
 * @param {string} sha */
function qualificationStatuses(sha: string) {
  return qualificationStatusesFrom(JSON.parse(gh(["api", `repos/${REPO}/commits/${sha}/statuses?per_page=100`])), sha);
}

/** The release sha first, then its first-parent ancestors, each with the paths changed since and its statuses. The
 * walk stops at the first ancestor whose diff touches a read path: nothing older can be used.
 * @param {string} releaseSha */
export function gatherHistory(releaseSha: string) {
  const shas = git(["rev-list", "--first-parent", `--max-count=${HISTORY_DEPTH}`, releaseSha]).split("\n");
  const history = [];
  for (const sha of shas) {
    // `changedFiles` counts BOTH SIDES OF A RENAME (#939): a file moved OUT of a path the fleet part reads must count.
    const changedPaths = sha === releaseSha ? [] : changedFiles([sha, releaseSha]);
    history.push({ sha, changedPaths, statuses: qualificationStatuses(sha) });
    if (changedPaths.some(fleetPartReads)) break;
  }
  return history;
}

/** The directories under `packages/` this release publishes, from the plan's registry readings (the SAME comparison
 * that chose the mode, handed on rather than made again, #3167): the ones AHEAD of the registry on a publish, every
 * published package on a rehearsal, which publishes nothing.
 * @param {string} readingsJson
 * @param {(name: string) => string} directoryOfName published name -> its directory under `packages/` */
export function releasedDirectories(readingsJson: string, directoryOfName: (name: string) => string) {
  const readings = JSON.parse(readingsJson || "null");
  if (!Array.isArray(readings) || readings.length === 0) {
    throw new Error("CANNOT_TELL: the plan handed on no registry readings");
  }
  const ahead = readings.filter((/** @type {{ state: string }} */ r: { state: string; }) => r.state === "ahead");
  return (ahead.length > 0 ? ahead : readings).map((/** @type {{ name: string }} */ r: { name: string; }) => directoryOfName(r.name));
}

/** @param {string} name a published package name */
function directoryOfPublished(name: string) {
  const manifests = git(["ls-files", "packages/*/package.json"]).split("\n");
  for (const path of manifests) {
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    if (manifest.name === name) return path.split("/")[1];
  }
  throw new Error(`CANNOT_TELL: no packages/*/package.json names ${name}`);
}

/** @param {string} releaseSha */
function minutesSince(releaseSha: string) {
  const committed = Number(git(["show", "-s", "--format=%ct", releaseSha]));
  return Math.round((Date.now() / MS_PER_SECOND - committed) / SECONDS_PER_MINUTE);
}

/**
 * The ONE row a release raises, or null when the outcome raises none. `regression` (two failures) and an OVERDUE `wait`
 * each name a row; `proceed`, `rerun` and a wait still inside its bound do not. The title carries the whole sha and is
 * the row's identity: the filing job looks it up before it files, so a re-run of the failed job finds the row and
 * files none. NEVER a skip: both bodies say the release stays stopped.
 * @param {{ outcome: Outcome, reason: string, overdue: boolean }} decision
 * @param {string} releaseSha
 * @param {string} [runUrl] the run that stopped, where the log is
 * @returns {{ title: string, labels: string[], body: string } | null}
 */
export function rowToFile({ outcome, reason, overdue }: { outcome: Outcome; reason: string; overdue: boolean; }, releaseSha: string, runUrl?: string): { title: string; labels: string[]; body: string; } | null {
  const found = runUrl ? `Run: ${runUrl}\n` : "";
  const stop = "The release stays stopped. Nothing is skipped to get a pass, no threshold moves, and there is no revert (fix forward).";
  if (outcome === "regression") {
    return { title: `release ${releaseSha}: qualification regression confirmed`, labels: ["regression", "answer:orchestrator"],
      body: `Release sha: ${releaseSha}\n${found}\nThe fleet part failed TWICE on this sha: ${reason}\n\n${stop} The writer of the \`${QUALIFICATION_CONTEXT}\` status is #3289; the contract is #3136.\n` };
  }
  if (outcome === "wait" && overdue) {
    return { title: `release ${releaseSha}: qualification wait overdue`, labels: ["qualification-overdue", "answer:orchestrator"],
      body: `Release sha: ${releaseSha}\n${found}\nNo verdict inside the ${WAIT_BOUND_MINUTES} minute bound (a first verdict plus one re-run at the longest first verdict measured, 54:24 on #3289: a measured maximum and not a guarantee): ${reason}\n\n${stop} The writer of the \`${QUALIFICATION_CONTEXT}\` status is #3289, and until it exists every real release lands here. Once the lab has posted, re-run the failed jobs of the run.\n` };
  }
  return null;
}

/** GitHub's multi-line output form, for EVERY value: a reason carries the lab's own description, and a newline in a
 * plain `name=value` line would write an output nobody named. The delimiter is random so no value can end its own block.
 * @param {Record<string, string>} values */
function outputText(values: Record<string, string>) {
  const delimiter = `ghadelimiter_${randomUUID()}`;
  return Object.entries(values).map(([name, value]) => `${name}<<${delimiter}\n${value}\n${delimiter}\n`).join("");
}

/** @param {Record<string, string>} values */
function writeOutputs(values: Record<string, string>) {
  const outFile = process.env.GITHUB_OUTPUT;
  if (!outFile) {
    console.log(Object.entries(values).map(([name, value]) => `${name}=${value}`).join("\n"));
    return;
  }
  appendFileSync(outFile, outputText(values));
}

function currentRunUrl() {
  const { GITHUB_SERVER_URL: server, GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: run } = process.env;
  return server && repository && run ? `${server}/${repository}/actions/runs/${run}` : undefined;
}

function main() {
  refuseUnknownFlags(["--sha", "--readings"], { entry: import.meta.url, command: "node scripts/release-reads-qualification.ts" });
  const releaseSha = flagValue(process.argv.slice(2), "sha") ?? git(["rev-parse", "HEAD"]);
  const packages = releasedDirectories(flagValue(process.argv.slice(2), "readings") ?? "", directoryOfPublished);
  const decision = qualificationDecision({ releaseSha, packages, history: gatherHistory(releaseSha),
    waitedMinutes: minutesSince(releaseSha) });
  // THE LOG NAMES, ON EVERY RUN, WHICH OUTCOME THE RELEASE TOOK AND FOR WHICH SHA (#3136 done-when 2).
  process.stdout.write(`release-reads-qualification: outcome=${decision.outcome} sha=${releaseSha} -- ${decision.reason}\n`);
  const row = rowToFile(decision, releaseSha, currentRunUrl());
  writeOutputs({ outcome: decision.outcome, reason: decision.reason, overdue: String(decision.overdue),
    ...(row ? { "row-title": row.title, "row-labels": row.labels.join(","), "row-body": row.body } : {}) });
  if (decision.outcome !== "proceed") {
    process.stderr.write(`::error::release-reads-qualification: ${decision.outcome} -- ${decision.reason}\n`);
    process.exitCode = 1;
  }
}

// REALPATH'D, per `entry-points.test.ts` (#1086): reached through a symlink, the plain form skips main() and exits 0 silently.
if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
