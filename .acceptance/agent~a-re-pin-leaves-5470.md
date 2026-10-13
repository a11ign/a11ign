## What

#5470 (parent #5468): after a re-pin, no current-pin prose names the release it left, or the plan names the sentence it could not move.

- `packages/guards/src/docs-release-pin-currency.ts`: `RESTATEMENTS` lists every wording that restates a pin's release in words. Three are movable and `planRepin` rewrites them, for a release a pin in the same doc moved away from: `commit of release X, so your CI`, `` `a11ign@X` is the tag the pin above names``, and the new `pins release `X``. The rest (`commit of release X` in other wordings, `` `X` does ``) are named, never moved. `pinFaults` fails a doc whose pin is on one release while a restatement in its prose names another, file and line.
- `RepinPlan.unmoved` names those sentences (`file:line`). The status stays `rewrite` when the pins moved, so the pull request opens and CI fails on the named lines.
- History is not a restatement: a `since X` sentence, a changelog list, or an `a11ign@X` label without a template is never read as a fault, and a re-pin leaves it as written.
- `packages/guards/src/docs-release-pin-currency.test.ts`: the done-when cases (rewrite and named `unmoved`, the guard's positive control on the same prose, history pinned as not a fault), plus a re-pin loop.
- `packages/guards/src/docs-pin-write.test.ts`: one test title updated from "two templates" to "movable templates" (no assertion changed).

Not changed: `.github/workflows/docs-pin-write.yml` still prints faults only, and its PR body is static. Wiring `unmoved` into that body is out of this row's Region. Its header comment still names the old `restateRelease` function.

## Evidence

- `pnpm exec rstest run --config scripts/rstest/rstest.config.ts packages/guards/src/docs-release-pin-currency.test.ts`: 28 tests, pass.
- `docs-pin-write.test.ts` and `docs-release-pin-currency.real-tree.test.ts`: 9 tests in 2 files, pass.
- `pnpm run typecheck`: clean. `pnpm run lint`: 0 errors. The two changed guard files add no warnings.
- Mutation, each on a copy and restored byte-identical: (1) `moveRestatements` a no-op, 2 fail; (2) `restatementFaults` dropped from `pinFaults`, 1 fails; (3) `unmoved` always empty, 2 fail; (4) `since X` read as a restatement, 1 fails.

Acceptance: pnpm exec rstest run --config scripts/rstest/rstest.config.ts packages/guards/src/docs-release-pin-currency.test.ts

Mutation: the four mutations above, each restored by copy and checked with `cmp`, run against `docs-release-pin-currency.test.ts`.

platform: none; a pure guard and fixture test, no worker, no network.
