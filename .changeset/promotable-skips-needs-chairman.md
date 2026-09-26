---
"@a11ign/agent-org": patch
---

**`ready-queue-empty` no longer counts a `needs:chairman` row as promotable stock (#2604).** `readPromotableRows` dropped a backlog row only for a `NOT_STARTABLE` label or a `waitingOn` wait, and `waitingOn` does not read `needs:chairman`, so #2561 (whose first step, a private repository, did not exist) was counted: the empty-shelf order read 3 where the truthful reading was 2, and `product-manager` was woken to re-derive a verdict already on the row. The filter sits in `readPromotableRows` itself, the same choice #2585 made for `unclaimedClearings`, rather than in `waitingOn`, which every reader would inherit. A row without the label is counted exactly as before.
