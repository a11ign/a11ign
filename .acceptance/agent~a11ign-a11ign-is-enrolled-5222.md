Enrols `a11ign/a11ign` in the shared Renovate preset (`local>a11ign/.github`) by adding `renovate.json`, with `enabledManagers: ["custom.regex"]` so only custom managers run and Dependabot's `uses:` bumps are not duplicated. Adds `packages/guards/src/renovate-config.test.ts`, which derives every `uses: a11ign/...@<sha>` pin from `git ls-files` and asserts each is read by a `customManagers` entry or excluded by name with a reason. It also checks the exclusion table is exactly the set of `ignorePaths` and that each excluded file still holds a pin.

**Deviation from the row's Change list:** `customManagers` is empty. Every current pin is excluded by name, because each one is owned elsewhere: the consumer gate is generated and repaired by `consumer-gate-pin.yml` (#4331), the toolchain pins in `release.yml` are read by Dependabot (#3775), the docs pins are written by `docs-pin-write` (#5224, #5291), and `examples/nightly-workflow.yml` is pinned to 0.5.3 with nothing that moves it. A regex manager on any of them would race its owner. The guard still forces any future pin to be read or excluded with a reason.

**Measured at this head:**
- `pnpm exec rstest run --config scripts/rstest/rstest.config.ts packages/guards/src/renovate-config.test.ts`: 4 tests, 0 failed, VERDICT pass.
- `pnpm exec eslint packages/guards/src/renovate-config.test.ts`: exit 0.
- `pnpm run typecheck`: exit 0.

**Mutations** (each applied to `renovate.json`, run, restored byte-identical with `diff`):
- dropping the `README.md` exclusion: 2 of 4 tests turn red.
- removing `enabledManagers`: 1 of 4 turns red.

**Not done here (named):** Done-when 2 (a live Renovate dry-run listing one update per enrolled pin) and Done-when 3 (the first real bump automerging) happen after merge and cannot be run from this worktree.

Acceptance: bash -c 'pnpm exec rstest run --config scripts/rstest/rstest.config.ts packages/guards/src/renovate-config.test.ts'

Closes #5222
