---
"@a11ign/scorer": patch
---

**`3.3.1:validation-error-silent`'s precondition now needs a field with a field role, correcting the
previous #1878 entry, whose `_has("formFields")` ruled nothing out on real captures.** NVDA's form-field
sweep lists buttons, so `structure.formFields` is non-empty on any page with a button
(`['Continue to dates, button']` on `status-progress-booking/bad`, `['Check consent, button']` on
`b3-status-waiting-tree/bad`). The precondition now requires a `formFields` or `postSubmitFields` value
matching `FORM_FIELD_ROLE` (edit, combo box, list box, checkbox, radio, spin button), still ANDed with a
post-submit re-read. A page whose only "fields" are buttons is no longer a submitted form, and 3.3.1 no
longer reports on it. `b3-button-market/bad`, which has a real `Reference number, edit` field, stays
applicable. No retrain: the gate runs after scoring and touches neither `model.safetensors` nor
`FEATURE_SCHEMA_VERSION`.

Not yet checked against the corpus: `applicability-audit` and the acceptance run are tracked in #1906.
