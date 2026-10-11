`parseTotpSecret` reads a bare base32 seed or an `otpauth://totp/` URI into `{ seed, algorithm, digits, periodSeconds }`, defaulting SHA-1/6/30; refusals are by name and never echo the value.

Acceptance: bash -c 'git grep -q "POSITIVE CONTROL" -- packages/cli/src/auth/otpauth.test.ts && git grep -q "NEGATIVE CONTROL" -- packages/cli/src/auth/otpauth.test.ts && npx rstest run --config scripts/rstest/rstest.config.ts --include packages/cli/src/auth/otpauth.test.ts'

Mutation: ignoring `period` turns 6 of 16 tests red; echoing the URI into a refusal message turns the no-leak test red (1 of 16).

Closes #4992
