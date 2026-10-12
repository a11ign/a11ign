## What

#5291 (#5283): the re-pin writer, `docs-pin-write.yml`, now regenerates `scripts/outsider/outsider-job.yml` in the same pull request, so a re-pin is not red on `outsider-job-fresh.test.ts` by construction.

- `.github/workflows/docs-pin-write.yml`: a new `regenerate` job (`contents: read`, NO `id-token`, because it runs `pnpm install` and the generator) checks out the commit `decide` planned on, applies the handed docs, and runs `node scripts/outsider/generate.ts --sha="$COMMIT" --version="$VERSION"`, then `--check`. It hands on the one file, and only when it differs. `write` takes it into the same tree as the docs, so the existing shape check (only shas and versions move; the pin line names the promoted commit; every other changed line names `a11ign@<version>`) applies to it too, and the same ONE commit carries it.
- `scripts/outsider/generate.ts`: a header comment only, naming who regenerates this repository's copy and why `--sha` is required.
- `packages/guards/src/outsider-job-fresh.test.ts` (outside the Region, declared in the body): a re-pin of README alone is NOT ok (the premise), the generator at the pin's sha and version IS ok, the regenerated file differs from the committed one only in lines the writer's shape check accepts, and the workflow's `regenerate` job runs the generator with `--sha`/`--version`, holds no `id-token`, with `write` listing the file and running no repository code.

**The consumer-gate files, which the row said to check:** NOT regenerated, and measured so. A copy of README with its pin moved (sha and `a11ign@0.9.0` to `a11ign@0.10.2`, line 178) makes `node scripts/outsider/generate.ts --check` print STALE (one line: the substitution record quoting README's release label) and `node scripts/generate-consumer-gate.ts --check` print OK. A write under `.github/workflows/` also needs the `workflows` grant `docs-pin-write.sts.yaml` withholds, so adding it would widen the policy for a file that does not go stale.

## Evidence

- The `regenerate` step's own commands, run in this worktree against README with line 178 moved to `ccd21d9d0b6088caeff375fa91d3efe0897cb839` / `0.10.2`: `generate.ts --sha=... --version=...` WROTE the file, `--check` printed OK, and the only changed path was `scripts/outsider/outsider-job.yml`. Its bytes are IDENTICAL (`diff` empty) to `scripts/outsider/outsider-job.yml` on the hand-fix commit `da6015144` of #5283. README and the file were restored from copies afterwards.
- `docs-pin-write.yml` parses as YAML with jobs `decide`, `regenerate`, `write`; `write` needs both. `actionlint` is not on the runner, and the first real `release` run after this merges is the live reading (Done-when 2 of the row).

Acceptance: git grep -q "outsider/generate.ts" -- .github/workflows/docs-pin-write.yml
pnpm exec rstest run --config scripts/rstest/rstest.config.ts packages/guards/src/outsider-job-fresh.test.ts packages/guards/src/docs-release-pin-currency.test.ts

Mutation: each restored from a copy and `diff`ed byte-identical, run against `outsider-job-fresh.test.ts` (9 tests): (A) `--sha="$COMMIT"` dropped from the workflow's generator call (the HEAD-pin trap of #5283) -> 1 of 9 fails, the workflow case alone; (B) `scripts/outsider/outsider-job.yml` removed from `write`'s `guarded` set -> 1 of 9 fails, the same case alone; (C) `id-token: write` added to `regenerate` -> 1 of 9 fails, the same case alone. (D) `main()` in `generate.ts` made to ignore `--version` SURVIVES: the tests call `generateOutsiderJob`, not the CLI, so the flag plumbing is covered by the manual run above and not by a test.

platform: GitHub Actions' own artifacts between jobs and the shape of `consumer-gate-pin.yml`'s `regenerate`; nothing built that a platform feature does. The alternative of making the generated file independent of README's release label would change what every outside repository's copy differs by, and the row did not ask for it.
