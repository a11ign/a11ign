platform: none needed -- a pure module and its test; nothing reads `cli.ts` yet, so no worker, fleet or CLI wiring is touched.

Acceptance: bash -c 'git grep -q "POSITIVE CONTROL" -- packages/cli/src/auth/login-outcomes.test.ts && git grep -q "NEGATIVE CONTROL" -- packages/cli/src/auth/login-outcomes.test.ts && npx rstest run --config scripts/rstest/rstest.config.ts --include packages/cli/src/auth/login-outcomes.test.ts'

Closes: #4984

Mutation: in `login-outcomes.ts`, (M1) `totp-rejected` dropped from the final set: 1 of 10 fails; (M2) the attempt rule relaxed to `attempt <= 2`: 1 of 10 fails (the second-transient-stops control, with the cap put to 0 so it isolates the attempt rule); (M3) the per-run cap replaced by `true`: 1 of 10 fails; (M4) the transient requirement removed: 1 of 10 fails; (M5) the final-set check removed: 2 of 10 fail. Each restored from a copy, `diff` empty.

## What changed

- **`packages/cli/src/auth/login-outcomes.ts`** (new, pure): `LOGIN_OUTCOMES`, the fifteen named outcomes each with a one-line remedy; `isFinal`; `retryDecision`, which retries only a transient failure on the first attempt under the one-per-run cap, after a backoff; `LOGIN_EXIT_CODES.sessionLost = 4`, distinct from the CLI's `1` for findings.
- **`packages/cli/src/auth/login-outcomes.test.ts`** (new): the positive controls (a first-attempt timeout retries once; every outcome has a remedy) and the negative controls (credential, code and account rejections never retry; a second transient stops; the cap holds; a plan stop is not a bad code).

## Notes

- The row's body says "fourteen outcomes"; its list names fifteen, since the 09:23Z amendment added `mfa-unavailable-on-plan`. The module follows the list.
- A transient failure is reported with the outcome of the screen it failed on, with `transient: true`; the row names no "timed out" outcome. The `cli.ts` wiring is a later row.
- "The CLI names how a login ended" is NOT yet true on the CLI: this row is the vocabulary and the decision, not the wiring.

## Evidence

- Acceptance, at this head: `VERDICT pass: 10 tests in 1 file`. Before the change the test file cannot run (the module does not exist).
- `pnpm run lint`: 0 errors. `pnpm run typecheck`: exit 0.
