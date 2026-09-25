---
"@a11ign/agent-org": patch
---

**A pull request red ONLY from its own hold no longer generates a `pr-checks-failing` order, and so no `needs:chairman` (#2400).** #2376 carried `hold:product-manager` on purpose; the hold turned `deliberateRefusals` red and `gate` with it, and `failingChecksOrder` ordered `product-manager` to fix that cause 35 times before `escalateStuck` labelled the PR for the chairman, and re-labelled it when a person cleared it. `failingChecksOrder` now returns nothing when every settled-red job on the head is `deliberateRefusals` or `gate` AND the PR carries the addressee's own `hold:<session>` label. Removing the hold, a third red job, or a hold held by somebody else all leave the order exactly as it was. The escalation needs no change of its own: it reads only what `deliver` is handed, and an order that is never emitted never reaches the breaker.
