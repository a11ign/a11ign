---
"@a11ign/agent-org": patch
"@a11ign/lab": patch
---

**The chairman-blocked order's key advances by the UTC day, and the order is emitted only in a two-hour window at its start (#2989).** `chairmanOrders` keyed on `daysSince(oldest updatedAt)`, and `ceo` answers the order by commenting on the rows, which writes `updatedAt`: the age read 0 for ever, `wake` re-delivered the unchanged key every `JUDGMENT_TTL_MS` up to `MAX_DELIVERIES`, and the tick then printed `STUCK ceo/chairman-blocked/0` on every run (89 consecutive ticks when an engineer picked the row up). The key is now `ceo/chairman-blocked/day-<n>` on the epoch-day grid, and the order exists only while the day is under `PROMOTION_ASK_WINDOW_MS` (= `JUDGMENT_TTL_MS`) old, `promotionAskWindow`'s mechanism (#2286): one delivery a day with no state kept, and the cause going unemitted between windows is what writes the ledger's `RESET`. A daily key alone would have reached the cap in ten hours and been `STUCK` for the other fourteen. The prompt no longer claims "NO ACTIVITY OF ANY KIND for N day(s)"; it says it is a standing daily reminder for a named UTC date. `decide` takes an injectable `nowMs`.
