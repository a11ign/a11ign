## What

`packages/guards/src/bootstrap-copies-changed-match-toolchain.test.ts`: after install, compares the core's two bootstrap copies `changed-files` and `changed-packages` with `@a11ign/toolchain/lib/<stem>` at the pinned 0.7.0. Exported names are the same set and each function returns the same value over a table of inputs, run inside a throwaway git repository (with and without `origin/main`) because both modules read the repository they sit in. Positive control: a copy with `--no-renames` dropped (and one with the package pattern widened) is reported; a copy altered only in a comment is not.

Measured: 8 of 8 pass at this head; with `--no-renames` removed from the real `changed-files.ts`, 5 of 8 fail (file restored byte-identical, `diff` empty). Not run: `pnpm run verify` (this worktree has a hybrid `node_modules`; `tsc --noEmit` reports only `@a11ign/documents` not found in `packages/cli`, nothing in this file).

platform: checked pnpm/node: nothing compares two modules' behaviour; sibling test #4707 is the pattern.

Acceptance: npx rstest run --config scripts/rstest/rstest.config.* packages/guards/src/bootstrap-copies-changed-match-toolchain.test.ts

Closes #4719
