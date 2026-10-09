# Outcome 17: the trust bar, what is not met and the minimum to move each

Sizes #4084 outcome 17. Row #4541. Every reading of `docs/METHODOLOGY.md` below was taken at `origin/main` `ded0b321f`
(2026-10-09) and quotes the document, not a memory of it. The README's "Not yet met" list is written from this page's first section.

**The decision, in three lines.**

1. **Five items are unmet, and four of the five wait on one thing: pages an accessibility expert has labelled.** Calibration needs
   an outcome to compare confidence with, the thresholds need a labelled set to be set against, and ADR 0019's gap is
   closed only by real pages. Test-retest is the exception and needs no expert.
2. **Nothing here is a commitment of the expert's time.** That is the chairman's to give. Every hour below is an estimate to be
   replaced by the expert's own, and is marked as one.
3. **The first row asks the expert for labels and nothing else**, on pages already captured, and computes no comparison with the tool.

## What it covers

Status is the document's own word, with its line.

| # | Item | METHODOLOGY.md says | Line |
|---|---|---|---|
| 1 | Confidence calibration | **Not done.** "Findings carry a confidence number, but it has not been validated against outcomes." | 108 |
| 2 | Test-retest reliability | **Partial.** "`EVAL_RUNS` can repeat cases, but reliability is not yet reported as a metric. We have observed run-to-run variation." | 109 |
| 3 | Expert labelling | **Partial.** "No direct expert labelling yet"; 16 of the 18 failure cases have third-party ground truth, and "a live expert-labelled sample is still wanted." | 110 |
| 4 | Go-live thresholds | "The specific thresholds are to be set with the accessibility expert." The bar needs a pre-agreed recall, a cap on false positives per page and a retest bound. | 163 (bar: 151-161) |
| 5 | A synthetic hold-out cannot falsify a synthetic assumption | ADR 0019: a candidate with 0 misses on the enlarged synthetic hold-out falsely accused 12 of 18 conformant real pages. Every gate on generated pages is blind to generator-shaped faults "by construction", and 22 real pages "express error rates no finer than about 4.3%". | ADR 0019, Context and Consequences |

**Two things worth knowing before reading the costs.**

- **Item 2 is about a different source of variation than the one the audit's other rows imply.** The same document says the trained
  scorer has "no sampling anywhere", so the same capture gives the same score (line 113). The variation that can be retested is
  therefore the capture (NVDA, the page, timing) and any rented backend, and a retest of the scorer alone would report zero by
  construction. The row for item 2 must say which it measures.
- **"Calibration" is used for two things.** The "calibration set" of real pages in ADR 0010 and the README claim sets the abstention
  floor. Item 1 is a different question: whether a stated confidence tracks correctness. Item 1 must not be satisfied by the
  abstention sweep, which would be one word covering two claims.

**One adjacent row the README list does not carry.** `Reporting standard` is "Not done" at line 114 ("quoted bare 'recall 100%' on n=5
without sample sizes, confidence intervals, or test-retest"). It is not one of the five this row was filed for and is not in the README
list; it is a precondition for all of them, since each result above is only worth publishing with n and an interval. Raised on the row
for `product-manager` to rule on rather than added here.

## What it would cost

The minimum to move each item **one step**, and what a person must supply. Hours are my estimates, not measurements, and the expert's
rate of work is theirs to state.

| # | One step | A person must supply | Needs the Windows worker? |
|---|---|---|---|
| 3 | Not done to partial-plus: an accessibility expert labels a fixed set of real pages, blind to the tool's output, per criterion (fails / passes / cannot tell). | **Expert:** the labels. At an assumed 20-30 minutes a page, 22 pages is roughly 7-11 hours. **Us:** the pages, already captured. | No for the labels. Capturing any new page would. |
| 4 | Not set to set: the expert writes the three numbers (recall floor, false-positive cap per page, retest bound) **before** any comparison is computed, and the document records the date. | **Expert:** one session, an assumed 1-2 hours, after seeing the labelled set's size but not the tool's results. | No |
| 1 | Not done to partial: bucket findings by confidence and report, per bucket, the share the expert's labels confirm. | Item 3's labels. **No extra expert time.** At 22 pages the buckets will be thin, and the report must say so rather than draw a curve. | No |
| 2 | Partial to reported: recapture a fixed set of real pages N times and report how often the same findings recur, with the interval. | **Nobody's expertise.** Capture time on the fleet. | **Yes**, so it is `orchestrator`'s to schedule, and not run by the engineer on the row. |
| 5 | Widen the real-page set that can falsify a generated assumption, so the 4.3% floor falls. | Item 3's labelled pages are themselves new real-page evidence. **More pages need more expert time**, in proportion. | Only if new pages are captured. |

**What this does not move.** Item 5 is never closed, only narrowed: ADR 0019 says widening the real-page set "remains the
highest-value corpus work", and no number of pages makes a synthetic hold-out able to falsify a synthetic assumption. Nothing
above turns "not yet met" into "met". Each is a step, and the README should keep saying "not yet met" until the document's own status
column says otherwise.

**Order, and why.** Item 3, then 4, then 1 and 5, with 2 independent. Item 4 comes after the labelling begins and before the first
comparison, because a threshold set after seeing the result is the goalposts-moving the pre-registration section exists to prevent.

## First row

**One row: the expert labels the 22 held-out real pages, blind, and the row computes nothing against the tool.**

What it asks of the expert, and only this:

- **Read each of 22 already-captured real pages** (the held-out real set of ADR 0019, 19 publisher-declared conformant and 3
  publisher-declared inaccessible, five publishers) **and, per WCAG criterion, say whether it fails, passes, or cannot be told** from
  the capture. They are shown the page and the screen-reader transcript, never the tool's findings.
- **An assumed 7-11 hours, which the expert is asked to replace with their own figure** before anyone commits to it. The chairman
  decides whether to ask for it; this plan assumes nothing.

What we supply: the 22 captures, a labelling sheet (one row per page and criterion), and the rule that the sheet is committed before any
comparison script exists. Nobody runs the fleet or the lab for it.

Done when the labelled sheet is committed, with the expert's name or initials and the date, and `docs/METHODOLOGY.md` line 110 is
changed from "No direct expert labelling yet" to the number of pages labelled, and not before. It does not claim agreement, because
none has been computed.

**Question for `ceo` to take to the chairman:** is the accessibility expert willing to give roughly one working day to label 22 pages
blind? If they would give less, say how much; a smaller set is a smaller claim, and the README says which.
