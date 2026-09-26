---
"@a11ign/judge": patch
---

**`SCORED_CRITERIA` now lists 1.3.5 and 1.4.2, the two criteria the v20 `training-report.json` gained (#2591).** The retrain wrote both as `modelHead: false` entries, the same shape 2.4.7 has had since v19, and the list is documented to equal the shipped report's own criteria. The weights landed without this line, so `coverage.test.ts`'s parity check failed on `main`. `RULE_CRITERIA` still says who decides, and `assessedCriteria()`, which is the union, is unchanged.
