---
"@a11ign/agent-org": patch
"@a11ign/lab": patch
---

**A stuck cause on a MERGED pull request now reaches the session it escalates to (#2641).** `trunkRedOrders` names the merged PR that turned `main` red as its subject, `escalateStuck` labels it `answer:ceo`, and the `answer-owed` reader looked at open issues, open pull requests and CLOSED issues only, so the label was set and read by nothing. `readClosedAnswerRows` now also asks `gh pr list --state all --search 'label:<answer labels> -is:open'` (merged and closed-unmerged, exact by label name, no newest-N window) and hands the rows through the same `withoutEndedAnswerSessions` the closed issues use. The order says the subject is a merged or closed PULL REQUEST. Cost: ONE more `gh` call per tick, `GH_READS.unconditional` 9 to 10; the `label list` is shared, not repeated. A refused read of either half is still `null`, never `[]`.
