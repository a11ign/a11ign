## What

The `gate` job's agreement step (#3211) read GitHub through two bare command substitutions under `bash -e`, so one `gh: Server Error (HTTP 502)` aborted it on the first poll with 179 of its 180 polls unspent (a11ign#5227, run 38249729992). Both reads now go through `gh_read`: a 5xx or a transport error is read as `pending` and polled again inside ATTEMPTS, a 4xx fails at once, and a spent budget still fails and says GitHub was unavailable. The sweep found a second hole of the same class in the `noRelease` step, which left its body variable empty on a 5xx and sent a `no-release:` PR to a red changeset check; it now reads again on a 5xx (five reads) and fails at once on a 4xx.

platform: checked GitHub Actions: no step-level retry exists for a `run:` script, and `gh` has no retry flag of its own.

Mutation: with the 5xx pattern unable to match (never retry), 8 of 10 tests go red; with it matching any status (a 4xx retried too), the three tests that pin the 4xx-fails-at-once contract and the pattern-identity pin go red and no retry test does; on `origin/main`'s ci.yml 9 of 10 go red, the first being "a 502 on the run listing is polled again". The mutated file was restored from a copy and `diff`ed identical.

Acceptance:
```bash
pnpm exec rstest run --config=scripts/rstest/rstest.config.ts --include packages/guards/src/ci-poll-retries-5xx.test.ts
```
