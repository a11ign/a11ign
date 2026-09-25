---
"@a11ign/agent-org": patch
---

**An authored order queued to a session that has ENDED is now re-addressed or dropped with a record on the first tick that sees it gone, instead of being refused every tick for ever (#2459).** `worker-12` was torn down and its order sat 7.1h while the tick described a busy session's unread inbox. A target is now `live` (delivered between tasks, as before), `ended` (a teardown recorded closing it: re-addressed to the live session holding the row or pull request the order names, else dropped) or `absent` (never started: KEPT, because `reviewer-<n>` is started after an order for it can be queued). A drop is an appended `dropped` line carrying the id, target, age, reason, author and text, never a `delivered` line and never a rewrite. A herdr that does not answer classifies and drops nothing, and the backlog line no longer calls a missing session "never idle".
