## What

The fifteen release, coverage, CI-health, token-cost and outsider files in #4697's Region no longer name `--import tsx`: each usage string, generated-file header and generator error text says `node scripts/x.ts` (Node 24 strips types since #4389). Slice of #4596.

- `scripts/outsider/outsider-job.yml` is edited together with `generate.ts`, and `node scripts/outsider/generate.ts --check` prints `OK ... matches what README.md's documented workflow generates`.
- **Two test assertions outside the Region had to move with it**, as the row says to do rather than delete the test: `packages/guards/src/coverage-failure-classifier.test.ts:205` and `packages/guards/src/stale-dist-diagnosis.test.ts:161` matched `^Usage: node --import tsx scripts/...` on stderr. Both now match `^Usage: node scripts/...`. Found by running the 21 test files that mention these scripts (`node --test`): 2 failed on exactly these, and passed after.
- **Left alone, named:** `pnpm exec tsx scripts/consumer-gate-pin-needed.ts` (`consumer-gate-pin-needed.ts:128`) and the `#!/usr/bin/env tsx` shebangs on `consumer-gate-pin-needed.ts` and `release-tags-complete.ts` do not say `--import tsx`, so they are not this row's; and `packages/guards/src/consumer-gate-pin-needed.test.ts:168` keeps a failure HINT that names `node --import tsx scripts/generate-consumer-gate.ts`, which still works.

## Evidence

- Measured: `pnpm run lint` 0 errors (575 warnings, none on lines this change wrote); `pnpm run typecheck` exit 0; the three guard tests (`coverage-failure-classifier`, `stale-dist-diagnosis`, `outsider-job-fresh`) 38 tests, 0 failed through `rstest`.
- **`pnpm run verify` is NOT green here, for a cause that is not this diff:** its `ts` step runs `pnpm run docs:coverage`, whose target `packages/lab/scripts/generate-coverage-doc.ts` was deleted by `0a5f6ca61` (#3505), so it fails with `ERR_MODULE_NOT_FOUND` at `origin/main`. Its `acceptance` step reports `no body to lint` for a local stamp. The remaining `ts` steps were run by hand as above; `rstest run --changed=origin/main` found no affected test module (the scripts are not imported by one), which is why the guard tests were named.

platform: none needed; a text edit.

Acceptance:

```bash
bash -c '! git grep -qE -- "--import[= ]\S*tsx" -- scripts/changeset-untracked-check.ts scripts/check-retired-heads.ts scripts/ci-health.ts scripts/consumer-gate-pin-needed.ts scripts/coverage-failure-classifier.ts scripts/coverage.ts scripts/release-gate-scope.ts scripts/release-print-versions.ts scripts/release-publish-rehearsal.ts scripts/release-tags-complete.ts scripts/selection-skipped.ts scripts/stale-dist-diagnosis.ts scripts/token-cost.ts scripts/outsider/generate.ts scripts/outsider/outsider-job.yml'
node scripts/outsider/generate.ts --check
npx rstest run --config=scripts/rstest/rstest.config.ts packages/guards/src/coverage-failure-classifier.test.ts packages/guards/src/stale-dist-diagnosis.test.ts packages/guards/src/outsider-job-fresh.test.ts
```

Mutation: put `--import tsx` back into the usage string of `scripts/coverage-failure-classifier.ts` and `scripts/stale-dist-diagnosis.ts`; exactly the two CLI usage tests (`coverage-failure-classifier.test.ts` and `stale-dist-diagnosis.test.ts`, one each) went red and no other of the 33 in those two files; both scripts restored byte-identical (`cmp` clean).

Closes #4697

🤖 Generated with [Claude Code](https://claude.com/claude-code)
