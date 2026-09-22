---
"@a11ign/worker-fleet": patch
---

**`fleetConsistency` now says WHICH fields it compared, and a field no guest reports is no longer agreement (#1997).** The returned value carries `fields.compared` and `fields.unchecked`: a `MUST_MATCH` entry that drew a value from nobody used to contribute no values, so there was nothing to disagree about and the fleet read as consistent about it — measured on a ten-guest fleet where `displayMode` was compared on 0 of 10 while the headline said CONSISTENT. `doctor`'s agreement line now derives the field names from `MUST_MATCH` instead of naming four of ten by hand, and names any field nobody reported. The absent-skip rule is unchanged: a guest missing a field others report is still not a mismatch.
