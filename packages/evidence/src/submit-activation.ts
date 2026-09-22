/**
 * WAS THIS ACTIVATION A FORM SUBMIT? One answer, because three consumers asked it separately and all three
 * got it wrong the same way (#1918).
 *
 * `kind` is what the probe CALLED the button, and `probeKindFor` can only read its announced name. A
 * `<button type="submit">` named "Apply for a berth" misses `SUBMIT_RE` and is pressed as a `taskButton`,
 * so `kind === "submit"` said no to a real submit. Measured 2026-09-22: 3 of the 14 held-out 3.3.1
 * positives in each acceptance repeat.
 *
 * `taskButton` alone is still NOT a submit, which is why the answer is not "accept both kinds". That kind
 * marks a button the task names, usually a filter that submits nothing. Accepting it would make 26 silent
 * 4.1.3 filter positives in the training corpus read as silent validation errors. Measured, the same day.
 * So a non-`submit` kind counts only when the capture MEASURED a `submit` event (`submitted: true`,
 * `CAPTURE_PROTOCOL_VERSION` 21). `submitted: false` does not un-submit a `kind: "submit"`: that reading
 * existed before the field did and is left exactly as it was.
 *
 * `screenreader_features.py`'s `_is_submit` asks the same question in Python. Both languages run ONE case
 * table, `fixtures/submit-activation-cases.json` (`submit-activation.test.ts`,
 * `test_validation_error_missing_needs_a_submit.py`), so the two cannot drift apart unseen.
 */
import type { CaptureInteraction } from "./index.js";

export type FormChange = CaptureInteraction["formChanges"][number];

export const isSubmitActivation = (change: Pick<FormChange, "kind" | "submitted"> | undefined | null): boolean =>
  change?.kind === "submit" || change?.submitted === true;
