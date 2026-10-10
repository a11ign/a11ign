platform: none needed -- one host unit file and a guard test; no worker is touched.

Acceptance: `pnpm exec rstest run --config scripts/rstest/rstest.config.ts --include "packages/guards/src/fleet-watch-unit-exit.test.ts"`

Closes: #4693

Mutation: in `a11ign-fleet-watch.service`, (M1) `ExecStartPre=` prefixed with `-`, (M2) the `ExecStartPre` deleted, (M3) its import pointed at `fleet-watch.mjs` -- each failed the pinning test (1 of 2); (M4) `SuccessExitStatus=0 1` set to `0` passes by design, since a unit that no longer counts exit 1 as success has no hole. File restored byte-identical (`diff` empty) and passes 2 of 2 at baseline.

## What changed

- **`a11ign-fleet-watch.service`:** a non-`-` `ExecStartPre` imports `./packages/control/src/fleet-watch.ts`. `SuccessExitStatus` governs only the main process, so a load failure (the `ERR_MODULE_NOT_FOUND` that exits 1 under pnpm) now fails the unit, while ATTENTION stays exit 1 and counted as success. The module's `main` runs only when it is the entry point (`import.meta.url` guard), so the import reads nothing and posts nothing.
- **`fleet-watch-unit-exit.test.ts`:** while exit 1 counts as success, the unit must carry that pre-step, and it must import the file `package.json`'s `fleet:watch` runs.

## Does `a11ign-lab-watch.service` have the same hole? Yes

It carries the same `SuccessExitStatus=0 1` and runs `pnpm run lab:watch` (`node --import tsx packages/control/src/lab-watch.ts`), so an import crash exits 1 and reads `Result=success`. Read from the unit and `package.json`; the journal was not queried. Not fixed here: it is outside this row's Region and needs its own row.

## Evidence

- Acceptance, at this head: `VERDICT pass: 2 tests in 1 file`. `pnpm run lint`: 0 errors. Measured, not inferred.
- Not run: `pnpm run verify` and the full suite; the change is a unit file and one self-contained test.
