---
"@a11ign/evidence": patch
---

`CaptureResult.formInputs` and `OracleCounts.formInputs` declare an optional `pasteCancelled?: boolean` (#4324): absent means not examined, `false` means a cancelable `paste` event was dispatched and not cancelled. A type-only addition; the worker census that fills it is #4314.
