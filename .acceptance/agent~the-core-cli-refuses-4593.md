`witness --worker <value>` now passes its value through the fleet layer's `assertWorkerUrl` (`packages/cli/src/worker-flag.ts`) before it leases or captures. A host-less address (`http://:8765`) or a missing value (`--worker` last on the line) is refused naming `--worker`; `http://w:8765/` becomes `http://w:8765`.

- **Measured 2026-10-09 on this branch:** `npx tsx packages/cli/src/cli.ts https://example.com --worker http://:8765` prints `--worker=http://:8765 is not a URL. Expected something like http://192.0.2.10:8765` (plus the validator's shell-variable hint) and exits 1, before any lease.
- **Mutation check, both directions** (`worker-flag.ts` restored from a copy, `diff` identical): validator replaced by a pass-through fails 3 of 3 tests; validator always called with `undefined` fails 1 (the well-formed address).
- The test imports `worker-flag.ts` only: `cli.ts` reaches the corpus and `pr-open` refuses a test that imports it.

Acceptance: bash -c 'node --test packages/cli/src/worker-flag.test.ts && grep -q "workerFlagValue" packages/cli/src/cli.ts'

Closes #4593

🤖 Generated with [Claude Code](https://claude.com/claude-code)
