# Referral load: how much of it is the same referral said again (#4241, #4084 outcome 4)

**Status 2026-10-08: NOT MEASURED. The recorded outcomes the measurement reads do not exist on this host, so there is no figure, and no side of 20% to report.** That is the row's own stated finding for this case, and the run is asked of `orchestrator` on #4241.

## The question and the decision it carries

The evaluator's complaint was review load: 395 referrals on the 40 conformant pages of the calibration set (README's claim block, measured 2026-09-24 at protocol 21), about ten a page, each needing a person. `summary.ts` renders every referral and nothing groups them. Grouping repeats is worth building only if repeats are a real share of the load.

- A **referral** is a (criterion, quoted text) pair on a page: a model finding, or any finding that does not assert (`mapping` other than `conformance`).
- A **repeat** is a referral whose pair already appeared earlier on the same page. The first sighting is the one a reader must read; only later ones are removable load.
- **Repeat share** = repeats over all referrals. The total is the sum over pages, never the mean of per-page shares.
- **Decision: a total at or above 20% means the claimant of #4241 files the row that groups repeats in `summary.ts` and `report.ts`; below 20%, grouping would not cut the load by a fifth and the next lever is something other than grouping** (for example fewer referring subtypes, or ranking, which this document does not measure).

The tool is `referral-repeat-share.mjs` in `a11ign/lab` (`packages/lab/scripts/`, PRs a11ign/lab#31 and #35), tested on fixtures, including the positive control that five referrals with three repeats read 0.6.

## Why there is no figure

Looked for on this host, 2026-10-08, and not found:

- **No per-page judgments or referrals for the calibration set.** The primary checkout's `runs/` holds `witness/` (34 captures of a handful of sites from 2026-09-19 to 09-23, not the calibration set), `screenreader-dataset/` (synthetic pages), `screenreader-acceptance/`, `repeat-captures/` and `fetched/`. There is no `runs/real-page-corpus/` and no `runs/abstention/abstention-sweep.json`.
- **`calibrate-abstention.mjs`, the reader of the calibration set, would not supply the text even when run:** it records per-page `cantTell` criteria (`scored[].cantTell`), not the quoted text, and a repeat is defined by the text.
- **`runs/fetched/candidate.corpus-archive.gz`** holds a real-page corpus snapshot (about 120 captures, dated 2026-09-26). It is captures, not judgments; it is two days after the 395 reading, and its protocol census and conformant-page selection were not checked here. Scoring it locally would produce a number for an unverified population by a path nobody reviewed, and the lab's own rule is that a corpus-reading limitation is named and routed, not worked around with a stale local copy. It was not used.

## What the run needs to produce

The calibration sweep's one file, `runs/abstention/calibration-judgments.json` (row #4293: `{ pages: [{ url, claim, findings: [{ wcag, evidence, mapping }], cantTell, predicted }] }`, one record per scored page, fetched with `lab:fetch` as the `calibration-judgments` artifact). The reader takes that file as it is (a11ign/lab#35, after lab#31); one JSON per page also works. Then:

```bash
node packages/lab/scripts/referral-repeat-share.mjs calibration-judgments.json
```

prints per-page referrals, repeats and share, then the total and which side of 20% it falls. This document is updated with that output, the date and the command, and the grouping row is filed or declined on it.

**Not read here:** `cantTell` criterion outcomes (a reason, no quoted text, one per criterion) cannot repeat on a page, so they enter the count only when supplied as `referrals` entries; whether the 395 includes them is a question for the run to answer by printing both counts.
