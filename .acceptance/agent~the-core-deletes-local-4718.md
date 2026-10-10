The core deletes its originals of `local-import-closure` and `tree-wide-guard` and imports them from `@a11ign/toolchain/lib/<stem>` (#4425 phase 3, core row 2b), so each has one source.

- Deleted: `packages/guards/src/local-import-closure.ts`, `packages/guards/src/tree-wide-guard.ts`; their two private subpath exports in `packages/guards/package.json`; the `local-import-closure.ts` entry (and its count, 18 to 17) in `.c8rc.json`.
- Repointed to `@a11ign/toolchain/lib/<stem>`: `tree-wide-guards.ts`, `layer-edges.ts`, `layer-edges.test.ts`, `tracked-prose-leak-guard.test.ts`, `tracked-source-leak-guard.test.ts`, `packages/judge/src/criteria-counts-are-not-spelled-out.test.ts`.
- **`walk-scope` STAYS as a declared copy, and the PR says why (done-when 2).** Measured at toolchain 0.7.0: `REPO_ROOT` in `dist/lib/walk-scope.mjs` is `new URL("../../", import.meta.url)`, which as installed is the toolchain package directory, not the repository. A probe that reads `package.json` after importing each module reports `readsSoFar()` containing it for the core's `walk-scope.ts` (`REPO_ROOT` = this worktree) and NOT for the toolchain's (`REPO_ROOT` = `node_modules/@a11ign/toolchain`, 0 reads). As the rstest preload it would observe no read of this repository. `scripts/rstest/rstest.config.ts` and its trigger glob are therefore unchanged. The parity/`REPO_ROOT` question is for the toolchain (a root override), filed beside #4707.
- One change the Region did not list, forced by the deletion: `packages/guards/src/lab-delete.test.ts` built its `treeWideGuardFiles` fixture around the deleted file's path. It now builds it around the toolchain specifier, and gains a negative control (marker only in a comment, or imported and never called, is not discovered).
- Discovery: `tree-wide-guards.ts` resolved the marker through `localImports`, which follows relative specifiers only, so a bare `@a11ign/toolchain/lib/tree-wide-guard` import would have dropped every tree-wide guard from the sweep. It now reads the specifier off the comment-stripped source and keeps the resolved-path check for `agent-org`'s copy. Population measured with `node packages/guards/src/tree-wide-guards.ts | wc -l`: 4 at `origin/main` (9499ee7da), 4 here, same four files.

platform: none needed. No fleet, lab or worker command was run.

Acceptance:
```bash
bash -c 'test "$(git ls-files | grep -cE "^packages/guards/src/(local-import-closure|tree-wide-guard)\.ts$")" = 0'
bash -c 'git grep -q "@a11ign/toolchain/lib/tree-wide-guard" -- packages'
bash -c 'git grep -q "@a11ign/toolchain/lib/local-import-closure" -- packages'
```

Mutation: the open-check on `origin/main` reads 3 (this tree: 1, `walk-scope.ts` only), and the first command fails there. Discovery, both directions, through `assert-glob-not-empty.ts packages/guards/src/lab-delete.test.ts --runner=rstest`: baseline 16 pass; marker regex that never matches, 2 fail and the sweep lists 0 files; comments not stripped, 1 fails; call not required, 1 fails; each restored with `cp` and `diff`-identical, 16 pass.

Closes #4718

🤖 Generated with [Claude Code](https://claude.com/claude-code)
