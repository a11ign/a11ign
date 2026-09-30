---
"@a11ign/agent-org": patch
---

**`unclaimedBlockerClearedOrders` now hands its injected `now` to the `Not-before` comparison (#2812).** `unclaimedClearings` asked `waitingOn` with no clock, so an hour-form `Not-before:` was read against the wall clock while every other part of the function used the injected one. `work-gate.test.ts` went red on `main` at 2026-09-30T00:00Z by the calendar alone. `unclaimedClearings` takes `nowMs` and passes it on; the test now derives its hour from `now`, so it holds on any day.
