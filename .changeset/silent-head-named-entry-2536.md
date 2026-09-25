---
"@a11ign/lab": patch
---

**`releasability()` reads a list of heads `ceo` ruled MAY ship silent, so `promote:gated` can reach the promotion of the v20 candidate (#2536).** `4.1.3:status-waiting` found 0 of 29 development positives and the SILENT blocker was beyond `--accept-regression`. `packages/lab/src/training/accepted-silent-heads.json` now names that head, and only that head (the loader refuses any other id): the id is the match, the measured count is provenance, so `0 of 31` is the same head. It excuses the SILENT line only. Another silent head, the same id under another criterion, and every `regressions()` line still block. A head that scores a true positive later is reported under `stale` and does not fail. `promote:model` and `retrain:pipeline` both read the list, and the promotion changeset now states plainly that the model does not detect waiting-status announcements and lists the held-out lines `--accept-regression` took.
