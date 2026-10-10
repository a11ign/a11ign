## What

`packages/guards/src/walk-scope-copy-matches-toolchain.test.ts`: compares the core's kept copy `packages/guards/src/walk-scope.ts` with `@a11ign/toolchain/lib/walk-scope` at the pinned 0.7.0. The exported names must be the same set; `readsOutsideScope`, `runnerOwnedPaths` (given a path under each module's OWN `REPO_ROOT`), `inScope`, `parseWalkScope` agree over a table of inputs; `NOT_WRAPPED`, `ESM_UNSYNCED`, `DECLARER_BUILTINS`, `WHOLE_REPOSITORY` are deep-equal. `REPO_ROOT` is the one declared difference, asserted to differ (the toolchain's is its installed package directory, #4718), with a message saying the copy can go if it ever stops differing. Positive control: an extra export, a lost export, a changed pure answer and changed data are each reported, and a copy altered to match reports nothing.

Mutation, measured (original restored, `diff` clean): extra `export const` red on the names comparison; `WHOLE_REPOSITORY` un-exported red; `readsOutsideScope` without its unbounded-marker clause red on probe 19 (the first run SURVIVED, so the table gained an `ownFiles` set holding the marker); `writeFile` dropped from `NOT_WRAPPED.fs` red on the `NOT_WRAPPED` probe.

Ran with `A11Y_ALLOW_FOREIGN_RESOLUTION=1`: the worktree's `node_modules` is a hybrid, so the three published `@a11ign/*` packages (toolchain, screenreader-worker, screenreader-fleet) resolve into the primary checkout's `.pnpm`; those are the pinned installs and not branch code.

platform: checked `@a11ign/toolchain`'s own exports (the thing compared against); nothing built.

Acceptance: node packages/guards/src/assert-glob-not-empty.ts packages/guards/src/walk-scope-copy-matches-toolchain.test.ts --min=1 --run --runner=rstest

Closes #4726
