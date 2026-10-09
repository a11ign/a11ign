`a11ign <url> --compare-axe` joins the two outputs a run already produces (axe's violations and the judge's findings) in `packages/cli/src/axe-comparison.ts`, which imports nothing from `cli.ts`; `cli.ts` only wires the flag. `--help` now prints the usage on stdout (it did not exist), which is what the second command greps.

**The row's Acceptance names `scripts/rstest/rstest.config.mjs`; that file is `rstest.config.ts` since #4514's sweep.** The command below is the row's, with that one extension changed.

- **Measured:** `axe-comparison.test.ts` 7 tests pass at this head, `pnpm run typecheck` clean, `eslint` on the three files 0 errors (2 pre-existing warnings in `cli.ts`).
- **Not done here:** the live run against a calibration page (Done-when 2) needs a worker, which the resource ban puts out of an engineer's reach; it goes to `orchestrator`. The release (Done-when 3) follows the changeset.

Acceptance: bash -c 'npx rstest run --config scripts/rstest/rstest.config.ts --include packages/cli/src/axe-comparison.test.ts && node --import tsx packages/cli/src/cli.ts --help | grep -q compare-axe'

Mutation: in `axe-comparison.ts`, (1) joining even when one layer did not run fails 2 of 7 tests; (2) counting `partial` as fully assessed fails 1; (3) never upgrading a referred criterion to asserted fails 1. Each restore was byte-identical (`diff`).

Closes #4528

🤖 Generated with [Claude Code](https://claude.com/claude-code)
