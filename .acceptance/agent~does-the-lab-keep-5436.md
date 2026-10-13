ADR 0045 gains a section, "The lab's own baseline of its reaches", that names `baselines/layer-edges.baseline.json` and proposes keeping it as a ledger that only shrinks, for `ceo`'s ruling in review. Docs only: the section is prose, and the lab's header that cites it is a companion change in `a11ign/lab` (not in this pull request).

**Measured at this head:** `tracked-prose-leak-guard.test.ts` and `docs-release-pin-currency` (both files, real tree included) pass, 31 tests in 3 files, `rstest` with `scripts/rstest/rstest.config.ts`.

**Measured on lab `origin/main` `5e8aabd7`, 2026-10-13** (`git show origin/main:baselines/layer-edges.baseline.json | grep -c '"from"'`, and one count per commit from `git log origin/main -- baselines/layer-edges.baseline.json`): 540 entries now; 592 at the first lab commit of 2026-10-09 that touches the file. Over that window 11 commits lowered the count by 95 in total and 15 raised it by 43 in total. These are readings at a moment; the ADR section says so.

**Mutation:** not applicable. The change is prose and adds no code path; the Acceptance is a grep for a named file.

**Not run here:** the lab test (`layer-edges.test.ts`) reads the core's guard from the laid layout and cannot run from either checkout alone; the companion lab change is a comment-only edit, checked with `git diff -U0` (every changed line is a comment line).

no-release: a document, shipped nowhere.

Acceptance: bash -c 'git grep -q "baselines/layer-edges.baseline.json" -- docs/adr/0045-a-repository-uses-another-only-through-its-published-package.md'

Closes #5436
