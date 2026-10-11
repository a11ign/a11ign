`docs/known-gaps.md` gains §61: the Auth0 Bot Detection "Always" case is untested, and `bot-challenge` is a fixture-only outcome, known in the code as `auth-challenge-detected`. The entry says what is not done, why, what covers it instead and what would close it, and the index is regenerated so §61 is listed as open.

Acceptance: bash -c 'git grep -q -i "Bot Detection" -- docs/known-gaps.md && git grep -q "bot-challenge" -- docs/known-gaps.md && npx rstest run --config scripts/rstest/rstest.config.ts --include packages/guards/src/known-gaps-index.test.ts'

Closes #4991
