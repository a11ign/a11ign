---
"@a11ign/scorer": patch
---

**`3.3.1:validation-error-silent` is no longer reported when a button's outcome was never read (#1903).**
When NVDA's re-read after an activation came back unresolved (`afterUnresolved`), #1105 correctly dropped
that entry from the evidence, but the criterion stayed applicable. So the model scored the form as "a submit
with no announced error" when the outcome had simply not been heard. `acceptance-b3-button-market/bad`, a page
with no validation at all, false-positived on 3.3.1 in one repeat this way. The precondition now also
requires that no `formChanges` entry is `afterUnresolved`. Otherwise 3.3.1 is unmeasured on that page instead
of scored. It covers every entry, not only `kind: "submit"`, because `kind` is read from the button's name,
and a real submit named for its task ("Apply for a berth") is recorded as `taskButton`. A read, silent
submit, which is the true positive's shape, stays applicable. No retrain: the gate runs after scoring and
touches neither `model.safetensors` nor `FEATURE_SCHEMA_VERSION`.

Measured on the lab corpus (`with-realism` plus both acceptance repeats) with this rule: 171 labelled
positives, 0 silenced, and `b3-button-market/bad` ruled out in repeat 2 only. The `applicability-audit` and
`acceptance` jobs still need to confirm it.
