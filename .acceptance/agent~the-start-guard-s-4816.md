`memberScopeLister` (`packages/guards/src/assert-glob-not-empty.ts`) now also leaves out an entry that is not a workspace member and resolves, by `realpath`, under a `node_modules/.pnpm/` directory, this tree's or another checkout's. A per-PR reviewer's tree links `screenreader-fleet`, `screenreader-worker` and `toolchain` into the PRIMARY's store; with only the own-`node_modules` half, `suiteStartVerdict` refused it as "3 of 7 @a11ign/* resolve OUTSIDE this worktree" and every `--run` Acceptance was unrunnable there. `worktree-resolution.ts` is not edited. The comment above the function states the cost: a PR that bumps a layer pin is measured against the primary's installed layer, not its own.

**Reproduced before the change** (measured, this worktree, hybrid `node_modules` with the three layers linked into `/home/agent/repos/a11y-witness/node_modules/.pnpm/`): `node packages/guards/src/assert-glob-not-empty.ts packages/guards/src/worktree-resolution.test.ts --min=1 --run` printed `REFUSING: this tree does not measure itself. …: 3 of 7 @a11ign/* resolve OUTSIDE this worktree, to /home/agent/repos/a11y-witness`. After the change the same command runs the six tests and passes (6 pass, 0 fail).

**Done-when 2, `suiteStartVerdict` through `memberScopeLister` over constructed trees** (measured, `node --input-type=module-typescript`):

```
pnpm store: lister -> proceed; (unchanged "every entry" -> refuse)
another checkout's packages/: lister -> refuse; (unchanged "every entry" -> refuse)
```

**Still asked about** (two new tests in `worktree-resolution.test.ts`, each with its control): a link into another checkout's `packages/` beside an excused store link; a link into another checkout's `node_modules/` outside `.pnpm`; a workspace member resolved into a store; a dangling entry; and, unchanged, every entry when the tree has no `packages/`.

**Not run:** `pnpm run typecheck` as a whole stops in `packages/cli` (`@a11ign/documents` not found): this worktree's `node_modules` is a hand-made hybrid and has no `packages/cli/node_modules`. `tsc --noEmit -p tsconfig.json` filtered to everything outside `packages/cli` is clean. `pnpm run lint`: 0 errors.

platform: nothing built; one predicate in an existing function.

Acceptance: `grep -q "[.]pnpm" packages/guards/src/assert-glob-not-empty.ts && node packages/guards/src/assert-glob-not-empty.ts "packages/guards/src/worktree-resolution.test.ts" --min=1 --run` exits 0, with 6 tests passing.

Mutation: (A) dropping the `.pnpm` clause fails both new tests and no other; (B) making every entry excused fails the #3447 member test, the new "still refused" test and the #2218 caller test; (C) widening the store match from `node_modules/.pnpm/` to any `node_modules/` first SURVIVED, which is why the "another checkout's node_modules outside .pnpm" case was added, and then fails the "still refused" test alone. Each restored byte-identical (`diff` empty) from a `cp` backup, and 6 pass again.

Closes #4816
