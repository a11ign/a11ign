---
"@a11ign/agent-org": patch
---

**The gate reads `parked` (#2653).** A parked row whose declared blocker closed was ordered to `product-manager` for promotion, and again at every re-ask: #2568 was ordered 30 minutes after it had been parked, its blockers #2561 and #2644 having closed. `unclaimedClearings` (the `unclaimed-blocker-cleared` population) and `readPromotableRows` (the `ready-queue-empty` stock reader, whose list `laneBacklogOrders` and `decide`'s pool count also consume) now skip a row carrying `parked`, each in its own population, behind a named `PARKED_LABEL` beside `CHAIRMAN_LABEL`. `waitingOn` is unchanged.
