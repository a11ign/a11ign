---
"@a11ign/agent-org": patch
---

**The live gate can now record the reads it gave `decide`, for the shadow-window runner (#2849, child 5d-0 of #69).** When `<stateDir>/shadow-window-open` EXISTS, each tick writes `<stateDir>/shadow-reads/<tickUtcMs>.json` holding `{ tick, args, orders }` (the exact object `decide` was called with and its raw return, before `withStalePrimaryNotice`), atomically, keeping the newest 30; a failed write is a stderr line and never changes the tick. With the marker absent it costs one `existsSync` and writes nothing, so nothing changes until the host arrangement that opens the window creates the marker. The writer, pruner and marker check are in the new `shadow-reads.mjs`; `work-gate.mjs` gains only `decideAndTap` and a named `decideArgs`.
