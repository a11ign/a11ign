---
"@a11ign/scorer": patch
---

**`3.3.1:validation-error-silent`'s applicability precondition now requires an actual form field on the
page, not just a `postSubmitFields` re-read (#1878).** `_interacted("postSubmitFields")` alone was
satisfied by a bare `<button type="button">` re-read after any `probeForms` activation, with no `<input>`
anywhere on the page — `waitingStatusPair`/`progressStatusPair` in `acceptance-matrix.mjs` produce exactly
that shape. Three held-out cases false-positived on 3.3.1 as a result: `b3-status-waiting-tree`,
`status-progress-booking`, and `b3-button-market` (an unrelated 2.1.1 case whose page also carries a real
`<form>` submit). `validation_error_missing` already excludes them via `FORM_FIELD_ROLE`, but a linear head
only ADDS — that 0 cannot veto whatever else in the trained weights read these pages as positive; only the
applicability gate can. The precondition is now `_interacted("postSubmitFields") AND _has("formFields")`,
matching `3.3.1:validation-error-silent`'s actual subject (a form was submitted) rather than the weaker "a
`probeForms` activation was re-read". No retrain: the gate runs on top of the model's score and does not
touch `model.safetensors` or `FEATURE_SCHEMA_VERSION`.

Unverified against the authoritative corpus in this checkout — `test_no_precondition_silences_a_true_positive`
reads `runs/`, which is not present here, and honestly skips. `npm run lab:job -- -e job=applicability-audit`
still needs to run on the lab to confirm no `3.3.1:validation-error-silent` true positive is silenced,
before this is treated as a settled result rather than a checkout-local fix.
