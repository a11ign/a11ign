# Outcome 15: the two SPA reliability findings (sizing)

Sizes #4084 outcome 15, from the second outside evaluation: (1) a page's first visit differs from later ones, and
(2) status messages from a self-announcing control reach NVDA about 1 time in 3. Row #4537.
Readings of this repository were taken at `origin/main` `2b4bb5bbf` (2026-10-09). Readings of the layer repository
`a11ign/lab` were taken at `004c1d50` (its local checkout, 2026-10-09). Each number below names how it was obtained.

**The decision, in four lines.**

1. **Finding (2) is not new and is not an artefact of the evaluator's app.** `docs/known-gaps.md` §31 has stated it since
   2026-09-03 with its table (checkbox + `polite`: 2 of 6). The row's premise that "no entry in `known-gaps.md` states it" is
   refuted. What is true is narrower: **the project's own fixtures cannot reproduce it**, because none has the trigger that
   causes it (below).
2. **Finding (1) is a number nobody can read today**, and it stays "not measured". §57 already says why: nothing records
   whether a capture was cold or warm.
3. **Build one thing: a checkbox-plus-`polite` fixture and a 20-capture repeat of it.** It turns §31's n=6 on a withdrawn page
   into a rate on a page that is in the tree.
4. **Do not build anything for (1) yet.** Name what would change that, under `## First row`.

## What it covers

**Finding (2): what exists.**

- **The claim and its table** are `docs/known-gaps.md` §31 (`## 31.` at line 1578): button + `polite` heard 6 of 6, checkbox +
  `polite` 2 of 6, checkbox + `alert` 5 of 6, checkbox + `polite` deferred 400 ms 0 of 6. Taken as written; **not re-measured
  here**, because re-measuring needs a Windows worker and the resource ban applies. The captures are from 2026-09-01
  (`docs/not-working.md` §18, `39954a0` and `98e2e99`) and **are not on disk in this checkout**: `runs/` holds none of them.
