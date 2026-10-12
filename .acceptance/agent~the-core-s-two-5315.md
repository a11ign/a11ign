The core's two readers of the foreground-lock script (`action.yml`'s step *Allow Edge to be forced into the foreground* and the same step in `registry-consumer-gate.yml`) read `node_modules/@a11ign/screenreader-worker/launcher/apply-foreground-lock-timeout.ps1`, the worker package's launcher, and name the fleet package's `src/provisioning/` path nowhere.

- **Measured** (`git grep -n 'src/provisioning/apply-foreground-lock-timeout' -- action.yml .github/workflows/registry-consumer-gate.yml`): 2 hits at `origin/main` `d7b1cad48` (`action.yml:575`, `registry-consumer-gate.yml:182`), 0 at this head.
- **Measured** (`ls node_modules/@a11ign/screenreader-worker/launcher/` in this worktree, worker 0.13.0, the version `package.json` pins): `apply-foreground-lock-timeout.ps1` and `run-server.cmd`; the package's `files` allow-list names `launcher`. `node_modules/@a11ign/screenreader-fleet/src/provisioning/apply-foreground-lock-timeout.ps1` is still present at the fleet pin 0.9.0, so the order the row asks for (this lands BEFORE the fleet pin moves) holds.
- **Consumer gate, and why it is not a bare re-point (measured 2026-10-12, `npm view`):** the gate installs the PUBLISHED package, and `a11ign@latest` is 0.10.2 -> `@a11ign/screenreader-fleet ^0.9.0` -> fleet 0.9.0 -> `@a11ign/screenreader-worker 0.9.0` (exact), which has no `launcher/` (`files` carries it from 0.13.0, the core's pin). A hard-coded launcher path would turn the daily/after-publish gate red against an install that works. The gate looks in the worker's `launcher/` first, then for the script BY NAME under `node_modules/@a11ign` (`-Depth 4`), so it names no fleet path; the search drops once `latest` carries a worker with `launcher/`. `action.yml` installs from the frozen lockfile (worker 0.13.0), so it reads the launcher directly.
- **Measured** (`pwsh` on the lookup block alone, three scratch layouts): fleet-only layout -> found the fleet copy; launcher layout -> `./node_modules/@a11ign/screenreader-worker/launcher/...`; empty `@a11ign` -> `NONE` (the step's `throw`).
- **Not measured:** a run of either workflow (both need a Windows runner, and the gate installs from the registry); CI's first run of the gate after this merges is the live reading.

Acceptance: bash -c '! git grep -q "screenreader-fleet/src/provisioning/apply-foreground-lock-timeout" -- action.yml && ! git grep -q "src/provisioning/apply-foreground-lock-timeout" -- .github/workflows/registry-consumer-gate.yml'

Mutation: the two clauses are independent and each notices its own target. With `action.yml`'s path put back to `screenreader-fleet/src/provisioning/...`, the Acceptance exited 1 (and the gate's clause was not what failed); with the gate's `$script` path put back to the same, it exited 1; each restored from a copy and `diff -q` byte-identical, then 0. A grep that has no always-fires direction: it holds one pattern per file and cannot be made to flag a path that is not there.

CAPTURE_PROTOCOL_VERSION: unchanged
provisionRevision: unchanged (neither file is in the provision stamp's inputs: `git grep -E 'action\.yml|consumer-gate\.yml' -- scripts/test-support` prints nothing)
environmentKey: unchanged
weights: unchanged

Closes #5315
