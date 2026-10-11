The core no longer names `packages/lab` in any live file outside the three that are row 9's (`package.json`, `layers.json`, the layer-edges baseline).

- **Measured** (`git grep -lE "packages/lab"` over the Acceptance's pathspec): 74 files at `origin/main` `1a083d1b4` (the row said 74 at `8c26afab5`), 0 at this head.
- **Measured** (the product's own suite with no lab laid; `packages/lab` removed from the worktree before the run, `ls` printed "cannot access"): `pnpm run test:all` 2870 tests in 222 files, 0 failed. The same suite WITH the lab laid read 2 failed before a 20-entry baseline floor was lowered to 10 (`layer-edges.test.ts`), 0 after. `pnpm run lint` 0 errors, `pnpm run typecheck` 0 errors.
- **Not measured:** `pnpm run test:python` printed `SKIPPED: no .venv/bin/pytest`, an honest skip. The three deleted Python tests are the lab's; 14 more Python tests in `packages/scorer/tests` read lab scripts by a path spelled in parts (`"packages" / "lab"`), which the Acceptance's grep cannot see and which fail with the lab absent: filed as a row, not changed here.
- **Not measured:** `action-smoke.yml` and `capture-regression.yml` run on a Windows runner and nothing here ran them.

Acceptance: bash -c 'test "$(git grep -lE "packages/lab" -- . ":!docs" ":!.acceptance" ":!.changeset" ":!**/CHANGELOG.md" ":!package.json" ":!layers.json" ":!packages/guards/layer-edges.baseline.json" | wc -l)" = 0'

Mutation: the grep notices its own target. With `negative-control-5080.txt` (`see packages/lab/x`) staged, the same `git grep` printed 1 and the Acceptance exited 1; with it removed, 0 and exit 0. The `score.py` builder test: renaming `"observation": {` to `"observationX": {` turned `record-builders.test.ts` red (1 fail), and restoring the file byte for byte (`diff` empty) turned it green.

CAPTURE_PROTOCOL_VERSION: unchanged
provisionRevision: unchanged
environmentKey: unchanged
weights: unchanged

Closes #5080
