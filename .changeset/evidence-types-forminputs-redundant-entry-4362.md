---
"@a11ign/evidence": patch
---

`CaptureResult.formInputs` and `OracleCounts.formInputs` declare the three optional keys 3.3.7 Redundant Entry reads (#4355, #4362): `form?: number` (the owning `<form>`'s document-order index), `required?: boolean` and `populatedFromEarlier?: boolean`. Absent means not checked on each. A type-only addition; the worker census that fills them is #4361.
