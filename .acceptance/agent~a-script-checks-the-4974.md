`scripts/auth0-e2e-env.ts` checks the Auth0 tenant file by name, mode (exactly 600) and seed shape (RFC 4648 base32), and with `--apply-secrets --repo <owner/name>` pipes each of the five values to `gh secret set` on stdin. It is NOT run against the real file by this row: the chairman's session runs `--check`, then `--apply-secrets`, once (#4084).

- **Measured:** 24 tests, all passing. Positive control: five sentinels in a mode-600 file are reported present by name and the stub `gh` receives each value on stdin once. Negative controls: a missing name, an empty value, a mode 644 file and a non-base32 seed are each refused by name, and a test greps stdout, stderr and the stub's argv for every sentinel across all of those runs.
- **Mutation:** passing the value as `--body <value>` in argv turned 2 named tests red (the stdin/argv test and the failing-gh leak test); restored byte-identical. A second mutation, dropping the unpadded-remainder check (reviewer-4987's blocker: 17, 19 and 22 character seeds were accepted), turns the three new seed-shape tests red.

Acceptance: bash -c 'git grep -q "POSITIVE CONTROL" -- scripts/auth0-e2e-env.test.ts && npx rstest run --config scripts/rstest/rstest.config.ts --include scripts/auth0-e2e-env.test.ts'

Mutation: in `applySecrets`, add `"--body", values[name]` to the `gh` argv; `a --apply-secrets gives the stub each value on stdin once and none in argv` goes red.

Closes #4974

🤖 Generated with [Claude Code](https://claude.com/claude-code)
