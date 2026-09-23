// @ts-check
// ONE TREE WALK THAT SURVIVES A SYMLINK, BECAUSE FOUR COPIES OF IT DID NOT -- #2171.
//
// `statSync` FOLLOWS a link. A walk that recurses on `statSync(full).isDirectory()` therefore descends a
// directory symlink, and a link that points at one of its own ancestors makes it descend for ever: the
// kernel stops it with `ELOOP`, thrown from wherever the walk happened to be, carrying a path 42 segments
// deep and naming nothing that caused it.
//
// That is not a hypothetical. Five self-referential links (`packages/guards/guards -> packages/guards`,
// and the same inside `lab`, `nvda-worker`, `scorer` and `worker-fleet`) sat UNTRACKED in the shared
// primary checkout from Sep 19 to Sep 23 2026, debris of a hybrid `node_modules` setup made in the wrong
// directory. The symptom was two tests in `packages/judge` going red for four days -- files with nothing
// to do with symlinks -- so the two obvious readings, "trunk is red" and "my change broke the judge
// package", were both wrong and both available.
//
// FOUR walkers had this defect and each was a PRIVATE INNER FUNCTION, so nothing could call one and no
// test could assert that the walk terminates. That absence is why it stayed invisible, and it is the whole
// argument for one exported walker rather than four one-word edits. `board-snapshot-scope.mjs:44` and
// `prune-worktrees.mjs:166` already spelled it `lstatSync`, so the repository answered this one question
// two ways with the safe answer in the minority.
import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * @typedef {object} WalkChoices
 * @property {(name: string) => boolean} [skipDirectory] a directory NOT to descend, by entry name. The
 *   caller's own decision: `node_modules` and `dist` are not source to most walks here, and are to none.
 * @property {(name: string) => boolean} [keepFile] a file to REPORT, by entry name. Defaults to all of
 *   them, so a caller that wants every file says nothing.
 */

/**
 * Every file beneath `root`, depth-first, each directory's entries in name order, joined onto `root` as
 * the caller spelled it -- pass an absolute root to get absolute paths back.
 *
 * **A SYMLINK IS NEITHER DESCENDED NOR REPORTED.** `readdirSync(..., { withFileTypes: true })` answers
 * from the directory entry, which is what `lstat` reads and what `stat` throws away: a link to a
 * directory is a link, not a directory, so the walk terminates over the cycle in the header above. It is
 * not reported either, because a link's target is either already inside `root` -- where following it
 * double-counts a file this walk has already visited or will -- or outside it, where a caller that
 * declared a subtree (`walk-scope.mjs`) never agreed to read.
 *
 * An unreadable directory THROWS, and is meant to: a walk that swallows its own `readdirSync` reports
 * success having examined nothing, which is the failure every caller here already carries a floor
 * against. A caller whose root may legitimately not exist asks first.
 *
 * @param {string} root
 * @param {WalkChoices} [choices]
 * @returns {string[]}
 */
export function filesUnder(root, choices = {}) {
  /** @type {string[]} */
  const found = [];
  collectInto(found, root, choices);
  return found;
}

/**
 * The recursion, apart from the call so that `filesUnder` states the contract and this states the walk.
 * @param {string[]} found @param {string} dir @param {WalkChoices} choices
 */
function collectInto(found, dir, choices) {
  const { skipDirectory = () => false, keepFile = () => true } = choices;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (!skipDirectory(entry.name)) collectInto(found, join(dir, entry.name), choices);
      continue;
    }
    if (entry.isFile() && keepFile(entry.name)) found.push(join(dir, entry.name));
  }
}
