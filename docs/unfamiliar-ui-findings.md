# Unfamiliar UI findings

What the trained scorer does on pages unlike its training data. Written for #4084 (outcome 3); each section names the row that measured it.

## The `cantTell` rate on table and filter pages (#4242)

**Verdict: NOT MEASURED. The recorded calibration sweep is not on this host, so no figure and no twice-the-other-group verdict is stated here.** Absence of a reading is not a rate of zero, and nothing below is a substitute for one.

**The instrument exists.** `cantell-by-page-shape.mjs` is in `a11ign/lab` ([pull request #32](https://github.com/a11ign/lab/pull/32)). It scores nothing: it reads `scored[].cantTell` from the `abstention-sweep.json` that `calibrate-abstention.mjs` writes, groups the pages by the corpus's own `demonstrates` (`/table|filter/i` is table-or-filter, anything else is other), and prints per group the page count, the mean `cantTell` criteria per page, and the share of pages on which 4.1.3 and 3.3.1 are `cantTell`, then whether the table/filter mean is at least twice the other group's. Run from a lab checkout:

```bash
node packages/lab/scripts/cantell-by-page-shape.mjs [path/to/abstention-sweep.json]   # default: runs/abstention/abstention-sweep.json
```

With no sweep it exits 2 and names the file. Tested on the real `REAL_PAGES`: the GOV.UK table page is table-or-filter, the GOV.UK skip-link page is other, an empty group prints `n=0` and `-` (never NaN), and the group counts add to the calibration-page count.

**Why no figure.** Checked 2026-10-08 on the host this row ran on: no `abstention-sweep.json` anywhere under `/home/agent`, no `runs/` in the lab checkout or this one, no `/srv/a11y-runs`. `calibrate-abstention.mjs` spawns the scorer once per capture over `runs/`, which is the lab's corpus and the fleet's to read for a verdict (`packages/lab/CLAUDE.md`), so an engineer does not run it. **`orchestrator` is asked for the run** (on #4242): the sweep at the shipped model, then the command above over its output.

**What the sample will bear, measured now from the corpus alone** (`pagesFor("calibration")` and the script's `shapeOf` at lab `origin/main` `0e98109c`, 2026-10-08):

| Group | Calibration pages in the corpus |
|---|---|
| table-or-filter | 3 |
| other | 46 |
| total | 49 |

The three: the GOV.UK table page ("data table with row and column headers"), the NHS service manual table ("documented data table with a worked example"), and W3C WAI's *before* `tickets.html` ("ticket listing, broken — NOT a form: 0 `<form>`, 0 `<input>`, 14 layout tables"). **The third matches `/table/` on layout tables, not on a data table**; the row fixes the pattern, so it stays in, and the verdict should be read with and without it. With n=3 (or 2), one page moves the group's mean by a third, so even a measured "at least twice" is a pointer and not a finding. The sweep scores only the pages whose capture NVDA read, so its own n can be smaller than 49.

**Two cautions for whoever reads the run.**

1. **4.1.3 and 3.3.1 are `UNWITNESSABLE_ON_REAL_PAGES`** (`real-page-corpus.mjs`) unless a page carries a consented `formState`. A high `cantTell` share on those two on any real page may be the criterion not being reachable, not the scorer being unfamiliar with tables. Read their shares against the pages that carry a `formState`, not against the group.
2. **No filter page is declared in the calibration set at all** (no `demonstrates` carries "filter"), so "table or filter" is, at this corpus, "table".

**The reduction row.** Not filed: it names the criterion that dominates, and without the run there is none to name. It is filed when the run reports the mean at least twice the other group's; if it does not, this section is amended to say the gap is not there, and gives n.
