---
"@a11ign/agent-org": patch
"@a11ign/lab": patch
---

**The stalled-PR table decides "red" through `red-pr.mjs`, so a PR held on purpose is no longer read as a breakage or called "absorbed" (#2981).** `queue-table.mjs` carried its own `isRed` (every conclusion not in `NOT_RED`) over REST check runs and fed it to the table's `red` column and to `absorbed` (`behind > 0 && red`). A `hold:*` turns `deliberateRefusals` and `gate` red by design (#2883, #2954), so a held, behind PR printed as ABSORBED: its owner fixing a red nobody is fixing. The table now maps its REST check runs onto `isBrokenRed`'s input (`brokenCheckNames`) rather than copying `HOLD_OWN_JOBS`, so a hold's own two jobs are not red there and every other red, including one on a held PR, is named. `isRed` stays as section 4's decider (merged commits carry no hold). The one behaviour difference: a conclusion outside `red-pr`'s four (`FAILURE`, `TIMED_OUT`, `STARTUP_FAILURE`, `ACTION_REQUIRED`), such as `STALE`, no longer reads as red in section 2.
