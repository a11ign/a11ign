A failed login now has a recorder: `packages/cli/src/auth/login-artifact.ts` collects per-step screenshot, accessibility tree, origin, screen and millis, redacts `typed`, scrubs strings through `scrub.ts`, keeps the last attempt, and writes through an injected `io`.

Acceptance: bash -c 'git grep -q "POSITIVE CONTROL" -- packages/cli/src/auth/login-artifact.test.ts && git grep -q "NEGATIVE CONTROL" -- packages/cli/src/auth/login-artifact.test.ts && npx rstest run --config scripts/rstest/rstest.config.ts --include packages/cli/src/auth/login-artifact.test.ts'

Mutation: writing `typed` unredacted turns "NEGATIVE CONTROL: the seed, the password and a cookie value appear nowhere" red (1 of 4 failed); dropping the scrub set turns that test and the "value that survives scrubbing" test red (2 of 4).

Closes #4985
