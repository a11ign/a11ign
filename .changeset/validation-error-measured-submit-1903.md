---
"@a11ign/scorer": patch
---

**`3.3.1:validation-error-silent` is now reported only when a submit's outcome was actually read (#1903).**
When NVDA's re-read after a submit came back unresolved (`afterUnresolved`), #1105 correctly dropped that
submit from the evidence, but the criterion stayed applicable, so the model scored a form that looked like
"a submit with no announced error" when the outcome was simply not heard. `acceptance-b3-button-market/bad`,
a page with no validation at all, false-positived on 3.3.1 in one repeat this way. The precondition now also
needs a `formChanges` submit entry without `afterUnresolved` (an entry with no `kind` counts as a submit).
Without one, 3.3.1 is unmeasured on that page instead of scored. A read, silent submit, which is the true
positive's shape, stays applicable. No retrain: the gate runs after scoring and touches neither
`model.safetensors` nor `FEATURE_SCHEMA_VERSION`.

Not yet checked against the corpus: `applicability-audit` must still report `positives 171`, and the
acceptance run must show `b3-button-market/bad` absent from 3.3.1's false positives in both repeats.
