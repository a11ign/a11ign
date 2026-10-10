The core deletes its originals of six leaf helpers and imports them from `@a11ign/toolchain/lib/<stem>` (#4425 phase 3, core row 1 of 3), narrowed from ten by product-manager's two rulings on the row (comments 6092829588, 6093019983): `cli-flags`, `git-env` and `npm-cli-executable` have pre-install consumers and stay as declared bootstrap copies; `packages/evidence/src/source-text.ts` stays, with its test and its `./source-text` subpath, because the laid fleet (v0.7.2, `command-line-census.ts:30`) still imports `@a11ign/evidence/source-text`. Its deletion and the fleet pin bump are a11ign#4712, which waits on this row and on #4711.

- Deleted: `scripts/fixture-symbols.ts`, `scripts/product-home.ts`, `packages/guards/src/{sandbox-exhaustion,walk-scope-declaration,walk-scope-discovery,worktree-resolution}.ts`, and the tests that moved with the leaf to the toolchain (`sandbox-exhaustion`, `walk-scope-declaration`, `walk-scope-discovery`, and the leaf half of `worktree-resolution`).
- Kept in the core: the four `worktree-resolution` tests that exercise a CALLER (`memberScopeLister`, a constructed copy of `assert-glob-not-empty.ts`, the `agent-org` CLI). The `#2218` tree now links `node_modules/@a11ign/toolchain` because the floor imports the leaf from there.
- Importers outside `packages/evidence` (the cli and judge tests, three guard tests, `assert-glob-not-empty.ts`, `walk-scope.ts`, the comment in `local-import-closure.ts`) read `@a11ign/toolchain/lib/<stem>`; `packages/evidence` keeps its local `source-text` (ADR 0006).
- `packages/guards/package.json` drops two private exports. The four `@a11ign/toolchain` pins move 0.5.0 to 0.7.0, with `pnpm-lock.yaml`.
- Sweep: one pull request, because the stems share consumers (declared on the row).

Verification: `pnpm run lint` 0 errors; `pnpm run typecheck` clean; `pnpm run test:all` 201 files, 2642 tests, 0 failed, 21 skipped.

platform: none needed, no worker or fleet command was run.

Acceptance:
```bash
bash -c 'test "$(git ls-files | grep -cE "^(scripts/(fixture-symbols|product-home)|packages/guards/src/(sandbox-exhaustion|walk-scope-declaration|walk-scope-discovery|worktree-resolution))\.ts$")" = 0'
bash -c 'git grep -q "@a11ign/toolchain/lib/source-text" -- scripts packages'
```

Mutation: the open-check on `origin/main` reads 6 and the first command fails there; the second command fails on `origin/main` (no `lib/source-text` specifier in `scripts` or `packages`) and passes on this tree. Re-adding `scripts/product-home.ts` to the index made the first command read 1, and removing it restored 0.

Closes #4589

🤖 Generated with [Claude Code](https://claude.com/claude-code)
