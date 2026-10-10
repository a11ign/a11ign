The core's `walk-scope.ts` copy gains the two `node:test` names Node 24 added, and the toolchain pin moves `0.7.0` to `0.7.1`, the first release that carries them (a11ign#4847, published; read from the registry with `npm view @a11ign/toolchain@0.7.1`). One pull request, because `walk-scope-copy-matches-toolchain.test.ts` (#4726) compares the copy to the PINNED toolchain: the copy edit alone is red at `0.7.0`, the bump alone is red at the old copy.

**What moved:**
- `packages/guards/src/walk-scope.ts`: `NOT_WRAPPED.test` gains `expectFailure` and `getTestContext`, with the toolchain 0.7.1's own reason strings (`dist/lib/walk-scope.mjs`, read from the packed tarball).
- `@a11ign/toolchain` `0.7.0` to `0.7.1` in `package.json` AND in `packages/{cli,judge,scorer}/package.json`; `pnpm-lock.yaml` regenerated with `pnpm install --lockfile-only`, not by hand.

**Region note:** the row's Region lists the root `package.json` and the lockfile only. The three package manifests are outside it, and they had to move: `toolchain-package.test.ts` pins ONE exact version across the root, `cli`, `judge` and `scorer` (`the importers pin 2 different versions` otherwise). Bumping the root alone would land a red test. No Dependabot pull request for this bump was open (`gh pr list --state open`, title filter `toolchain|walk-scope`, read empty), so nothing was superseded there.

**Not touched:** `pinned`/`layers.json`, `.c8rc.json`. a11ign#4843 is closed in this row's favour by the row itself, not by this diff.

platform: nothing built; two table entries and one exact-version pin, lockfile by pnpm.

Acceptance: both lines of the row's Acceptance, run as written from `/home/agent/repos/wt-4848` on Node `v24.21.0`: line one printed `[]` and exited 0 (it printed `["expectFailure","getTestContext"]` and exited 1 at `origin/main`'s copy); line two (`npm pack @a11ign/toolchain@<root pin>` then `grep -rqE expectFailure package`) exited 0 at `0.7.1`. `pnpm exec tsx --test packages/guards/src/walk-scope-copy-matches-toolchain.test.ts packages/guards/src/toolchain-package.test.ts` printed `ℹ tests 14 / ℹ pass 14 / ℹ fail 0`.

Closes #4848

Mutation: `git show origin/main:packages/guards/src/walk-scope.ts` over the edited file (the two entries removed, pin at 0.7.1): Acceptance line one printed `["expectFailure","getTestContext"]` and exited 1, and `walk-scope-copy-matches-toolchain.test.ts` failed `behaves like @a11ign/toolchain/lib/walk-scope at the pinned version` (pass 3, fail 1). Restored from a `cp` copy and the diff was empty. The other direction (an entry the toolchain lacks) is the same test's own positive control, `compare` fed a deliberately altered copy.
