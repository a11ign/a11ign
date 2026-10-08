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
 * THE CLOCK STARTS WHEN THE POLL COULD FIRST SEE THE RELEASE, which is the later of its publish and its promotion to `latest` (#4163,
 * found by #4160). The poll runs `npm view a11ign dist-tags.latest`, so a version published to `next` is invisible to it until promoted.
 * MEASURED 2026-10-08: a11ign@0.3.2 was published 2026-10-07T23:59:49Z and promoted 2026-10-08T14:23:14Z, 14.4 h later; aged from the
 * publish it read `absent` 1.2 h after the poll could first see it. release.yml documents a long `next`-to-`latest` wait as normal.
 *
 * How long a version may go with no run before `pending` becomes `absent`. MEASURED 2026-10-08T07:55Z on the outside repository
 * itself (#4059, found by #3224): `gh run list --repo a11ign-labs/a11ign-consumer-check --workflow outsider-job.yml --event schedule
 * --limit 100 --json createdAt` returned 21 scheduled runs since 2026-10-03T16:32Z, so 20 gaps: minimum 2.8 h, median 6.1 h,
 * MAXIMUM 9.3 h (GitHub ran about one hourly tick in six). A publish just after a poll waits that whole gap for the next one, and
 * the windows-2022 job on a green run took 6:07 at most (generate.mjs's header), so a publish is run-complete within about
 * 9.3 h + 0.1 h = 9.4 h at the worst gap seen; this is that plus roughly a quarter, rounded up.
 * SUPERSEDED: the first window, 9 h, was built on a 7.2 h worst gap over 100 runs of the organisation's own repository (INFERRED:
 * the outside repository did not exist yet). The sample of 20 is small and its maximum moved by 2.1 h between the two
 * repositories, so the margin is the point: widen it again if a gap longer than this window is read.
 *
 * A VERSION SUPERSEDED AS `latest` BEFORE ANY POLL SAW IT IS NEVER `absent`, because it is never asked about. This reader judges
 * only the release `latest` points at (`verdict-job.mjs` passes the registry's `latest`), and a version that stopped being
 * `latest` no longer has a verdict to give: not `absent` ("the rehearsal did not run"), not anything else. Measured:
 * a11ign@0.3.0 was promoted at 2026-10-07T20:41:30Z, 51 s after a poll, and superseded by 0.3.1 (22:51:23Z) before the next one:
 * it never got a run and that is not a failure of the job. The outsider test pins this.
 */
const WINDOW_HOURS = 12;
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
 * When the release became visible to the poll: the later of publish and promotion. A promotion time that is absent is NOT read as
 * "promoted at publish": the publish time stands in, and `noted` says so, because absence is not proof.
 * @param {{ publishedAt: string, promotedAt?: string | null }} facts
 * @returns {{ since: number, noted: string }}
 */
function visibleSince({ publishedAt, promotedAt }) {
  const published = timeOf(publishedAt, "the version's publish time");
  if (!promotedAt) return { since: published, noted: "; the promotion time was not found, so the age runs from the publish" };
  return { since: Math.max(published, timeOf(promotedAt, "the version's promotion time")), noted: "" };
}

/**
 * @param {{ latest: string, tagSha: string, publishedAt: string, promotedAt?: string | null, now: string, runs: OutsiderRun[] }} facts
 * @returns {OutsiderVerdict}
 */
export function outsiderVerdict({ latest, tagSha, publishedAt, promotedAt, now, runs }) {
  refuseUnreadableRelease({ latest, tagSha });
  const { since, noted } = visibleSince({ publishedAt, promotedAt });
  const age = timeOf(now, "now") - since;
  const answers = runs.filter((run) => isNamedForRelease(run, { latest, tagSha }) && hasAnswered(run));
  if (answers.length > 0) return verdictOfRun(newestOf(answers));
  const hours = (age / HOUR_MS).toFixed(1);
  const seen = promotedAt ? "visible as latest" : "published";
  return age <= WINDOW_MS
    ? { verdict: "pending", reason: `no run yet for v${latest}, ${seen} ${hours} h ago, inside the ${WINDOW_HOURS} h window${noted}` }
    : { verdict: "absent", reason: `no run for v${latest}, ${seen} ${hours} h ago, past the ${WINDOW_HOURS} h window: the rehearsal did not run${noted}` };
}
