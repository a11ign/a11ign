The behavioural test of the `changeset` job's `dependency` step, the seven tests agent-org#1351's pull request was returned NOT CONVINCED for lacking, plus one pinning the step's `GH_TOKEN`, in `packages/guards/src/ci-poll-retries-5xx.test.ts` (a11ign#5455). The tests read the step a11ign#5452 writes, so this merges AFTER a11ign#5452: on `main` they fail eight of 18 (the step has no `--reviews` or `--head` read there yet), and on `main` with a11ign#5452's `ci.yml` applied they pass 18 of 18.

Acceptance: npx rstest run --config scripts/rstest/rstest.config.ts packages/guards/src/ci-poll-retries-5xx.test.ts

Mutation: each is one exact-match edit to the `dependency` step in `.github/workflows/ci.yml`, with a11ign#5452's `ci.yml` applied, run with the Acceptance above and measured: (M1) `flags+=(--reviews=… --head=…)` emptied to `flags+=()`: 5 of 18 fail; (M2) `--head=` dropped: 5 of 18 fail; (M3) `GH_TOKEN` removed from the step's `env`: 1 of 18 fails (the new test); (M4) the queue entry's number read as `number=""`: 3 of 18 fail; (M5) a failed reviews read swallowed with `|| true`: 1 of 18 fails. Each edit was made from a byte copy of the step's `ci.yml`, restored from that copy, and `cmp`ed byte-identical afterwards. The unmutated file passes 18 of 18 and the `main` file fails 8 of 18.

Closes a11ign/a11ign#5455
