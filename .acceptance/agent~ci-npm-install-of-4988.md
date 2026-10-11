`scripts/agent-org-newest-tag.ts` installs the tool from the tag's `pnpm-lock.yaml` when it has one, and a test pins the choice (#4988).

- **The change:** `installToolDependencies` in `scripts/agent-org-newest-tag.ts` runs `npx pnpm@10.34.5 install --frozen-lockfile --ignore-scripts` in the cloned tag when `pnpm-lock.yaml` is there, always through that pinned version and never the job's own pnpm (the first CI run showed `corepack pnpm` resolving 12.11.2 on a clone with no `packageManager`, which refused the lockfile's day-old `@a11ign/toolchain@0.7.1` with `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`), the npm `--no-package-lock` install when it is not, and logs which path ran. The runner sets `CI=true`: measured, pnpm aborts with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` on the `node_modules` that v0.155.0 and later commit (2828 tracked files; v0.154.11: 0) when it has no terminal and no `CI`.
- **The test:** `packages/guards/src/agent-org-newest-tag-install.test.ts`, with the installer injected, so it reaches no network.
- **Live, not a merge reading:** `node scripts/agent-org-newest-tag.ts --dest=<scratch>` on this host resolved v0.155.2 from the real remote with no pnpm on PATH, installed 55 packages through `npx pnpm@10.34.5` in 0.7s, and `toolBin()` resolved `src/bin.ts` from it. The `ci` of an open PR and `auto-arm` on main are the VERIFY row's reading, not this PR's.
- **One premise of the row did not hold:** `one-package-manager.test.ts` has no pin on this script (the `no-npm-spawn.test.ts` its old comment named no longer exists), so it is not edited; it passes unchanged.

Mutation: the one `if` in `installToolDependencies` broken both ways. Check never fires: "a tag WITH pnpm-lock.yaml" went red, nothing else. Check always fires: "a tag WITHOUT a lockfile" went red, nothing else. Restored from a copy, `diff` identical.

Acceptance: pnpm exec tsx --test packages/guards/src/agent-org-newest-tag-install.test.ts packages/guards/src/one-package-manager.test.ts

Closes #4988
