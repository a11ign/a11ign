The core deletes its originals of `git-sandbox` and `test-memory-cap` and imports them from `@a11ign/toolchain/lib/<stem>` (#4425 phase 3, core row 2a), so each has one source: the toolchain's. The `@a11ign/toolchain` pin is already `0.7.0` (#4589); no pin move is part of this row.

- Deleted: `scripts/test-support/git-sandbox.ts` and `packages/guards/src/test-memory-cap.ts` (neither had a test file of its own in the core).
- Eleven guard tests import `withGitSandbox` / `sandboxGitEnv` / `GitSandbox` from `@a11ign/toolchain/lib/git-sandbox`; `assert-glob-not-empty.ts` imports `runUnderCap` from `@a11ign/toolchain/lib/test-memory-cap`. No assertion in any of them changed.
- The pre-push leak scan runs `node node_modules/@a11ign/toolchain/dist/lib/test-memory-cap.mjs run tsx -- …`. A hook runs on a checkout that has installed, so the path exists; run by hand it printed `memory cap: MemoryMax=4G via systemd-run`, ran the child and exited 0.
- Files the grep found that the Region did not list, each a consequence of the deletion: `packages/guards/src/git-spawn-scrubbed.ts` (the lint rule matched the helper by the tail `git-sandbox.ts` of a relative specifier; the toolchain specifier has no extension, so without the new entry 9 spawn sites in 6 test files failed `local/git-spawn-scrubbed`), `packages/guards/src/worktree-resolution.test.ts` (copied `test-memory-cap.ts` into a constructed tree; the copy resolves it from the tree's toolchain link it already had), and a comment in `packages/guards/src/git-env.ts`.
- One behavioural difference, read off both files: the toolchain's `withGitSandbox` defaults `root` to `new URL("../../", import.meta.url)` of ITS file, i.e. the toolchain package directory, not the core checkout. With the in-tree pnpm install that directory sits inside this checkout, so `git rev-parse` there fingerprints this checkout; no test passes the default and asserts on it, and the tests that pass a decoy `root` are unaffected.

Verification: `pnpm run lint` 0 errors; `pnpm run typecheck` clean; the eleven affected test files from the repo root: 212 tests, 212 pass, 0 fail, plus `bootstrap-copies-changed-match-toolchain.test.ts` (8 of 8) after the rebase onto `f2825d708`.

Outside-Region: packages/guards/src/git-spawn-scrubbed.ts — the `local/git-spawn-scrubbed` rule recognises the sandbox by the tail `git-sandbox.ts` of a relative specifier; the toolchain specifier has no extension, so without the entry 9 spawn sites in 6 test files fail lint.
Outside-Region: packages/guards/src/worktree-resolution.test.ts — copies `packages/guards/src/test-memory-cap.ts` into a constructed tree; that file is deleted, and `assert-glob-not-empty.ts` now resolves the module from the tree's existing toolchain link.
Outside-Region: packages/guards/src/bootstrap-copies-changed-match-toolchain.test.ts — landed on `main` (#4719) after this branch was cut and imports the deleted `scripts/test-support/git-sandbox.ts`; the queue's merge with `main` failed lint on it (run 38021476722).
Outside-Region: packages/guards/src/git-env.ts — a comment named `test-support/git-sandbox.ts`, which no longer exists.

platform: none needed, no worker, fleet or lab command was run.

Acceptance:
```bash
bash -c 'test "$(git ls-files | grep -cE "^(scripts/test-support/git-sandbox|packages/guards/src/test-memory-cap)\.ts$")" = 0'
bash -c 'git grep -q "@a11ign/toolchain/lib/git-sandbox" -- packages scripts'
bash -c 'git grep -q "toolchain/dist/lib/test-memory-cap.mjs" -- scripts/git-hooks/pre-push'
```

Mutation: the open-check on `origin/main` reads 2 and the first command fails there; the second fails on `origin/main` (no `lib/git-sandbox` specifier) and the third fails there too (the hook runs `packages/guards/src/test-memory-cap.ts`). The lint rule's own marker, both directions: with `git-sandbox.ts` still the only sandbox spelling, 9 `local/git-spawn-scrubbed` errors; with the toolchain specifier added, 0.

Closes #4590

🤖 Generated with [Claude Code](https://claude.com/claude-code)
