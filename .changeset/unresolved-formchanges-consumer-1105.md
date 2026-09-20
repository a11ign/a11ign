---
"@a11ign/judge": patch
---

**A not-yet-readable `formChanges.after` is never read as a real disclosure state, an announced error, or model-prompt evidence (#1105 consumer half).** `readDisclosurePair` now returns `null` when `after` carries the producer's `afterUnresolved` placeholder, so the `4.1.2:state-change-silent` gate can never mistake "not read yet" for a real announcement. `addErrorWithoutRemedy` excludes an `afterUnresolved` submit entry from the announced-error vocabulary match for the same reason, and the LLM-backend prompt builder (`formSubmitLines`) omits such an entry instead of printing it as the literal string `"unknown"`.

**Round 2, the LLM-free local judge (`local-judge.ts`) had the identical gap.** `spokenText` no longer counts an `afterUnresolved` entry's `after` as something the screen reader actually said, so a genuinely silent error is not muffled by the placeholder text happening to match; the `4.1.3` evidence channel no longer treats an unresolved-only `formChanges` entry as evidence a form change occurred (the same shape `@a11ign/scorer`'s `applicability.py` closes for its own path); and `evidenceFor` never quotes an `afterUnresolved` entry as a finding's evidence text.
