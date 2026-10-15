## What

The guard names three restatements the re-pin planner cannot move by design (dated reads and a behavioural claim), so a merged re-pin leaves the docs failing the very guard it was written to pass. This takes the row's option (a): the three sentences are reworded so none names a release or commit. The planner is unchanged.

- `docs/github-action.md:22-23`: "commit of release 0.10.8 (`npm view` read `latest` / `0.10.8` on 2026-10-15; `next` was 0.10.9)" now names the release the line above names. The dated read keeps its date.
- `docs/github-action.md:142`: "as `0.10.8` does" is dropped.
- `docs/try-it.md:363`: "The pin above is release `0.10.8` (tag, commit)" and the dated `npm view` / `ls-remote` reads now name the pinned release, not a version. The dated reads keep their dates.

Line numbers: the row quoted `try-it.md:354` and the github-action lines; main already carries the hand re-pin to 0.10.8 (884e37793), so those lines were stale and the sentences were at the numbers above.

New test (the 32nd in `docs-release-pin-currency.test.ts`): re-pins the real docs to a later release and asserts the planner has nothing `unmoved` and the guard reads no fault over the result. It fails on the pre-change docs, naming `docs/github-action.md:22`, `:142` and `docs/try-it.md:363`.

## Evidence

- `docs-release-pin-currency.test.ts`: 32 of 32 pass.
- `docs-release-pin-currency.real-tree.test.ts`: 2 of 2 pass.
- `pnpm run lint`: 0 errors. `pnpm run typecheck`: clean.
- `pnpm run verify` against this commit: GREEN (affected set 238 files, 2991 tests passed).

## Not done here

- Prose in the same docs that names 0.10.8 but is not one the guard flags (try-it.md lines 34, 56-57, 155, 159-167, 190, 279, 284, 308, 344; github-action.md lines 49, 55, 356-357, 413, 500) is left as written. The guard does not read it.
- Done-when item 2 (re-run #5554's Acceptance after #5566 merges) is not run in this PR.

Acceptance: pnpm exec rstest run --config scripts/rstest/rstest.config.ts packages/guards/src/docs-release-pin-currency.test.ts

Closes #5567

🤖 Generated with [Claude Code](https://claude.com/claude-code)
