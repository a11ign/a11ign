---
"@a11ign/lab": patch
---

`prefix-budget.test.ts` had one threshold, the 20,000 B refusal, so a set 14 B under it warned nobody and the author who tipped it over learned from a red gate in their own pull request. The bands and remedies now live in `prefix-budget.mjs` (`prefixBudgetVerdict`): below 18,000 B `ok`, from 18,000 B to 20,000 B inclusive `warn` (the suite stays green, and prints the number, the headroom and the remedy), above 20,000 B `over` with the refusal and its `REMEDY` text unchanged. The warn remedy carries `ceo`'s ladder in order (move narrative, shorten over-long pins provided the claim and both its directions stay pinned, then `ceo`; deleting a rule is not on it) and the debt's author and due date: whoever adds N bytes of rule frees N bytes of narrative in the same pull request. The band was in breach on the day it landed (19,986 B at `c06bc5cc3`, 19,972 B at `df20cfe09`) and the file records that, so it is not closed by moving the number (#2248).
