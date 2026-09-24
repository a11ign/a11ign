---
"@a11ign/agent-org": patch
---

`queue:table` no longer prints a pull request at the front of the merge queue as `UNARMED`. `armed` was `Boolean(pr.auto_merge)`, and REST has no merge-queue field while a queued pull request has left auto-merge; the row now asks `armedFromApi` (the predicate `arm-pr` and `auto-arm-sweep` already share) and `openPRs` reads the queue with one bulk GraphQL call beside the REST list. A queued pull request prints `QUEUED(<position>)`, and if the queue cannot be read the row prints `armed?` and the section is INCOMPLETE rather than falling back to `UNARMED` (#2245).
