---
"@a11ign/agent-org": patch
---

**A pull request that cannot merge for any reason but red now has an owner signal: `stallReasonOf` classifies every open PR into exactly one of seven reasons (#2968).**
#2950, the health detector's own PR, sat a DRAFT, `DIRTY`, with an empty `statusCheckRollup` for 7.5 hours and no order reached its
owner. The conflict order was fed by `greenUnheldPrs` ("not a draft, settled GREEN"), and a branch that conflicts gets no
`pull_request` run, so the one state a conflict produces was the one state that population could not see.

`stallReasonOf(pr)` (`work-gate/pr-orders.mjs`) is TOTAL: `progressing | red | conflicted | awaiting-review |
awaiting-author-draft | unarmed | held-on-purpose`, asked of every pull request in that order (a hold or `awaiting-evidence` first, then
red, then a conflict BEFORE any green is required). `decide` now sends the conflict order from `stalledPrOrders` instead of from
`conflictedPrs`, so a conflicted draft and a conflicted PR with no checks reach `ownerOfPr(pr).session`, and an unlabelled one
reaches `ceo` rather than `product-manager`. The `pr-merge-conflict` text and key are unchanged for the case that already worked.
The other reasons already have a cause that reaches the owner, so `decide` does not send them twice (`STALL_REASONS_WITHOUT_A_CAUSE`);
a `pr-stalled` cause would be a change to `cause-declaration.mjs`, outside this row.
