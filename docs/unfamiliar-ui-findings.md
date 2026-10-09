# Unfamiliar UI findings

What the trained scorer does on pages unlike its training data. Written for #4084 (outcome 3); each section names the row that measured it.

## The `cantTell` rate on table and filter pages (#4242)

**Verdict: NO. The table/filter mean is not at least twice the other group's (10.67 against 9.98 criteria per page). That is "the gap is not there at this sample size", with n=3 in the table/filter group; it is NOT "the scorer handles tables and filters".** No reduction row is owed.

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
   **Update, #4352 (2026-10-09): the corpus can now answer both, and the answer waits for the sweep.** `a11ign/lab` declares, in role `calibration`, four pages whose `demonstrates` says "filter" (MOJ Design System `filter` and `filter-a-list`, GOV.UK `search/research-and-statistics` and `search/news-and-communications`) and six that say "table" (the three above plus MOJ `filter-a-list`, `sortable-table` and `scrollable-pane`; `filter-a-list` is in both), so the table-or-filter group is nine pages rather than three. **Nothing above is re-measured and the verdict is unchanged:** the six added pages are not captured, so the sweep behind the figures still has n=3 and filter n=0. The capture and re-run are #4356 (`lane:orchestrator`). Four of the six share the MOJ template and two share GOV.UK's finder template, so nine pages is not nine independent samples of structure.
3. **The captures are protocol 22** (`captureProtocols: {22: 49}`), not the protocol-21 set of the 2026-09-24 record in `CLAUDE.md`. These figures are not comparable with that record's counts without re-deriving it at 22.
4. **4.1.3 and 3.3.1 are almost never `cantTell` on this corpus at all:** 4.1.3 on 1 of 46 other pages and 0 of 3 table/filter pages, 3.3.1 on none. Both are `UNWITNESSABLE_ON_REAL_PAGES` (`real-page-corpus.mjs`) unless a page carries a consented `formState`, so this is a statement about what the corpus can show, not about the rate on real data tables or filter screens a user would bring. Answering the row's question for those two criteria needs pages that exercise them; that is a corpus row, not a scorer one.

The fetched sweep is `runs/fetched/scratch.abstention-sweep.json` on the control plane (gitignored, 21,849 bytes), not committed; re-run the fetch if it is needed by hash.
