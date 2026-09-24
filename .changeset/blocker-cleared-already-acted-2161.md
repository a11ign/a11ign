---
"@a11ign/lab": patch
---

The `blocker-cleared` cause no longer tells the holder of a row to "PICK IT BACK UP" once an open pull request declares `Closes #<row>`. It asked who holds the row and never whether they had already acted, so on 2026-09-23 it woke `worker-capture` 6m56s after a green draft on #2031 and again 1m47s after #2198 on #2145, and woke `worker-judge` 2m24s after #2170's pull request was approved and in the merge queue. Because it is an action cause, the twenty-minute expiry re-offers it for as long as the key matches, and six deliveries label a built, green row `needs:chairman`. It now reads the pull requests the tick has already fetched, so it adds no `gh` call. A claimed row with a cleared blocker set and no such pull request is still announced with the same prompt (#2161).
