platform: none needed -- this changes package.json script lines and the layers.json pin only; no worker is touched and no Windows build is involved.

Acceptance: `bash -c '! grep -nE "node packages/control/src/[a-z-]+[.]mjs" package.json' && bash -c 'test "$(grep -cE "node --import tsx packages/control/src/[a-z-]+[.]ts" package.json)" -eq 19' && bash -c 'tag=$(sed -nE "s/.*\"control\": \{[^}]*\"tag\": \"v([0-9.]+)\".*/\1/p" layers.json); test -n "$tag" && test "$(printf "%s\n%s\n" "$tag" 0.1.17 | sort -V | head -1)" = 0.1.17'`

Closes: #4343

Mutation: `control-delete.test.ts` line 55 set back to `.mjs` (M1) and the `tracked-source-leak-guard.test.ts` anchor changed to `requireControlPlaneHost` -> `requireControlPlaneHostX` (M2) -- each broke exactly one test, which went red; both files restored byte-identical and pass at baseline.

## What changed

- **package.json:** the 19 `control` scripts now run `node --import tsx packages/control/src/<name>.ts` instead of `node packages/control/src/<name>.mjs`. Engineer hosts have no type stripping (ADR 0043), so the `.ts` entry points run under tsx.
- **layers.json:** `pinned.control` moves from `v0.1.14` to **`v0.1.17`**, the release cut from a11ign/control `0952e84` (a11ign/control#27 and #26). `lab` stays at `v0.1.14`.
- **Guard tests** that named the old `.mjs` paths now name the `.ts` entry points: `screenreader-worker-extraction.test.ts`, `layer-edges.baseline.json`, `control-delete.test.ts` (the `fleet-playbook` entry in `DEPLOY_AND_PROVISION` and its regex at line 337), and `tracked-source-leak-guard.test.ts`.
- **Changeset:** `.changeset/the-core-runs-control-as-typescript.md`.

## Why v0.1.17 and not a later release

v0.1.17 is the first release that carries the `.ts` entry points, and the row's amendment sets it as the minimum. v0.1.18 (Windows quality-update deferral, #4438), v0.1.19 (display-mode logon task, #4441) and v0.1.20 (fleet-watch off-fleet posts, #4447) change fleet provisioning and `fleet:watch`. This row needs neither, so they are not taken.

## Evidence

- **Acceptance** (run in this worktree at `efa0ca7ab`): all three commands exit 0. The negative finds no `.mjs` entry in `package.json`; the count of `node --import tsx ... .ts` lines is 19; the control tag is `v0.1.17`.
- `node --import tsx --test packages/guards/src/screenreader-worker-extraction.test.ts`: 10 pass, 0 fail.
- `node --import tsx --test packages/guards/src/layer-edges.test.ts`: 35 pass, 0 fail.
- `pnpm run lint`: 0 errors. `pnpm run typecheck`: 0 errors.
- `pnpm run verify`, ts step: PASS (2666 tests, 21 skipped) after the `control-delete.test.ts:337` fix.
- **Mutation M1:** `control-delete.test.ts` line 55 set back to `.mjs`. Exactly one test fails: "the deploy and provision paths resolve (read, not run), and the laid layers.json is the root's byte for byte". File restored byte-identical; the file passes again at baseline.
- **Mutation M2:** `tracked-source-leak-guard.test.ts` anchor `CONTROL_PLANE = requireControlPlaneHost();` changed to `...HostX();`. Exactly one test fails: "MUTATION: the hardcoded control-plane fallback this row removed does not silently come back". File restored byte-identical; the file passes 8/8 at baseline.

## Not done: Done-when 1 (exit codes of the 19 scripts)

The row's first Done-when asks for the exit code of every script's `--help` or report-only form, pasted here. **This PR does not include that paste.** The engineer session is barred from `fleet:*`, `lab:*`, `worker:*`, `training:capture*`, `evidence:check`, `gate:stability` and `capture:check`. Several of the 19 reach the fleet (`doctor` probes the workers; `worker:code` uses the worker), so they cannot be run from here. The `.ts` startup under tsx has not been exercised in this PR. This is routed to `orchestrator` on the row.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
