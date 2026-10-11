`packages/cli/src/auth/totp.ts` computes an RFC 6238 code (`totpCode`, `codeForUse`) and refuses a missing or malformed seed by name (`requireTotpSeed`); `scrub.ts` gains `assertNoTotpCode`. No flow-file key, interpreter, `resolve.ts` or remediation text is touched. `MIN_SCRUBBED_LENGTH` is still 8.

- **Mutations** (each run against `totp.test.ts`, restored byte-identical): skipping the window-edge wait turns the "fewer than 3 seconds" test red; a refusal message that interpolates the seed turns the seed-never-in-a-message tests red; an always-wait variant turns the mid-window no-sleep test red.
- `assertNoTotpCode` reuses fault `auth-credential-in-artifact`: a new fault code would reach `auth-faults.ts` and `fault-remediation.ts`, outside this Region.

Acceptance: bash -c 'git grep -q "POSITIVE CONTROL" -- packages/cli/src/auth/totp.test.ts && git grep -q "NEGATIVE CONTROL" -- packages/cli/src/auth/totp.test.ts && npx rstest run --config scripts/rstest/rstest.config.ts --include packages/cli/src/auth/totp.test.ts --include packages/cli/src/auth/scrub.test.ts'

Closes #4977

🤖 Generated with [Claude Code](https://claude.com/claude-code)
