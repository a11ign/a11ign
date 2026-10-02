// @ts-check
// THE FREEZE ON `packages/agent-org/` -- a11ign/a11ign#2976, PR 1 of 2 (chairman's cut-over ruling, 2026-10-02).
//
// Since the agents host was pointed at `a11ign/agent-org` (15:23Z), the tool the live gate runs is THAT repository's. This directory is the
// OLD COPY: a change merged here reaches nothing. 24 pull requests touched it between the 06:50Z ruling and 17:57Z, two of them AFTER the
// host moved (#3035, #3036), and nothing refused one. This is the refusal.
//
// WHAT IT COMPARES IS GIT'S OWN BLOB IDS, not file text and not a list of names: a path's `<mode> <blob id>` in the index is the one fact
// that says "this file is byte-for-byte what it was". Read from the INDEX (`git ls-files -s`), so the guard sees what a commit would carry,
// the way CI's checkout does, and a file edited but not yet staged is invisible until it is -- the cost of asking git rather than the disk.
//
// DELETION IS ALLOWED, ADDITION AND CHANGE ARE NOT. Row 5's second pull request deletes the directory, and the freeze must let it. A path
// moved INTO the directory is an addition, and refused.
//
// THE MANIFEST (`agent-org-frozen-manifest.json`) IS WRITTEN BY THIS FILE'S OWN READER, never typed: the same `trackedBlobs` the guard calls
// produced it, so the two cannot disagree about what a "path" or an "id" is. It, this file and the test are deleted by row 5's second pull
// request, which replaces the freeze with "no tracked path begins `packages/agent-org/`".
import { execFileSync } from "node:child_process";
import { sandboxGitEnv } from "../../../guards/src/git-env.mjs";

/** The directory being frozen, with the trailing slash that makes it a prefix and not a name. */
export const FROZEN_DIR = "packages/agent-org/";

/** Where the change goes instead: the repository the live gate runs. */
export const TOOL_REPO = "a11ign/agent-org";

/** `git ls-files -s -z` of a 174-file directory is about 25 KB; the default 1 MB buffer is ample, named so a refusal is not a surprise. */
const MAX_LS_FILES_BYTES = 16_777_216;

/** One `git ls-files -s -z` record: `<mode> <blob id> <stage>\t<path>`. */
const STAGED_RECORD = /^(\d{6}) ([0-9a-f]{40,64}) (\d)\t(.+)$/s;

/**
 * Every tracked path under the frozen directory, as `{ path: "<mode> <blob id>" }`, from the index of the repository at `root`.
 *
 * A record this cannot parse THROWS. A reader that skipped what it could not read would answer "nothing changed" about a directory it could
 * not see, which is the one answer this guard must never give by default.
 * @param {string} root
 * @returns {Record<string, string>}
 */
export function trackedBlobs(root) {
  const raw = execFileSync("git", ["ls-files", "-s", "-z", "--", FROZEN_DIR],
    { cwd: root, encoding: "utf8", env: sandboxGitEnv(), maxBuffer: MAX_LS_FILES_BYTES });
  /** @type {Record<string, string>} */
  const blobs = {};
  for (const record of raw.split("\0").filter((r) => r !== "")) {
    const parsed = STAGED_RECORD.exec(record);
    if (parsed === null) throw new Error(`agent-org freeze: cannot read \`git ls-files -s\` record ${JSON.stringify(record)}`);
    blobs[parsed[4]] = `${parsed[1]} ${parsed[2]}`;
  }
  return blobs;
}

/**
 * What `current` has that `frozen` does not admit. A path in `frozen` and absent from `current` is a deletion and is not reported.
 * @param {Record<string, string>} frozen
 * @param {Record<string, string>} current
 * @returns {{ added: string[], changed: string[] }}
 */
export function breaches(frozen, current) {
  const added = [];
  const changed = [];
  for (const [path, id] of Object.entries(current)) {
    if (!(path in frozen)) added.push(path);
    else if (frozen[path] !== id) changed.push(path);
  }
  return { added: added.sort(), changed: changed.sort() };
}

/**
 * The refusal, or `null` when the directory only ever lost files. It names the repository to port the change to, because "refused" with no
 * destination is the message that gets argued with.
 * @param {{ added: string[], changed: string[] }} found
 * @returns {string | null}
 */
export function refusalFor({ added, changed }) {
  if (added.length === 0 && changed.length === 0) return null;
  const lines = [
    `\`${FROZEN_DIR}\` is FROZEN: the agents host runs ${TOOL_REPO}, so a change merged here reaches nothing.`,
    `Make this change in ${TOOL_REPO} (a pull request there) and port it; do not edit this copy. It is deleted by a11ign/a11ign#2976.`,
    ...changed.map((p) => `  CHANGED  ${p}`),
    ...added.map((p) => `  ADDED    ${p}`),
  ];
  return lines.join("\n");
}
