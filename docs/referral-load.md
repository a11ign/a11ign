# Referral load: how much of it is the same referral said again (#4241, #4084 outcome 4)

**Status 2026-10-09: BELOW the 20.0% line on the 49 text-bearing referrals of the sweep's file (0 repeats of 49), and that is NOT a statement about the 395.** The two counts count different things (below): the complaint's ~10 a page are `cantTell` *criteria*, which carry no quoted text and are one per criterion per page, so this measurement cannot see them. No grouping row is filed on this figure, and none is declined on it for the complaint's load.

## The question and the decision it carries

The evaluator's complaint was review load: 395 referrals on the 40 conformant pages of the calibration set (README's claim block, measured 2026-09-24 at protocol 21), about ten a page, each needing a person. `summary.ts` renders every referral and nothing groups them. Grouping repeats is worth building only if repeats are a real share of the load.

- A **referral** here is a (criterion, quoted text) pair on a page: a model finding, or any finding that does not assert (`mapping` other than `conformance`).
- A **repeat** is a referral whose pair already appeared earlier on the same page. The first sighting is the one a reader must read; only later ones are removable load.
- **Repeat share** = repeats over all referrals. The total is the sum over pages, never the mean of per-page shares.
- **Decision rule: a total at or above 20% means the claimant of #4241 files the row that groups repeats in `summary.ts` and `report.ts`; below 20%, grouping would not cut that file's load by a fifth.**

## The measurement

Input: the calibration sweep's `calibration-judgments.json` (a11ign/lab#37, #4293), `scoredAt` **2026-10-08T23:44:59Z**, fetched copy `runs/fetched/candidate.calibration-judgments.json` in the primary checkout (sha256 `3c4ab0e9b6fc…`). Measured 2026-10-09 by running the script on it:

```bash
node packages/lab/scripts/referral-repeat-share.mjs runs/fetched/candidate.calibration-judgments.json
```

(`referral-repeat-share.mjs` is in `a11ign/lab`, `packages/lab/scripts/`, PRs a11ign/lab#31 and #35; run from a lab checkout, with the file's path.) It printed, in total:

```
TOTAL	49	0	0.0%	(49 pages; BELOW the 20.0% line)
```

Per page: 49 pages, 26 with at least one referral, **0 repeats on every page**. Referrals per page, pages with any: `w3.org/WAI/demos/bad/before/{template,tickets}` 7 each, `.../before/news` 6, `tfl.gov.uk/modes/tube` 3, `networkrail.co.uk/careers`, `cqc.org.uk/search`, `weather.metoffice.gov.uk`, `reports.ofsted.gov.uk` 2 each, and 1 each on the other 18 (the full 49-row table is the script's output above; reprint it, do not quote it from here).

Counted separately from the file with a one-off `node -e` over `pages[]` (not part of the script): the 49 split into **29 referrals on the 46 `conformant` pages** (23 of them with at least one) and **20 on the 3 `inaccessible` pages**, which are the `w3.org/WAI/demos/bad/before/*` demos. The script does not filter on `claim`, so the 0.0% includes pages the complaint's population excludes; with them removed the conformant-only count is 29 referrals and the share is still 0 (no repeat anywhere in the file).

## The mismatch with the complaint (not hidden)

| | the complaint | this file |
|---|---|---|
| count | 395 referrals, 40 conformant pages (~9.9 a page), 2026-09-24, protocol 21 | 49 referrals, 49 pages (~1 a page); 29 on 46 conformant pages |
| what is counted | `cantTell` **criteria** on conformant pages: `calibrate-abstention.mjs` sets `referred = Σ page.cantTell.length` over conformant pages | `findings` that do not assert, each with its quoted `evidence` |

**Explained, measured on the same file:** summing `cantTell` over its 46 conformant pages gives **471, 10.24 a page**, against the README's 395 over 40 (9.9 a page). That is the same quantity within the stated drift (the README itself says three pages left and two joined the conformant set and gives no cause for the change in referrals; this sweep is a later run on a 46-page conformant set, and I did not trace why 46 and not 40). So the ~10 a page IS the `cantTell` criteria, and the 49 is a different, much smaller thing. The two are NOT one population counted two ways.

What follows from that:

- A `cantTell` outcome is **one per criterion per page** (no page in the file lists a criterion twice: 0 duplicates in 491 entries) and carries **a reason, no quoted text**. Under this document's definition of a repeat it **cannot repeat within a page**: the 0 is structural for those, not a finding about them.
- Where they do repeat is **across pages**: the 471 conformant `cantTell` outcomes fall on only 16 distinct criteria, and `1.4.13`, `3.2.1`, `3.2.2` are on all 46 pages, `1.3.1` and `2.4.6` on 35, `2.1.1` and `2.4.3` on 34, `2.4.1` on 32 (the top eight account for 308 of 471). Counted on the file with a one-off `node -e`. `summary.ts` is per page and `report.ts` is per run, so whether that sameness is load a grouping would remove is a different question from the one this row measured, and this document does not answer it.

## The decision, worded for what was measured

- **On this file's 49 text-bearing referrals, repeat share is 0.0%, BELOW the 20.0% line: grouping by (criterion, quoted text) would not cut this file's load by a fifth**, because none of the 49 repeats. It also barely has any load to cut (about one a page).
- **The 0.0% is not yet a statement about the 395 (471 here).** Those are `cantTell` criteria with no text, so the measurement does not apply to them. **No grouping row is filed on it, and none is declined on it** for the ~10 a page.
- **The next lever is a different measurement of the ~10 a page**, not grouping by text: how many of a conformant page's `cantTell` criteria are ones a reader cannot act on, and how many are the same few criteria on every page (above). That needs a definition of "repeat" for criteria with no text (for example the same criterion on N of the pages of a run), which `product-manager` can put in a row if the load is still the complaint. Not a number this row produces.

## What is left, and who owns it

- **The `lab-fetch.yml` gap (for `orchestrator`).** `lab-fetch.yml`'s artifact list has no `calibration-judgments` entry; it lives in the `control` layer and `lab-fetch-paths.test.ts` resolves each entry against its producer. This PR does not edit it, because #4305 holds `lab-fetch-paths.test.ts`. If a re-run is wanted, the follow-up is that one line; until then the file is read from the primary checkout's `runs/fetched/` as above, not through `lab:fetch`.
- **`docs/known-gaps.md` (~3627, "NOT MEASURED")** still says the cost to a reader is not measured. It is outside this row's Region; it now has a figure for the text-bearing 49 and none for the ~10 a page, and wants one edit saying exactly that.
- **A re-run is not needed to read this figure,** only to move it: `calibrate-abstention.mjs` rewrites the file, and the script reads whatever is there.
