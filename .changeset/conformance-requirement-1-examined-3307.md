---
"a11ign": patch
"@a11ign/evidence": patch
---

**Conformance requirement 1 states the run's own examined count (#3307).** It used to give the screen-reader layer's reach ("N of 55") and send the reader to `outcomes` for the split, so a report's `conformance` and `outcomes` could not be compared. `conformanceFor` now hands the criteria axe-core returned a verdict for to `conformanceScope` (new optional `ruleLayerCovered`), and requirement 1 reads "examined N of 55: M by the screen-reader layer and scorer, K further by axe-core alone". N is the non-`untested` count of `outcomes`. Without `ruleLayerCovered`, or with no rule layer, the earlier wording stands.
