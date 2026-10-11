The core names the worker's source tree in no live file outside `layers.json` and the layer-edges baseline, its `prepare` and `build` do not lay it, and the provision stamp's `$RUN_SERVER` is the launcher the worker publishes, read from the installed package.

- **Measured** (`git grep -lE "packages/nvda-worker"` over the Acceptance's pathspec): 36 files at `origin/main` `54947391e` (the row's Open-check read 36 at `8c26afab5`), 0 at this head. `grep -c "lay-layer.ts nvda-worker" package.json`: 2 at the base, 0 at this head.
- **Measured** (Done-when 3): after `pnpm install` in this worktree (which runs `prepare`), `ls packages` printed `README.md cli control evidence guards judge lab scorer`: no `packages/nvda-worker`. `node_modules/@a11ign/screenreader-worker/launcher/` holds `run-server.cmd` and `apply-foreground-lock-timeout.ps1` at 0.13.0.
- **Measured** (Done-when 2, `scripts/test-support/stamp-files.test.ts`, `node --test`): 4 pass, 0 fail. POSITIVE CONTROL resolves `$RUN_SERVER` to `node_modules/@a11ign/screenreader-worker/launcher/run-server.cmd` and asserts the file exists; NEGATIVE CONTROL: a stamp listing the laid path (built from its parts) throws `the stamp lists '<path>'`, and the quoted published launcher is accepted.
- **Measured** (`node packages/guards/src/layer-edges.ts --check`): `baseline agrees`, after removing the two baseline entries (`.c8rc.json` and `pnpm-workspace.yaml` -> the worker's path) whose edges no longer exist; the `layers.json` entry stays for row 9.
- **Measured** (guards, `node --test` over `layer-edges`, `lay-layer`, `screenreader-worker-extraction`, `pnpm-workspace`, `dora-declaration`, `isolation-gate-layers` and the stamp test): 90 pass, 0 fail. `pnpm run lint`: 0 errors. `pnpm run typecheck`: clean.
- **The provisionRevision consequence (Done-when 4):** the stamp's `$RUN_SERVER` input moves from the laid `src/run-server.cmd` to the published `launcher/run-server.cmd`, so the stamp's hash changes and every box reads as DRIFTED until `fleet:provision` runs. Nothing in this row ran it (the resource ban); the fleet effect is the VERIFY row for `orchestrator` (Fleet: Yes, one box), filed from this row's close-out.
- **Not measured:** the fleet's real `stamp-provision-revision.ps1` (it lives in `a11ign/screenreader-fleet`, and the core's `stamp-files.ts` mirrors it); any worker or host.

Acceptance: bash -c 'test "$(git grep -lE "packages/nvda-worker" -- . ":!docs" ":!.acceptance" ":!.changeset" ":!**/CHANGELOG.md" ":!layers.json" ":!packages/guards/layer-edges.baseline.json" | wc -l)" = 0 && ! grep -q "lay-layer.ts nvda-worker" package.json'

Mutation: the grep notices its own target. With `see packages/nvda-worker/x` appended to `README.md`, the Acceptance exited 1; restored byte-identical (`diff -q`), 0. With `node scripts/lay-layer.ts nvda-worker && ` put back at the head of `package.json`'s `build`, it exited 1; restored byte-identical, 0. In `stamp-files.ts`: with the refusal disabled, 1 of 4 stamp tests failed (the NEGATIVE CONTROL only); with `$RUN_SERVER` put back at the laid path, 2 of 4 failed (the entry list and the POSITIVE CONTROL); with the refusal made to fire on every quoted entry, all 4 failed, because every stamp quotes one (the always-fires direction cannot isolate one test). Each restored byte-identical.

CAPTURE_PROTOCOL_VERSION: unchanged
provisionRevision: changed (the `$RUN_SERVER` input is the published launcher; boxes read as drifted until `fleet:provision`, which this row does not run)
environmentKey: unchanged
weights: unchanged

Closes #5084
