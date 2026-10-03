// @ts-check
// #3181 (part of #928): the READER of the outside repository's verdict. A pure decision over four facts and no I/O:
// the registry's `latest` version, that release tag's commit sha, when the version was published, and the outside
// repository's run list (`gh run list --json displayTitle,status,conclusion,createdAt`, public, no credential).
// The next row wires it; nothing here fetches, files a row or refuses a publish.
//
// ADR 0041 decision 3: a block files a row and does NOT revert, and a version on the registry cannot be unpublished
// after 72 hours, so what `red` does downstream is file ONE `regression` row per version. It never refuses the next
// publish: the fix is itself a release, and a refusal would deadlock it behind its own defect.
//
// THE INVARIANT IS ONE-WAY: `green` needs a COMPLETED, SUCCESSFUL run NAMED for this version AND this tag's sha, and
// every other state is something else. Absence is not proof, so "no run" is `pending` or `absent` and is never
// `green`; a fact this reader cannot read (a malformed version, an unreadable date) THROWS, because a verdict that
// guessed would be the reader that says `green` on a bad day.
//
// THE NAME CARRIES THE SHA, not just the version. The run is named `outsider v<version> <tag sha>` (`run-name` in
// generate.mjs), so a run for a tag that was later moved is not this release's answer, and `v0.1.1` never matches
// `v0.1.10`: the name is compared token by token, never searched.

const HOUR_MS = 3_600_000;

/**
 * How long a version may go with no run before `pending` becomes `absent`. MEASURED 2026-10-03 (the commands and
 * output are in generate.mjs's header): the worst gap between consecutive runs of an hourly cron on this
 * organisation's own repository was 7.2 h over 100 runs, dispatch-to-start is seconds, and the windows-2022 job on
 * a green run took 6:07 at most. So a publish is run-complete within about 7.4 h, and this is that plus roughly a
 * quarter. INFERRED from those parts: no release has yet gone through a poll, because the outside repository
 * does not exist.
 */
const WINDOW_HOURS = 9;
export const WINDOW_MS = WINDOW_HOURS * HOUR_MS;

/** The conclusions that ANSWER: a run that ended any other way (cancelled, skipped, neutral, stale) never said. */
const GREEN_CONCLUSIONS = ["success"];
const RED_CONCLUSIONS = ["failure", "timed_out", "startup_failure", "action_required"];

export const VERSION_SHAPE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const FULL_SHA_SHAPE = /^[0-9a-f]{40}$/;

/**
 * @typedef {{ displayTitle: string, status: string, conclusion: string | null, createdAt: string }} OutsiderRun
 * @typedef {{ verdict: "green" | "red" | "pending" | "absent", reason: string, run?: OutsiderRun }} OutsiderVerdict
 */

/**
 * The title the workflow's `run-name` gives a run for one release: the only name this reader recognises.
 * @param {{ version: string, sha: string }} release
 * @returns {string}
 */
export function outsiderRunTitle({ version, sha }) {
  return `outsider v${version} ${sha}`;
}

/** @param {string} value @param {string} what @returns {number} */
function timeOf(value, what) {
  const time = Date.parse(value);
  if (Number.isNaN(time)) throw new TypeError(`${what} is not a date this reader can read: ${JSON.stringify(value)}`);
  return time;
}

/** @param {{ latest: string, tagSha: string }} facts */
function refuseUnreadableRelease({ latest, tagSha }) {
  if (!VERSION_SHAPE.test(latest)) {
    throw new TypeError(`the registry's latest version is not a version this reader can read: ${JSON.stringify(latest)}`);
  }
  if (!FULL_SHA_SHAPE.test(tagSha)) {
    throw new TypeError(`the release tag's sha is not a full 40-character sha: ${JSON.stringify(tagSha)}`);
  }
}

/** @param {OutsiderRun} run @param {{ latest: string, tagSha: string }} release @returns {boolean} */
function isNamedForRelease(run, { latest, tagSha }) {
  return run.displayTitle === outsiderRunTitle({ version: latest, sha: tagSha });
}

/** @param {OutsiderRun} run @returns {boolean} a run that is unfinished, or finished green or red */
function hasAnswered(run) {
  if (run.status !== "completed") return true;
  return [...GREEN_CONCLUSIONS, ...RED_CONCLUSIONS].includes(run.conclusion ?? "");
}

/** @param {OutsiderRun[]} runs @returns {OutsiderRun} the newest by `createdAt`: a rerun after a red or a green decides */
function newestOf(runs) {
  return runs.reduce((newest, run) => (timeOf(run.createdAt, "a run's createdAt") > timeOf(newest.createdAt, "a run's createdAt") ? run : newest));
}

/** @param {OutsiderRun} run @returns {OutsiderVerdict} */
function verdictOfRun(run) {
  if (run.status !== "completed") return { verdict: "pending", reason: `the run is ${run.status}, not finished`, run };
  if (GREEN_CONCLUSIONS.includes(run.conclusion ?? "")) return { verdict: "green", reason: "the newest run for this release completed successfully", run };
  return { verdict: "red", reason: `the newest run for this release ended ${run.conclusion}`, run };
}

/**
 * @param {{ latest: string, tagSha: string, publishedAt: string, now: string, runs: OutsiderRun[] }} facts
 * @returns {OutsiderVerdict}
 */
export function outsiderVerdict({ latest, tagSha, publishedAt, now, runs }) {
  refuseUnreadableRelease({ latest, tagSha });
  const age = timeOf(now, "now") - timeOf(publishedAt, "the version's publish time");
  const answers = runs.filter((run) => isNamedForRelease(run, { latest, tagSha }) && hasAnswered(run));
  if (answers.length > 0) return verdictOfRun(newestOf(answers));
  const hours = (age / HOUR_MS).toFixed(1);
  return age <= WINDOW_MS
    ? { verdict: "pending", reason: `no run yet for v${latest}, published ${hours} h ago, inside the ${WINDOW_HOURS} h window` }
    : { verdict: "absent", reason: `no run for v${latest}, published ${hours} h ago, past the ${WINDOW_HOURS} h window: the rehearsal did not run` };
}
