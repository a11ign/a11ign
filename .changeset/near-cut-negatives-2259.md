---
---

No published package changes (#2259): `@a11ign/lab` is private. The held-out acceptance report gains `nearCutNegatives`,
the negatives scoring inside `[floor, threshold)` per head that records a NP floor, beside `falseNegativeSubtypeScores`;
it is decided by `applicability.decide` at the floor and at the cut, reported only, and moves no cut.
