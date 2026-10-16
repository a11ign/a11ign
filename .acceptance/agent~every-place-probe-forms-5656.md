Every place the `probe-forms` option is documented says, in the same words, **use only against a seeded test organisation or account**: the Action input's description (`action.yml`), the Action guide's setting-table row (`docs/github-action.md`) and the CLI's usage text, which `--help` prints (`packages/cli/src/cli.ts`). `docs/try-it.md` no longer calls `probe-forms` the Action's shipped default. `probe-forms-wording.test.ts` reads those three places as text and fails when one lacks the sentence; each of its three controls strips the sentence from ONE file and must name that place and no other.

**Measured at this head:** `probe-forms-wording.test.ts` 4 of 4 pass (`rstest`, the command below). The sibling action and CLI suites (`probe-default`, `inputs-reach-scripts-by-env`, `summary`, `cli`) pass too: 138 tests in 5 files.

**Before the change:** the sentence is absent from all three places at `origin/main` (`git grep -n "Use only against a seeded test organisation or account" origin/main` finds nothing), so the positive test was red there.

Acceptance: pnpm exec rstest run --config scripts/rstest/rstest.config.ts packages/cli/src/action/probe-forms-wording.test.ts

Closes #5656
