## What

The fifteen release, coverage, CI-health, token-cost and outsider files in #4697's Region no longer name `--import tsx`: each usage string, generated-file header and generator error text says `node scripts/x.ts` (Node 24 strips types since #4389). Slice of #4596.

- `scripts/outsider/outsider-job.yml` is edited together with `generate.ts`, and `node scripts/outsider/generate.ts --check` prints `OK ... matches what README.md's documented workflow generates`.
- **The two test assertions that matched the old usage text** (`coverage-failure-classifier.test.ts`, `stale-dist-diagnosis.test.ts`) were made to accept the line with or without the loader by #4700 (merged first), so this slice edits no test. Rebased onto `61b4ad376`+; both pass against the new usage text.
- **Left alone, named:** `pnpm exec tsx scripts/consumer-gate-pin-needed.ts` (`consumer-gate-pin-needed.ts:128`) and the `#!/usr/bin/env tsx` shebangs on `consumer-gate-pin-needed.ts` and `release-tags-complete.ts` do not say `--import tsx`, so they are not this row's.

## Evidence

- Measured: `pnpm run verify -- --draft-body=<body>` at the rebased head: see the row comment for its verdict line. `node scripts/outsider/generate.ts --check` prints `OK ... matches what README.md's documented workflow generates`.

platform: none needed; a text edit.

Acceptance:

```bash
bash -c '! git grep -qE -- "--import[= ]\S*tsx" -- scripts/changeset-untracked-check.ts scripts/check-retired-heads.ts scripts/ci-health.ts scripts/consumer-gate-pin-needed.ts scripts/coverage-failure-classifier.ts scripts/coverage.ts scripts/release-gate-scope.ts scripts/release-print-versions.ts scripts/release-publish-rehearsal.ts scripts/release-tags-complete.ts scripts/selection-skipped.ts scripts/stale-dist-diagnosis.ts scripts/token-cost.ts scripts/outsider/generate.ts scripts/outsider/outsider-job.yml'
node scripts/outsider/generate.ts --check
npx rstest run --config=scripts/rstest/rstest.config.ts packages/guards/src/coverage-failure-classifier.test.ts packages/guards/src/stale-dist-diagnosis.test.ts packages/guards/src/outsider-job-fresh.test.ts
```

Mutation: put `--import tsx` back into the usage string of `scripts/coverage-failure-classifier.ts` and `scripts/stale-dist-diagnosis.ts`: the acceptance's first command (the `git grep`) exits 1 for each (it names the file), which is what it is for; the two CLI tests accept both spellings after #4700 and stay green, so the grep is the only guard of this edit, and that is by design of the sibling slice.

Closes #4697

🤖 Generated with [Claude Code](https://claude.com/claude-code)
