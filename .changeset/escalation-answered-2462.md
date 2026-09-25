---
"@a11ign/agent-org": patch
---

**Removing `needs:chairman` is now an answer the gate keeps (#2462).** `escalateStuck` labelled every stuck key on every tick and read nothing to learn it had already done so, so a label a person removed came back 26-28 s later (#2451, #2258, #2223, 2026-09-25). The escalation is now written to the wake ledger as an `ESCALATED` marker beside `RESET`, and a key is labelled once per run: it stays off until the causeKey changes or the cause stops being emitted (`RESET`). Removal leaves the key capped and silent rather than resetting its count. `wake-escalation-answered.test.ts` drives the real entry over two ticks.
