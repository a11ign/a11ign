---
"@a11ign/agent-org": patch
---

**The gate now watches free BYTES and free INODES on `/` and `/tmp`, and tells `ceo` when either is low (#2163).** The outage of 2026-09-25 was `/tmp` out of inodes (1,048,576 of 1,048,576) at 73% of its bytes: six hours of `ENOSPC` in every session, the chairman the first to know, and `df -h` reading the machine as healthy. `disk-headroom.mjs` reads `fs.statfsSync` (no subprocess), judges the two resources SEPARATELY and never combined, reads one filesystem once when `/` and `/tmp` share it, and treats a filesystem reporting zero total inodes as having no limit. The new `disk-headroom-low` cause is a judgment cause addressed to `ceo`, keyed on which resource of which filesystem, and is FINISH (a drain does not withhold it).

**What carries it when the disk is full.** The gate writes `DISK LOW: ...` on stderr before it reads GitHub, so a `CANNOT_ASK` exit does not hide it, and puts the order FIRST of the tick. Measured against the real `wake.mjs`: a throwing write to `wake-emitted` ends `wake` before ANY delivery, and a throwing ledger append ends it after the first. Making those writes non-fatal is `wake.mjs`'s, outside this row's Region, and is named on #2163.
