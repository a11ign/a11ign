---
"@a11ign/agent-org": patch
---

**A merged PR's close no longer silently voids `answer:<session>` (#2202).** `readOpenRows` is `--state open`, so the instant a merge closed a row carrying the label it left the population `answer-owed` reads and the wake stopped with nothing saying so: #1936, #1970 and #2034 (2026-09-22) were each labelled 5 to 15 minutes before a merged PR closed them and none of the three questions was ever answered. `closurePlan` now returns `owed` (row and session) across its `close` and `already` buckets, `labelsToStrip` deliberately keeps `answer:*`, the closing comment and job log name the debt, and the gate's `readClosedAnswerRows` keeps waking the session for a closed row that still wears the label. It is two exact `gh` calls, so `GH_READS.unconditional` moves from 6 to 8.
