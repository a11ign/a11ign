---
"@a11ign/worker-fleet": patch
---

**`doctor`'s fleet line no longer states agreement about a field one guest of three reported (#2034).**
`fleetAgreementLine` derived its "guests agree on" list from `fields.compared`, which is true-if-anybody,
so a field at 1 of 3 was NAMED inside the agreement — worse than a count, because the naming is what
#1997 added to make the sentence actionable, and the reporter count contradicting it was in the same
return value. The list is now derived from `fields.coverage` (#2019) and holds only the fields every
compared guest reported; a partly-reported field is reported in its own clause with its `k of N`, never
silently dropped, since a field missing from the list reads as one that was not compared at all — the
third fact, which is #1997's clause. `fleet:status` was ruled this way in #2019 and the two commands now
describe one fleet in the same words. Never a FAIL in either direction: this changes what the line says,
not whether `doctor` passes.
