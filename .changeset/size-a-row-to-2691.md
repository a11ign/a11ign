---
"@a11ign/lab": patch
---

**A row is filed sized to finish, ruled by the chairman via `ceo` 2026-09-27 (#2691, #928).** `product-manager.md` now carries the filing rule: a row is estimated at filing time to finish in about 60 calls or fewer, and split if it is expected to run past ~100 -- weighing Region size, files touched, and whether a mutation check or a fleet/lab round-trip is implied. A row that cannot reasonably be split smaller says so in its own body.

**The live half: `row-call-count-signal`.** `work-gate.mjs` reads every claimed row's session against its OWN live transcript (reusing `token-audit.mjs`'s `claudeTurns`/`transcriptFiles`/`summarise`, never a second parser) and names any row whose session has passed 100 calls as a split candidate for `product-manager`'s judgement -- a signal, never an automatic split.
