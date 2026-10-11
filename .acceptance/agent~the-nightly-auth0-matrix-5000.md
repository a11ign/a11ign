Adds `packages/cli/src/auth/auth0-matrix.ts` (pure: `MATRIX_CASES`, `BASELINE`, `planStop`) and its test. Six cases (identifier-first on/off, MFA always with OTP, progressive enrollment, consent on a localhost callback, an organizations prompt), each with the settings it flips and the outcome/branches it must end in; `BASELINE` restores every field a case sets. No attack-protection case.

**Measured at this head:** 7 tests, all pass (`rstest`, the command below).

**Mutations** (applied to `auth0-matrix.ts`, run, restored byte-identical with `diff`):
- drop `guardian_factors` from `BASELINE`: turns red `POSITIVE CONTROL: every field a case sets has a matching entry in BASELINE`, and no other.
- classify a plan refusal as `totp-rejected` (swap the two returns): turns red `POSITIVE CONTROL: a recorded plan refusal is mfa-unavailable-on-plan` and `NEGATIVE CONTROL: a wrong-code response is totp-rejected and not the plan outcome`.

**Not done here (named):** the runner and the workflow are other rows. Progressive enrollment is expressed as the connection's `passkey_options.progressive_enrollment_enabled`, so `connections` is an area beyond the row's list; the payload shapes and the plan-refusal wording are from Auth0's documented API, not read off the live tenant.

Acceptance: bash -c 'git grep -q "POSITIVE CONTROL" -- packages/cli/src/auth/auth0-matrix.test.ts && git grep -q "NEGATIVE CONTROL" -- packages/cli/src/auth/auth0-matrix.test.ts && npx rstest run --config scripts/rstest/rstest.config.ts --include packages/cli/src/auth/auth0-matrix.test.ts'

Closes #5000
