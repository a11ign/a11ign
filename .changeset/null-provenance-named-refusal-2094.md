---
"@a11ign/scorer": patch
---

`read_records` now refuses a record whose `provenance` is `null` with the named finding it always meant to give -- `record N has no grouping family` -- instead of `AttributeError: 'NoneType' object has no attribute 'get'`. `"provenance": null` is a different shape from an absent key, and the plain `get("provenance", {})` default covered only the second, so the one load point every reader shares turned its own refusal into a crash. Consumer-visible because this is the error a caller reading a malformed dataset sees: a stated contract failure naming the record, rather than a traceback from inside the featurizer (#2094).
