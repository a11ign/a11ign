# Unfamiliar UI findings

What the trained scorer does on pages unlike its training data. Written for #4084 (outcome 3); each section names the row that measured it.

## The `cantTell` rate on table and filter pages (#4242, re-measured by #4356)

**Verdict, re-measured with n=9: NO. The table/filter mean is not at least twice the other group's (12.44 against 10.29 criteria per page, 1.21 times).** The filter pages alone read 13.50 (n=4, 1.31 times) and the table pages alone 11.83 (n=6). The gap is smaller than the 2 times that would owe a reduction row, so no reduction row is owed; it is "not there at this sample size", NOT "the scorer handles tables and filters". The first reading, n=3, was 10.67 against 9.98 and is kept below.

### Re-measurement, 2026-10-09 (#4356, `orchestrator`)

The lab is pinned at v0.1.14 (#4379, which carries the six calibration filter and table pages #4352 declared). `capture-real-pages -e role=calibration` captured 55 of 55 pages on 11 workers, then `calibrate-abstention.mjs` at the **shipped** model ran as `lab:job -e job=sweep` (exit 0 at `74b9c5e20`), fetched with `lab:fetch -e artifact=abstention-sweep`:

```bash
node packages/lab/scripts/cantell-by-page-shape.ts runs/fetched/candidate.abstention-sweep.json
```

```
pages in the sweep: 54; calibration pages in the corpus: 55

shape            n    mean cantTell  4.1.3 cantTell  3.3.1 cantTell
table-or-filter  9    12.44          0%              0%
other            45   10.29          0%              0%

table/filter mean at least twice the other group's: NO
```

**Read it with these limits.**

1. **n=9, and not nine independent samples.** Four of the added pages share the MOJ template and two share GOV.UK's finder template. The original three read 10.67 again, as before; the six added read 13.33 (13 on five of them and 15 on `search/news-and-communications`). The one page in the corpus the sweep did not score is `w3.org/WAI/demos/bad/after/news.html` (a *fixed* demo, not table or filter), so 54 of 55 were scored.
2. **Filter is now answered, with the same limit.** `filter` reads 13.50 (n=4: 13, 13, 13, 15), the highest group, and still 1.31 times the other pages. `table` reads 11.83 (n=6; 7 on W3C's layout-table `tickets.html`, 11 to 14 on the rest).
3. **The fleet that captured was the eleven workers that read alike** (Windows 10.0.22631 at 1024x768, protocol 22, `captureProtocols: {22: 54}`). Workers 7, 8, 9 and 11 read Windows 10.0.26100 at 640x480, so `capture-fleet-guard` refused a 15-box run, and they carry `a11y_capture: false` in the control plane's inventory until they match again. A capture across a mixed fleet would have blended two display sizes, which changes what a page's CSS shows.
4. **4.1.3 and 3.3.1 are `cantTell` on none of the 54 pages** (0 of 9 table/filter, 0 of 45 other; the first reading had 4.1.3 on 1 of 46). Both are `UNWITNESSABLE_ON_REAL_PAGES` (`real-page-corpus.mjs`) unless a page carries a consented `formState`, so this is a statement about what the corpus can show, not about the rate on real data tables or filter screens a user would bring. Answering the row's question for those two criteria needs pages that exercise them; that is a corpus row, not a scorer one.

The fetched sweep is `runs/fetched/candidate.abstention-sweep.json` (gitignored, 24,416 bytes), not committed; re-run the fetch if it is needed by hash.

### First reading, 2026-10-08 (#4242, n=3)

**Verdict then: NO. The table/filter mean is not at least twice the other group's (10.67 against 9.98 criteria per page). That is "the gap is not there at this sample size", with n=3 in the table/filter group; it is NOT "the scorer handles tables and filters".** No reduction row is owed.

Measured 2026-10-08 by `orchestrator`: `calibrate-abstention.mjs` at the **shipped** model on the lab (`lab:job -e job=sweep`, exit 0), fetched with `lab:fetch -e artifact=abstention-sweep`, then, from a lab checkout carrying [a11ign/lab#32](https://github.com/a11ign/lab/pull/32):

```bash
node packages/lab/scripts/cantell-by-page-shape.mjs runs/fetched/scratch.abstention-sweep.json
```

```
pages in the sweep: 49; calibration pages in the corpus: 49

shape            n    mean cantTell  4.1.3 cantTell  3.3.1 cantTell
table-or-filter  3    10.67          0%              0%
other            46   9.98           2%              0%

table/filter mean at least twice the other group's: NO
```

The sweep is a recorded result: the script scores nothing, and with no sweep file it exits 2 and names the file. `cantTell` here is the product's per-page referral list (`criterionOutcomes`), and the groups come from the corpus's own `demonstrates` (`/table|filter/i` is table-or-filter, anything else is other).

**Read the figures with these limits.**

1. **n=3.** The difference is 0.69 criteria on three pages; one page moves the group's mean by about a third. The three are the GOV.UK table page ("data table with row and column headers"), the NHS service manual table ("documented data table with a worked example"), and W3C WAI's *before* `tickets.html` ("ticket listing, broken — NOT a form: 0 `<form>`, 0 `<input>`, 14 layout tables"). **The third matches `/table/` on layout tables, not on a data table**; the row fixes the pattern, so it stays in.
2. **No filter page is declared in the calibration set** (no `demonstrates` carries "filter"), so "table or filter" is, in this corpus, "table". The row's suspicion about filter screens is untested, not answered.
   **Update, #4352 (2026-10-09): the corpus can now answer both, and the sweep above is that answer.** `a11ign/lab` declares, in role `calibration`, four pages whose `demonstrates` says "filter" (MOJ Design System `filter` and `filter-a-list`, GOV.UK `search/research-and-statistics` and `search/news-and-communications`) and six that say "table" (the three above plus MOJ `filter-a-list`, `sortable-table` and `scrollable-pane`; `filter-a-list` is in both), so the table-or-filter group is nine pages rather than three. **Re-measured by #4356 in the section above:** the six pages are captured and the sweep has n=9 and filter n=4; the verdict is unchanged. Four of the six share the MOJ template and two share GOV.UK's finder template, so nine pages is not nine independent samples of structure.
3. **The captures are protocol 22** (`captureProtocols: {22: 49}`), not the protocol-21 set of the 2026-09-24 record in `CLAUDE.md`. These figures are not comparable with that record's counts without re-deriving it at 22.
4. **4.1.3 and 3.3.1 are almost never `cantTell` on this corpus at all:** 4.1.3 on 1 of 46 other pages and 0 of 3 table/filter pages, 3.3.1 on none. Both are `UNWITNESSABLE_ON_REAL_PAGES` (`real-page-corpus.mjs`) unless a page carries a consented `formState`, so this is a statement about what the corpus can show, not about the rate on real data tables or filter screens a user would bring. Answering the row's question for those two criteria needs pages that exercise them; that is a corpus row, not a scorer one.

The fetched sweep is `runs/fetched/scratch.abstention-sweep.json` on the control plane (gitignored, 21,849 bytes), not committed; re-run the fetch if it is needed by hash.
