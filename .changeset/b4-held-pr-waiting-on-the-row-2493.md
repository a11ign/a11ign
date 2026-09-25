---
"@a11ign/agent-org": patch
"@a11ign/lab": patch
---

**B4 no longer refuses a row behind a HELD pull request that is waiting on it (#2493, `ceo`'s ruling on #2400 section 2).** #2399 was refused for a file #2376 held while #2376 was waiting on #2399; the wait was a comment, and it was broken by hand. `fileOverlapReason` now excludes an overlapping PR only when BOTH it carries a `hold:` label AND every row it `Closes` is `blockedBy` the asking row. An edge with no hold, a hold with no edge, a held PR that closes nothing (`Closes: none`: `every` is vacuously true of an empty list) and one closing two rows with only one edge all still refuse, and a closed row whose blockers could not be read counts as not excluded. The claim, `row-claim check`, the spawn filter and the gate's pre-filter (`blockedOnOpenPr`) read the same two facts, so the gate neither shelves what the claim would grant nor offers what it would refuse. The gate adds no call (`labels` joins `readPrs`'s and `lookupOpenPrFiles`'s existing `pr list`, `blockedBy` comes from the open rows already read); the claim reads a closed row's edges only for a held PR that overlaps.

**The edge now wakes the owner.** `blocker-cleared` counted ANY open pull request naming the row as "already resumed" (#2161), so #2376's owner, whose PR named #2359, would never have been woken when #2399 closed. A held PR is a declared wait rather than an act, so it no longer screens the order. `product-manager`'s brief gains the ready-audit line `SOLE HOLDER IS A HELD PR`, pinned by a test.
