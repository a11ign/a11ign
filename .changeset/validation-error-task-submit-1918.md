---
"@a11ign/nvda-worker": patch
"@a11ign/evidence": minor
"@a11ign/judge": patch
"@a11ign/scorer": patch
---

**A form submit is now recognised by what it did, not only by what the button is called (#1918).** The worker named an activation `kind: "submit"` only when the button's announced name matched a submit word, so a real `<button type="submit">` named for its task ("Apply for a berth", "Renew the licence") was recorded as `taskButton`. Every check for 3.3.1 then treated it as not a submit. On the held-out acceptance set, that hid 3 of the 14 silent-validation-error pages in each repeat.

Each button activation now carries `formChanges[].submitted`: `true` when it dispatched a form `submit` event, and `false` when a listener on the page saw none. The field is absent when that could not be measured, including on every capture made before `CAPTURE_PROTOCOL_VERSION` 21. The new `isSubmitActivation` (`@a11ign/evidence`) accepts `kind: "submit"` or a measured `submitted: true`. It is now what 3.3.1's applicability (`@a11ign/judge`), the 3.3.3 remedy rule, the navigation heuristic and the scorer's `validation_error_missing` feature (`@a11ign/scorer`) all read. A task button that submitted nothing, such as a filter, is still not a submit.