- **`ceo` ruled on it (2026-09-25, #928):** a 4.1.3 finding on a checkbox does not carry "polite reaches about a third of
  users", because it is n=6 on one page shape. Repeats over more than one page shape "would change this; none is queued".
- **The two cases that measured it were withdrawn** (`filter-status-silent-checkbox`, `validation-live-silent`;
  `a11ign/lab` `src/training/case-matrix.mjs:777`, `:1364`), so no page with a checkbox trigger and a live region remains.

**What the project's own fixtures can say about it: nothing, and that is the finding.** Measured: a script over
`runs/screenreader-dataset/pages/*/good.html` in the main checkout (1,715 case pages, `generatedAt` 2026-09-22), counting a
page as live when it matches `aria-live` or `role="status|alert|log"` and as checkbox-triggered when it matches
`type="checkbox|radio"`:

| population | count |
|---|---|
| `good.html` pages | 1,715 |
| of those, carrying a live region | **451** |
| of those, ALSO carrying a checkbox or radio | **0** |

Every live-region page in the calibration set is triggered by a button or a form submission, which §31 reads as the
case that works (6 of 6). **So a clean live-region corpus and a roughly-one-in-three field defect are both true, and the
corpus cannot see the second.** That also answers the row's question: it is reproducible on the project's own shape of page
(the withdrawn checkbox case), and not reproducible on any page now in the corpus.

**The stability gate watches the wrong half of it.** `scripts/stability-gate.mjs` in `a11ign/lab` has 9 canaries
(counted with `grep -c -E '^\s+(path|url):'`). One activates a control, `filter-status-silent-solar/bad`, and it is the
SILENT variant: it has no live region to drop. Its last kept reading (`runs/fetched/gate-stability.log`, 2026-10-04) is
`STABLE — 5 usable, all fields identical`, which says the silence is reproducible and says nothing about a message that
is sometimes spoken. No canary has a checkbox trigger. The gate therefore cannot read a rate on this defect, and the
stability gate's own design (identical content over five captures) would read a one-in-three page as UNSTABLE, which is
correct about the page.

**Finding (1): what exists.**

- **§57** (`docs/known-gaps.md`, `## 57.` at line 3782) states it, with the nls.uk captures: capture 1 of five was a cold
  profile's first visit and differed from the other four. `ceo` ruled (2026-10-07, #3130) that the gate is not taught to
  discard a first capture, and the canary was replaced by W3C's disclosure-navigation page, chosen for having no
  first-visit state (`scripts/stability-gate.mjs` in `a11ign/lab`, the comment above its `url:` entry).
- **The number §57 lacks, "how many corpus pages carry first-visit state", cannot be read from existing captures.**
  Two reasons, both measured. §57 itself says "nothing records which a capture was". And the only local real-page captures,
  `runs/witness/` in the main checkout, are 34 files from 2026-09-19: not the corpus, and a stale copy. The real-page
  corpus is 85 URLs (`python3 -c` over `baselines/real-page-findings.json` in `a11ign/lab`, `len(d)` = 85); which of them
  carry first-visit state is a question for the 85 live pages or for the corpus captures `orchestrator` holds.
  **This is a corpus-reading limitation, named and routed to `orchestrator`, not worked around with the local copy.**
- **The fixture pages are not exposed to it.** They are localhost files with no consent panel or client storage, so the
  first-visit population is the real-page corpus alone.

**What does not exist, and is the whole gap.** For (2), a fixture with a checkbox trigger and a `polite` region, and any
repeat count above 6 on it. For (1), a record of whether a capture's profile had met the page, and a check that reads the
first visit as its own reading (§57's "what would close it": a decision about the capture protocol).

## What it would cost

Estimates, with their basis. None is measured on the fleet, because this row may not touch it.

- **Finding (2), the measurement.** One fixture page (about 30 lines, modelled on `src/eval/pages/books/filter-status-good.html`
  with its three buttons replaced by one checkbox) and a repeat of 20 captures. **One pull request in `a11ign/lab`, and
  about 1 to 2 worker-hours of capture**: 20 captures at 3 to 6 minutes each. Basis for the 3 to 6 minutes:
  `docs/capture-cost.md` lines 77-78 record 170-371 seconds per capture on the Actions runner (first and second capture of a
  job); the fleet's per-capture time was not read, so treat the range as inferred. Adding the `assertive` control and the
  deferred variant doubles it to about 3 to 4 worker-hours and one more fixture.
- **Finding (2), a fix.** There is no fix on this side to cost. §31 says the behaviour is NVDA's queue policy, which "six
  captures per condition shows a direction, not". What the project can do with a rate is its advice (`assertive` where the
  message matters, with its 5 of 6) and a bound on 4.1.3; neither is code.
- **Finding (1), recording a cold or warm profile on each capture.** A field on the capture is a protocol bump; the bump
  history is `docs/capture-protocol-bump-costs.md` and a bump recaptures what it invalidates, so the honest estimate is
  **3 pull requests** (record the field in the worker, read it in the evidence package, a check that compares cold with
  warm) **plus a corpus recapture owned by `orchestrator`**, in the range of days of worker time. Inferred from the shape of
  earlier bumps; not measured.
- **Finding (1), the read-only count.** `orchestrator` reading the 85 real-page captures for a consent panel in capture 1
  and not in later ones costs **no new capture and no pull request** (a script over existing records, minutes), and it
  produces the number §57 lacks. It is the cheapest thing that would change the decision for (1).

## First row

**One row, and it is for (2).** Finding (1) is "not worth building now": the number that would justify the protocol bump is
unknown and the read-only count above is a half-hour of `orchestrator`'s time; if that count finds first-visit state on
more than a handful of the 85 real pages (say 5 or more, an arbitrary line to be set by `orchestrator`, not by this
document), (1) gets its own sizing row, and until then §57 stands as written.

**Row: a checkbox-plus-`polite` fixture, outside the case matrix, so (2) can be given a rate on a page in the tree.**

- **Region:** `src/eval/pages/books/filter-status-checkbox-polite.html` and `src/eval/filter-status-checkbox-polite.test.ts`, in `a11ign/lab`.
- **Change:** add one page, a single `<input type="checkbox">` whose `change` handler synchronously rewrites a
  `<p role="status">` count (the §31 "checkbox, synchronous update, `polite`" condition). **Do not add it to
  `case-matrix.mjs`**: a case that is intermittent by construction teaches the model noise (`docs/not-working.md` §18), which
  is why its two predecessors were withdrawn. Add a test that reads the file and asserts the three properties that define the
  condition (a checkbox input, `role="status"` on the region, no `setTimeout` in the handler), so a later edit cannot quietly
  turn it into the button condition.
- **Acceptance:**

  ```bash
  pnpm exec tsx --test src/eval/filter-status-checkbox-polite.test.ts
  git grep -L 'filter-status-checkbox-polite' -- src/training/case-matrix.mjs
  ```

  The second command must print the path (the matrix does not name the page).
- **Next, not in this row:** `orchestrator` runs `training:repeat --times=20` on it and on `filter-status-good`, and writes the
  two counts into §31 beside the n=6 figures. That capture is the fleet's and is the second row, filed after this merges.
- **What would change "build only the fixture":** if `orchestrator`'s count for (1) is large, (1) outranks this.
