---
"@a11ign/judge": patch
---

**`CRITERION_COVERAGE`'s notes for 4.1.3 and 2.4.6 now say what round 15's capture (2026-09-12, #34/#1786) actually
changed, and what it didn't.** No `status` or `channels` value changes — both stay `partial` and unwidened — but a
consumer reading the note text directly now gets an accurate account instead of a stale one:

- **4.1.3**'s note names `status-waiting` and `status-progress` (24 corpus cases each) as now corpus-covered, and
  says what is still open: the existence-of-errors category has no subtype of its own (only an overlap with 3.3.1),
  and real-page grounding remains a separate, unmet claim (`build-realism` still reports 4.1.3 as 0 of 39 real
  pages).
- **2.4.6**'s note now explains why 10 `label-vague-*` cases sitting in the corpus since round 15 did not move
  `channels`: a case existing on disk is not a decider existing, and no `generic_label_present` feature or rule
  reads a label announcement yet.
