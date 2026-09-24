---
"@a11ign/agent-org": patch
---

**The work gate now reads whether a pull request CONFLICTS with `main`, and tells its author (#2209).**
`readPrs` asked `gh pr list` for eleven fields and neither `mergeStateStatus` nor `mergeable` was among
them, so `shouldBeMerging` filtered on draft, hold labels and required checks only, and a green, unheld,
unarmed pull request that could not merge at all was indistinguishable from one waiting to be armed.
Measured 2026-09-23T18:30Z: #2203 — `DIRTY`, `CONFLICTING`, `APPROVED` — went dirty when #2205 merged and
was reported to `product-manager` as a refused arming credential, an audience that cannot resolve a
conflict and a remedy (`arm-pr.mjs`) that cannot succeed on an unmergeable pull request, while it shelved
six Ready rows under B4.

`readPrs` now asks for both fields on the call it already makes. `conflictStateOf` answers three ways —
`CONFLICTING` on either field, `NOT_CONFLICTING`, and `UNREAD` for an absent or `UNKNOWN` state, which is
never read as clean, in `readPrs`'s own `null`-means-refused spirit — and `mergeCandidates` drops only the
first. **The fix is not an exclusion:** the new `pr-merge-conflict` cause emits one order per conflicted
pull request to the session on its `session:` label (falling back to `product-manager`), naming the real
state and saying not to arm it. It is FINISH work, so a drain does not withhold it, and it partitions
`mergeCandidates`' population with `pr-review-blocked` rather than overlapping it.
