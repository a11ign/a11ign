---
"@a11ign/agent-org": patch
---

**The gate offers a row labelled `priority` before the others (#2296).** The label was created 2026-09-24 as "offer this row before others" and no code read it. `rowOrders` now sorts `priority` rows ahead of the rest, oldest-first within each group, before the per-tick slice, so a high-numbered priority row is not cut by the cap of eight. A `priority` row that `partitionUnclaimed` shelves stays shelved: the label reorders offers, it does not grant a claim.
