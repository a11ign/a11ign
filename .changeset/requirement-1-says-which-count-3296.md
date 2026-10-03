---
"@a11ign/evidence": patch
---

**A report's Conformance Requirement 1 now says which count it states (#3296).** When the rule layer ran, "Assessed N of 55" read as a tally of the run while being the screen-reader layer's and scorer's reach, and the limitation called every other criterion "NOT assessed … unchecked", which was false for the ones axe-core covered. It now names the figure as that layer's reach, points at the per-criterion `outcomes` for the run's own split, and no longer calls criteria the rule layer covered unchecked. A run without the rule layer reads as before.
