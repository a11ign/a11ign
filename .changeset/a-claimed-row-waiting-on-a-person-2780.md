---
"@a11ign/agent-org": patch
---

**`blocker-cleared` no longer tells the holder of a claimed row to PICK IT BACK UP when the row is labelled `needs:chairman` or `parked` (#2780).** #2623 was asked roughly every 20-25 minutes, 19+ times in one day, after `needs:chairman` replaced its last blocker, because `blockerClearedOrders` (the claimed-row cause) was the fourth reader of the wait `waitingOn` deliberately does not read, after #2583, #2604 and #2653 closed the three that reach an unclaimed row. One predicate, `holderWaitingOn`, now serves `blockerClearedOrders` and `anyBlockerClearingCandidate`, so the population that pays for a `closings` read cannot drift from the one that uses it. `work-gate.test.ts` pins both labels with a positive control each.
