Refused dependency changesets settle when a human wrote the entries and approved the head: `check` reads the carried entries and the pull request's reviews on a refusal, and prints the settlement by name (agent-org#1339, parent a11ign#5414). The `changeset` job in ci.yml does not yet pass `--reviews` and `--head`, so CI still refuses until that wiring lands.

Acceptance:
pnpm exec rstest run --config scripts/rstest/rstest.config.ts packages/guards/src/dependency-changeset.test.ts
