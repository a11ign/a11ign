---
"@a11ign/agent-org": patch
---

**A Ready row carrying the `priority` label is now offered ahead of the rest (#2293).** The gate sorted
offers by row number alone, so a priority call made by `ceo` or the chairman lived in a comment or a body
line and lost to row order: #2279 was prioritised at ~08:55Z on 2026-09-24 and sat unclaimed for three hours
while `worker-judge` went idle. `rowOrders` now sorts `priority` rows first and by row number within each
group, BEFORE the per-tick cap, so a priority row above the cap is still offered. The label orders offers
and nothing else: a `lane:<owner>` row still goes to its owner, and a B4-shelved, `answer:`-shelved or
claimed row is still not offered.
