"""#1878: `3.3.1:validation-error-silent`'s applicability precondition read a bare task button as a
submitted form.

`_interacted("postSubmitFields")` alone is satisfied by ANY `probeForms` re-read, including a
`<button type="button">` with no `<input>` anywhere on the page — `waitingStatusPair`/`progressStatusPair`
in `acceptance-matrix.mjs` produce exactly that shape, and two of their held-out cases false-positived on
3.3.1 as a result. The subject of this subtype's claim is a form having been SUBMITTED, which needs the
page to carry a field with a field ROLE; a non-empty list does not establish that.

EVERY FIXTURE HERE IS THE CAPTURED SHAPE, and that is the point of the second attempt. #1894's fixtures
modelled a task-button page with `formFields: []`, which no real capture has: NVDA's form-field sweep lists
buttons, so `formFields` holds `"Continue to dates, button"` on the very pages this is about. Against that
empty fixture, `_has("formFields")` looked like a fix and its mutation looked caught; against the lab's
records it ruled out nothing (`orchestrator`, 2026-09-22 09:30Z on #1878). The values below are the lab's
`formFields`/`postSubmitFields` for those cases, from that reading.

Each case here is built to produce one verdict, and the pair is asserted to DIFFER: a test that cannot
tell the two apart would pass against the very behaviour it exists to refuse.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

import applicability  # noqa: E402

SUBTYPE = "3.3.1:validation-error-silent"

# `acceptance-status-progress-booking/bad`, as captured: the task button is in BOTH channels.
TASK_BUTTON = {
    "form_fields": ["Continue to dates, button"],
    "post_submit": ["Continue to dates, button"],
}
# `acceptance-b3-button-market/bad`, as captured: a real `edit` field and a real submit.
REAL_FORM = {
    "form_fields": ["Reference number, edit", "Cancel this booking, button", "Save changes, button"],
    "post_submit": ["section, Reference number, edit", "Cancel this booking, button", "Save changes, button"],
}


def record(post_submit=(), form_fields=()):
    return {
        "input": {
            "structure": {"formFields": list(form_fields)},
            "interaction": {"postSubmitFields": list(post_submit)},
        }
    }


def applicable(post_submit=(), form_fields=()):
    return applicability.applicable(SUBTYPE, record(post_submit=post_submit, form_fields=form_fields))


def test_a_task_button_swept_as_a_form_field_is_not_a_submitted_form():
    # A non-empty `formFields` is what every page with a button has; it must not be read as a form.
    assert applicable(**TASK_BUTTON) is False


def test_the_waiting_status_shape_is_not_a_submitted_form_either():
    # `acceptance-b3-status-waiting-tree/bad`, the other case #1878 names — `waitingStatusPair`'s `taskButton`.
    assert applicable(form_fields=["Check consent, button"], post_submit=["Check consent, button"]) is False


def test_a_real_form_submission_stays_applicable():
    # `b3-button-market` really has a form, so the field-role condition must NOT hide it. Its 3.3.1 fire was
    # an UNREAD outcome (#1903), which a different condition rules out -- not this one.
    assert applicable(**REAL_FORM) is True


def test_the_two_are_distinguished_and_not_merely_both_ruled_out():
    # ANTI-VACUITY. If both read False the precondition has gone deaf rather than become precise.
    assert applicable(**TASK_BUTTON) != applicable(**REAL_FORM), (
        "the precondition cannot tell a task button from a form submission"
    )


def test_a_field_role_seen_only_in_the_post_submit_re_read_is_enough():
    # The field is the subject whether the sweep or the re-read caught it; a sweep that missed the field
    # must not silence a submission whose re-read announced it.
    assert applicable(form_fields=["Save, button"], post_submit=["Email, edit", "Save, button"]) is True


def test_every_field_role_counts():
    for role in ["edit", "combo box", "list box", "checkbox", "radio", "spin button"]:
        assert applicable(form_fields=[f"Field, {role}"], post_submit=["Submit, button"]) is True, role


def test_a_form_field_present_elsewhere_with_nothing_submitted_is_still_inapplicable():
    # The subject is a SUBMISSION, not merely a page that happens to carry a field. Dropping the
    # `postSubmitFields` half of the AND would rule this back in on fields the capture never re-read.
    assert applicable(post_submit=[], form_fields=["Email, edit"]) is False
