The core's `rulesFitness` job now reads the product's own cases. `pnpm run rules-check` runs `packages/judge/src/fitness/rules-check.ts`, which reads `packages/judge/src/fitness/cases.ts` and 31 fixtures under `packages/judge/src/fitness/fixtures/`; nothing it opens is under `packages/lab/`. The job is not deleted and is still in `gate`'s `needs` (`ci.yml` is untouched). Epic #4425, `ceo`'s option 3.

**Measure (condition 1), taken at `47113639e` with an fs trace of `tsx packages/lab/src/eval/rules-check.ts`, not a grep:**
- Opened by `rules-check`: 34 case fixtures probed, 32 read, 2 absent (`books/layout-table-good|bad`, pending capture), plus `cases.ts`. The row's "35" was 34 (`grep -c 'fixture:' cases.ts`, matched by the trace). By directory: `nvda/` 4, `tutorials/` 16, `books/` 12, `contamination-test.json`, `planted-contact-form.json`.
- Also opened by the lab's readers (read statically; the resource ban keeps me from running them): `src/eval/run.ts` iterates `EVAL_CASES`, so ALL 34; `scripts/audit-rule-coverage.ts` reads the `fixtures/nvda` directory (5 files, 4 of them cases; `nvda-w3c-bad-after.json` is not); `harnesses/capture-check.ts` and `page-identity-rate.ts` read `eval/pages/tutorials` (pages, not fixtures: none of the 34); `harnesses/capture-fixtures.ts` WRITES `fixtures/books/*.json`, and `recorded-provenance.sha256` hashes 10 of them. The lab's own `*.test.ts` are not laid, so are not in this list.

**Resolution (condition 2): the case lives in two places, with a test that pins the pair** (the `cross-repo-copies` class). By-version from a package was ruled out: `@a11ign/judge`'s `files` is `dist`, `README.md`, `LICENSE` and the ruling forbids shipping them. `contamination-fresh-page` and `contamination-test.json` (authored fresh, never published) are NOT moved. The pair pin reads the lab's laid copy at the `layers.json` tag (`v0.1.28`) and is removed in the lab-side pull request that moves the tag.

**Result at this head (measured):** `pnpm run rules-check` printed `Absence cases fully caught: 8/10  |  clean-page false positives: 0` and `Pending capture (skipped): book-layout-table-good, book-layout-table-bad`; the lab's copy printed 9/11 at `47113639e`, the one case fewer being the contamination case, which the lab keeps. Exit 0 under `tsx`.

**Two behaviour changes in the moved runner, both toward failing:** a fixture that is absent and NOT declared `pendingCapture` fails (the old `existsSync` skip shrank the population silently), and zero cases examined fails (`docs/gate-exit-codes.md` recorded that 0 examined reported success). `FitnessReport`, `evaluate` and `failures` are exported so the test reaches the logic without `process.exit`.

Mutation: each restored with `cp` and `cmp`-identical, and each turned its own test(s) red and no other file's: (1) `FITNESS_FIXTURES_DIR` pointed at the lab's fixtures: the placement test and the lab-import test fail; (2) one byte appended to `fixtures/tutorials/images-good.json`: the pair pin alone fails; (3) the runner skips an undeclared absence again: "refuses a population that shrank" alone fails.

Verification at head `0a93b2ce8` (the commit before this file's last edit): `pnpm run verify -- --draft-body=<this file>` printed `GREEN for this head and body -- the affected set passed at this head, affected against origin/main` (ts 2673 passed in 209 files, rulesFitness, changeset, acceptance, ownedPaths PASS; python NOT-NEEDED); `pnpm run lint` 0 errors; `tsc --noEmit` 0 errors. Not run, by the resource ban: `eval:gate`/`run.ts` (needs the worker). The tree-wide guards run in CI only.

Left open, filed separately: `packages/judge/src/announced-state-changes.test.ts` and `packages/cli/src/action/summary.test.ts` still read three `tutorials/` fixtures from the lab's tree; they are tests, outside this row's Region and not `rules-check`.

platform: none needed, a move of a check and its data inside the repository.

Acceptance:
```bash
npx rstest run --config=scripts/rstest/rstest.config.ts packages/judge/src/fitness/rules-fitness-cases.test.ts
```

Closes #4936
