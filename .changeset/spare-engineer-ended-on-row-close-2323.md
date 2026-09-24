---
"@a11ign/agent-org": patch
---

**A spawned engineer is now ended when the row it claimed closes, and it acts as the workers account (#2323, #1950 ruling a).** `work-tick` runs a teardown step on every tick, quiet ones included: a spare role (`sessions.json`'s `spare` mark, now `worker-4` to `worker-8`) that has held a row, holds none now and is idle has its workspace closed, and every ending writes one `{role,row,at,clean,why}` line to `spare-cycles`. `consecutiveClean(ledger)` reads the current run of clean cycles from it, which is what #1950's 20 is counted from. An instance that never claims within 30 minutes is recorded as a failed cycle. The spawn passes `--env GH_CONFIG_DIR=/home/agent/workers/gh` to `workspace create`, so a fresh workspace id no longer decides which GitHub account an engineer writes as.
