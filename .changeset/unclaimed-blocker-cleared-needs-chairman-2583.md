---
"@a11ign/agent-org": patch
"@a11ign/lab": patch
---

**`unclaimed-blocker-cleared` no longer orders a promotion for a row labelled `needs:chairman` (#2583).** `unclaimedClearings` skipped a row only when `waitingOn` reported a wait, and `waitingOn` does not read `needs:chairman`, so #2561 (whose only `blockedBy` edge #2560 closed at 2026-09-26T00:15:49Z) was ordered to `product-manager` for promotion although the private repository it names does not exist. The row is now skipped in `unclaimedClearings`, the cause's own population, rather than teaching `waitingOn` a fourth kind, which every reader of that function would inherit. The same row without the label still yields an order (positive control).
