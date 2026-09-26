---
"@a11ign/agent-org": patch
---

**A closed row's `answer:<session>` for a session that has ENDED no longer orders it, every tick (#2609, #2459's second producer).** The close path keeps the label so a question closed unanswered still wakes whoever owes the answer (#2202), but engineer instances are one per row and are torn down with it: `worker-8` on #2116 and `worker-6` on #1995 were each ordered `UNDELIVERED ... no workspace labelled` seven ticks running. `readClosedAnswerRows`'s result now passes through `withoutEndedAnswerSessions`, which takes an `answer:` label off the row copy only when the session is absent from `herdr workspace list` AND a teardown recorded its ending (the spare-cycle and reviewer-endings ledgers, two local reads, no API call), and says `SKIPPED ... has ENDED` for each. A live session's question, a session that has not started yet, and any tick where herdr or the ledgers could not be read are all left exactly as before.
