---
"@a11ign/agent-org": patch
---

**`ready:audit` now asks whether a Ready row is CLAIMABLE (#2190).** Its header names two founding incidents; #13's shape became the label mutex and #75's ("no Region or Acceptance a worker could run") became nothing. A new `unclaimable ready rows` check reports every open `ready` row that `templateFieldsReason` — the rule `row-claim` refuses by — would refuse, naming the row and the missing section(s), as its own population with its own count. It CALLS that rule rather than restating which sections are required. A hand promotion is the route this closes (#1990 was promoted by hand with no `## Open-check` and refused at claim), since `row-file --promote` already runs the rule but three hand label writes do not.
