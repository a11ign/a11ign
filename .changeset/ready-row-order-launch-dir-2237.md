---
"@a11ign/agent-org": patch
---

The `ready-row-unclaimed` order no longer tells an engineer to run `row-claim` from the primary checkout, which `launchGate` has refused since #1352; it names the engineer's own linked worktree instead (#2237).
