SECURITY.md's registry table names the script the Action runs for the step *Allow Edge to be forced into the foreground*: the worker package's `node_modules/@a11ign/screenreader-worker/launcher/apply-foreground-lock-timeout.ps1`, not the fleet package's `src/provisioning/` copy, which #5315 stopped the Action running.

- **Measured** (`git grep -n 'src/provisioning/apply-foreground-lock-timeout' -- SECURITY.md`): 1 hit at `origin/main` `b18b4faad`, `SECURITY.md:263`; 0 at this head.
- **Measured** (`git grep -n 'launcher/apply-foreground-lock-timeout' -- action.yml`): `action.yml:575` runs `./node_modules/@a11ign/screenreader-worker/launcher/apply-foreground-lock-timeout.ps1`, the path the new cell names.
- **Mutation:** the Acceptance's first clause is the one that can fail. Run against the `origin/main` text (`git show b18b4faad:SECURITY.md`) it exits 1 (the `src/provisioning/` hit); run against this head it exits 0. The second clause is the always-fires direction: with the cell's `launcher/` path removed it exits 1.
- **Not measured:** the rendered table on GitHub (a markdown pipe-table cell with backticks and a parenthetical; the row's own table is unchanged in shape).

Acceptance: bash -c '! git grep -q "screenreader-fleet.\{0,40\}apply-foreground-lock-timeout\|src/provisioning/apply-foreground-lock-timeout" -- SECURITY.md && git grep -q "launcher/apply-foreground-lock-timeout" -- SECURITY.md'

CAPTURE_PROTOCOL_VERSION: unchanged
provisionRevision: unchanged (SECURITY.md is not in the provision stamp's inputs)
environmentKey: unchanged
weights: unchanged

Closes #5316
