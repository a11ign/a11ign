---
"@a11ign/lab": patch
---

**The repo-wide `Closes` check now reads MERGED PRs as well as open ones, so one open pre-outage PR can no longer veto it (#2830).** `isRepoWideResolutionFault` (#2822) wants the 3 newest OTHER `Closes`-declaring PRs to ALL resolve none, but `lookupRecentOpenPrClosings` read only `states:OPEN`, and #2805 (open, opened 07:07Z, resolves #2790) sat in the window of #2826, #2828 and #2829, so all three read "lone mismatch" and stayed refused. The lookup, renamed `lookupRecentClosesPrs`, now reads `states:[OPEN, MERGED]` with the same `first:` budget and the same newest-first ordering: a merged PR keeps its `closingIssuesReferences` (#2811 still resolves #2810), so the window for #2826 becomes #2829, #2828, #2821, all resolving none. `recentClosesSiblings` and `isRepoWideResolutionFault` are unchanged, so a merged PR that DID resolve inside the newest 3 still refuses; every other refusal keeps exit 1 and its words.
