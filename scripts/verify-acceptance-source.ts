/**
 * #4600: the diff `verify` hands agent-org's `checkBody`, WITH the paths the branch ADDS.
 *
 * `checkBody` reads the `Acceptance:` family from the `.acceptance/` file a branch adds (ADR 0044) and only falls back to the body when
 * `diff.added` names none. A diff with no `added` therefore made `verify` read the body alone and print `ACCEPTANCE: MISSING` for every pull
 * request that follows the ADR, where `pr:open` and CI read the file and pass. Its own module, importing nothing of `verify.ts`, so its test
 * reaches no `corpus` and no agent-org tool.
 */

/**
 * Deleted files, and the old side of a rename, are in `files` and owe no mutant, and an added path that is not on disk cannot be read: both are dropped.
 * @param {{ files: string[], added: string[], exists: (path: string) => boolean }} input
 */
export function acceptanceDiffOf({ files, added, exists }: { files: string[]; added: string[]; exists: (path: string) => boolean; }) {
  return { ok: true as const, files: files.filter(exists), added: added.filter(exists) };
}
