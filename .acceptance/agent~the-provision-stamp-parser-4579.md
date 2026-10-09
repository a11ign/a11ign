`stampEnvironmentFiles` now reads the `(Get-LayerFile -Layer '<layer>' -Relative '<path>')` entry, so the stamp's first hashed file stays in the list.

- **The fix:** one alternative in the entry pattern of `scripts/test-support/stamp-files.ts`; it resolves to `<declaredLayerPath(layer)>/<path>` from `layers.json`, in its position. A layer `layers.json` does not declare throws.
- **Tests** (`stamp-files.test.ts`, new): a stamp source with the Get-LayerFile form first, then `$RUN_SERVER`, `$FOREGROUND_LOCK` and two quoted paths (one comment line between) yields five entries in order; an undeclared layer throws. **Mutation check:** the Get-LayerFile alternative made unmatchable fails both tests (pass 0, fail 2); restored from a copy, `diff` identical.
- **Run on the real stamp (measured 2026-10-09)**, `src/provisioning/stamp-provision-revision.ps1` fetched at `screenreader-fleet` v0.5.3 (the pin in `pnpm-lock.yaml`) and at v0.6.0, both resolving to the same five paths:
  1. `packages/worker-fleet/src/provisioning/provision-nvda-worker.ps1`
  2. `packages/nvda-worker/src/run-server.cmd`
  3. `packages/worker-fleet/src/provisioning/apply-foreground-lock-timeout.ps1` (the foreground-lock stand-in's `FLT`)
  4. `packages/control/ansible/roles/worker/defaults/main.yml`
  5. `packages/control/ansible/collections/ansible_collections/a11y/worker/plugins/modules/a11y_speech_viewer.ps1`
- **Not run:** `pnpm run lint`/`typecheck`/`verify` — this worktree has no `node_modules`; CI runs them.

Acceptance: bash -c 'node --test scripts/test-support/stamp-files.test.ts'

Closes #4579

🤖 Generated with [Claude Code](https://claude.com/claude-code)
