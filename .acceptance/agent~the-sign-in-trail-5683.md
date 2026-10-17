Makes the sign-in loop record the alert a rejected one-time code raises (a11ign#5683, under a11ign#5564). The loop acts on a screen once and then skips it while it stays the same screen, so the page that comes back after a wrong code (the one-time-code form with an alert beside it) was polled and never written. `screen-loop.ts` now writes that re-observed screen as an `observed` branch when its alerts or controls differ from the last recorded reading: once per distinct reading, never acted on, and carried into the trail by role and name only (`auth-trail.ts` is unchanged, and still cuts every node to role and name).

Region: the row's four files, `screen-loop.ts`, `screen-loop.test.ts`, `auth-trail.ts`, `auth-trail.test.ts`. `auth-trail.ts` is unchanged; its test file is unchanged. The new test imports `authTrailMark` to pin the trail's output.

**Measured at this head:** `pnpm run verify` GREEN (ts: 415 tests in 22 files passed, 22 skipped as browser-driven; changeset PASS). `pnpm run lint`: 0 errors. `pnpm run typecheck`: clean.

**Before the change:** the two POSITIVE cases (the alert recorded, and the trail carrying it) fail; the NEGATIVE CONTROL passes, as it does on the old code.

**Mutations** (each applied, run, then restored from a `cp` backup and checked with `diff`):
- never record a re-observed screen (`recordReshown` returns before the push): turns red the two POSITIVE cases, and the NEGATIVE CONTROL stays green.
- always record (the distinct-reading comparison never matches): turns red the NEGATIVE CONTROL and the POSITIVE case's exact branch count.

**Not done here (named):** the reading of the alert itself (a11ign#5679); the next falsifier run, which needs a CLI carrying this change (`orchestrator`, #5564 Done-when 1).

Acceptance: grep -q "records the alert the last-acted screen shows after the action" packages/cli/src/auth/screen-loop.test.ts && npx rstest run --config scripts/rstest/rstest.config.ts --include packages/cli/src/auth/screen-loop.test.ts --include packages/cli/src/auth/auth-trail.test.ts

Closes #5683
