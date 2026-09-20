---
"@a11ign/judge": patch
---

**A not-yet-readable `formChanges.after` is never read as a real disclosure state, an announced error, or model-prompt evidence (#1105 consumer half).** `readDisclosurePair` now returns `null` when `after` carries the producer's `afterUnresolved` placeholder, so the `4.1.2:state-change-silent` gate can never mistake "not read yet" for a real announcement. `addErrorWithoutRemedy` excludes an `afterUnresolved` submit entry from the announced-error vocabulary match for the same reason, and the LLM-backend prompt builder (`formSubmitLines`) omits such an entry instead of printing it as the literal string `"unknown"`.
