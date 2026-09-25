---
"@a11ign/agent-org": patch
---

**`ready:audit` now compares the board Status with the `ready` label (#2150).** Every one of its checks read labels, so a row could read `Ready` on Project 1 while its labels said `backlog`, or carry `ready` beside Status `Backlog`, and nothing reported either. A new `status vs ready label` check reports both directions, naming the row, what the Status says and what the labels say: Status `Ready` beside `backlog` is an interrupted `row-file --promote` (remedy: run it again, it is idempotent), and a hand-moved field states both readings rather than picking one. A row with no Status, or no board item, stays with `readyRowsMissingStatus` and `openRowsAbsentFromBoard` and is not reported twice.
