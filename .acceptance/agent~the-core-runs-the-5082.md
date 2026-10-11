The core names the fleet's source tree in no live file outside `layers.json` and the layer-edges baseline, and its `prepare` and `build` do not lay it. The seven fleet scripts run the installed package.

- **Measured** (`git grep -lE "packages/worker-fleet"` over the Acceptance's pathspec): 23 files at `origin/main` `9279858c1`, 0 at this head. `grep -c "lay-layer.ts screenreader-fleet" package.json`: 2 at `origin/main`, 0 at this head.
- **Measured** (the product's whole suite with the fleet NOT laid: `ls packages` printed `README.md cli control evidence guards judge lab nvda-worker scorer` after `pnpm run build`, which also lays control, nvda-worker and lab): `pnpm run test:all` 2867 passed, 0 failed, 32 skipped, in 222 files.
- **Measured** (positive control, Done-when 2): after `pnpm install` and `pnpm run build` there is no `packages/worker-fleet`. `pnpm run guest:run`, `fleet:normalise` and `worker:compare` each print their own flag refusal naming what they take, from the installed bin (`--help` is not a flag any of them knows; the refusal is the usage). `worker:ctl` prints its own deprecation text. `fleet:env` printed `export A11Y_WORKERS=...` and `--list` printed one URL a line, from the control plane's real `inventory.yml` read by path.
- **Measured** (negative control, Done-when 2): with `node_modules/.bin/a11ign-guest-run` moved aside, `pnpm run guest:run` printed `sh: 1: a11ign-guest-run: not found` and exited 1; restored, it refused `--bogus` by name.
- **Measured, and the premise that FAILS (Done-when 2, `doctor` and `worker:code`):** `pnpm run doctor -- --help` through `packages/control/src/with-control-plane-fleet.ts` exits with `ERR_MODULE_NOT_FOUND` for `packages/worker-fleet/src/fleet-env.ts`, imported from `packages/control/src/control-plane-fleet.ts`. Laid `control` (v0.5.3, the pin; v0.8.0 and v0.13.2 read the same `with-control-plane-fleet.ts` import) imports the fleet's source by relative path in 13 modules, and the row keeps the wrapper. The installed bin alone (`node_modules/.bin/a11ign-doctor`) prints its usage. A checkout that was laid before this row still has the directory and still runs the wrapper.
- **Measured** (`fleet:env` through the installed `dist/fleet-env.mjs` by path): printed nothing and exited 0, because that file's entry guard compares `import.meta.url` with the unresolved `process.argv[1]` and `node_modules/@a11ign/screenreader-fleet` is a symlink. `scripts/fleet-env.ts` imports the exported functions instead.
- **Not measured:** `pnpm run test:python` (no Python file changed); the Windows workflows; any worker or host (the resource ban: nothing here reached the fleet or the lab).

Acceptance: bash -c 'test "$(git grep -lE "packages/worker-fleet" -- . ":!docs" ":!.acceptance" ":!.changeset" ":!**/CHANGELOG.md" ":!layers.json" ":!packages/guards/layer-edges.baseline.json" | wc -l)" = 0 && ! grep -q "lay-layer.ts screenreader-fleet" package.json'

Mutation: the grep notices its own target. With `see packages/worker-fleet/x` appended to `README.md`, the Acceptance exited 1; restored byte-identical (`diff -q`), 0. With `node scripts/lay-layer.ts screenreader-fleet && ` put back at the head of `package.json`'s `build`, the Acceptance exited 1; restored byte-identical, 0. `cli` and `guards` moved with the root because `worker-fleet-delete.test.ts` compares every importer's resolved version with one `CONSUMED_VERSION` (inferred from its code, not run with the importers split).

CAPTURE_PROTOCOL_VERSION: unchanged
provisionRevision: unchanged
environmentKey: unchanged
weights: unchanged

Closes #5082
