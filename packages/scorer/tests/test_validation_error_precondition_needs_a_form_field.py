"""#1878: `3.3.1:validation-error-silent`'s applicability precondition read a bare task button as a
submitted form.

`_interacted("postSubmitFields")` alone is satisfied by ANY `probeForms` re-read, including a
`<button type="button">` with no `<input>` anywhere on the page — `waitingStatusPair`/`progressStatusPair`
in `acceptance-matrix.mjs` produce exactly that shape, and three of their held-out cases false-positived on
3.3.1 as a result. The subject of this subtype's claim is a form having been SUBMITTED, which needs the
page to actually carry a form field; `postSubmitFields` non-empty alone does not establish that.

Each case here is built to produce one verdict, and the pair is asserted to DIFFER: a test that cannot
tell the two apart would pass against the very behaviour it exists to refuse.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

import applicability  # noqa: E402

SUBTYPE = "3.3.1:validation-error-silent"


def record(post_submit=(), form_fields=()):
    return {
        "input": {
            "structure": {"formFields": list(form_fields)},
            "interaction": {"postSubmitFields": list(post_submit)},
        }
    }


def applicable(post_submit=(), form_fields=()):
    return applicability.applicable(SUBTYPE, record(post_submit=post_submit, form_fields=form_fields))


def test_a_bare_task_button_with_no_form_field_is_not_a_submitted_form():
    # The `b3-status-waiting-tree` / `status-progress-booking` shape: a `<button type="button">` re-read
    # into `postSubmitFields` as "Check consent, button", with no `<input>` on the page at all.
    assert applicable(post_submit=["Check consent, button"], form_fields=[]) is False


def test_a_genuine_form_submission_stays_applicable():
    assert applicable(post_submit=["Email, edit"], form_fields=["Email, edit"]) is True


def test_the_two_are_distinguished_and_not_merely_both_ruled_out():
    # ANTI-VACUITY. If both read False the precondition has gone deaf rather than become precise.
    bare_button = applicable(post_submit=["Check consent, button"], form_fields=[])
    real_form = applicable(post_submit=["Email, edit"], form_fields=["Email, edit"])
    assert bare_button != real_form, "the precondition cannot tell a task button from a form submission"


def test_a_form_field_present_elsewhere_with_nothing_submitted_is_still_inapplicable():
    # The subject is a SUBMISSION, not merely a page that happens to carry a field. Dropping the
    # `postSubmitFields` half of the AND would rule this back in on fields the capture never re-read.
    assert applicable(post_submit=[], form_fields=["Email, edit"]) is False
