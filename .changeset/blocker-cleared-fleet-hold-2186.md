---
"@a11ign/lab": patch
---

The `blocker-cleared` cause no longer wakes the session holding a row whose declared blockers are all closed while a `Fleet-hold-until:` in its body is still in the future. It asked `waitingOn`, which by design does not read that line, so on 2026-09-23 `worker-judge` was cleared and woken for #2114 six hours before the fleet released it, while the same tick's shelf line said the row was held. It now asks `fleetWaitingOn` and is emitted again on the tick after the timestamp passes. The offer path is untouched: the rationale for keeping the fleet hold out of `waitingOn` concerns whether the engineer pool may be offered a row, and this cause addresses a session that already holds it (#2186).
