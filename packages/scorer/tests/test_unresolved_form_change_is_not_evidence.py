"""An unresolved document title is not a form change, and every consumer must agree that it isn't.

`capture-probes.mjs`'s retry-and-flag producer (#1105) sets `afterUnresolved: true` on a `formChanges`
entry when `after` still reads as NVDA's "unknown" placeholder for a document title that had not resolved,
once its own retry has run. `evidence/src/index.ts`'s own comment on the field is explicit: *"a reader
must never build a finding on `after` when this is set, since it is not yet known whether it names a real
announcement."*

Reviewed on PR #1803 and found incomplete: the consumer half filtered `judge`'s readers
(`unresolved-formchanges-after.test.ts`) but `packages/scorer/src/evidence-units.ts` still appended every
entry -- including an unresolved one -- to the model's `form-change` evidence units, and the Python
featurizer read it as `form_change_present=1` and `form_change_nonempty=1`. Reproduced on the review:
`{"control": "Submit, button", "after": "unknown", "afterUnresolved": true}` still counted as a present,
non-empty form change.

Two consumers here, the same shape `test_errored_probe_is_not_evidence.py` already drives for
`stateChanges`/`error`:

  * `structured_feature_values` (`screenreader_features.py`) -- must read `resolved_form_changes`, never
    the raw `formChanges` channel, for every feature that turns `after` into a signal.
  * `applicability.py`'s `SUBTYPE_REQUIRES["4.1.3:form-activation-silent"]` -- must not rule the subtype
    applicable on a form change nobody could yet read.

Filtered twice for the same forced-duplication reason `_measured_state_change` gives: `applicability.py`
deliberately imports nothing but `typing`. This file pins the two filters equal, and pins the exact
reviewer-reproduced feature values to zero.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

import applicability  # noqa: E402
import screenreader_features as features  # noqa: E402

UNRESOLVED = {"control": "Submit, button", "after": "unknown", "afterUnresolved": True, "kind": "submit"}
RESOLVED = {"control": "Submit, button", "after": "There is an error", "kind": "submit"}
#: A genuinely empty announcement: resolved, and there is simply nothing there. Must still count.
SILENT_BUT_RESOLVED = {"control": "Submit, button", "after": "", "kind": "submit"}

applicable = applicability.SUBTYPE_REQUIRES["4.1.3:form-activation-silent"]


def record(changes):
    return {
        "input": {
            "transcript": [],
            "structure": {"headings": [], "formFields": [], "tableCells": []},
            "interaction": {"controls": [], "stateChanges": [], "formChanges": list(changes), "postSubmitFields": []},
            "evidenceUnits": [],
            "evidenceText": "",
            "parsed": {"transcript": [], "headings": [], "tableCells": [], "controls": [],
                       "postSubmitFields": [], "formFields": []},
        }
    }


def test_the_feature_does_not_count_an_unresolved_entry():
    assert features.resolved_form_changes([UNRESOLVED]) == []
    assert len(features.resolved_form_changes([RESOLVED, UNRESOLVED])) == 1


def test_the_precondition_does_not_admit_an_unresolved_entry():
    assert applicable(record([UNRESOLVED])) is False
    assert applicable(record([RESOLVED])) is True


def test_a_resolved_silence_still_counts_and_that_is_the_whole_point():
    # The distinction that matters: a submit that resolved and said nothing is 4.1.3's actual finding, and
    # filtering it out would make the fix deafer than the defect. Only `afterUnresolved` is excluded.
    assert len(features.resolved_form_changes([SILENT_BUT_RESOLVED])) == 1
    assert applicable(record([SILENT_BUT_RESOLVED])) is True


def test_the_two_filters_agree_on_every_shape():
    for changes in ([], [UNRESOLVED], [RESOLVED], [SILENT_BUT_RESOLVED],
                     [UNRESOLVED, UNRESOLVED], [UNRESOLVED, RESOLVED], [SILENT_BUT_RESOLVED, UNRESOLVED]):
        assert bool(features.resolved_form_changes(changes)) == applicable(record(changes)), changes


def test_reviewer_reproduction_form_change_present_and_nonempty_read_zero():
    # The exact shape from the #1803 review: an unresolved submit must not read as a present, non-empty
    # form change -- the review's own reproduction, pinned so it cannot silently come back.
    values = features.structured_feature_values(record([UNRESOLVED]))
    assert values["form_change_present"] == 0.0
    assert values["form_change_nonempty"] == 0.0


def test_a_resolved_submit_still_reads_present_and_nonempty():
    # POSITIVE CONTROL for the test above: an identical shape, resolved, DOES read present/nonempty --
    # proving the zero above is the filter working, not the features gone deaf.
    values = features.structured_feature_values(record([RESOLVED]))
    assert values["form_change_present"] == 1.0
    assert values["form_change_nonempty"] == 1.0


# ---- #1903: `3.3.1:validation-error-silent` requires every activation's outcome READ -----------------------
#
# `acceptance-b3-button-market/bad`, repeat-2 as captured on the lab (`orchestrator`, 2026-09-22 09:59Z on
# #1903): a real edit field and a real submit, but the submit's navigation read `"unknown"` and was flagged.
# #1105's cut removed it from the evidence, and the model read the gap as the silence 3.3.1 is about.

validation_applicable = applicability.SUBTYPE_REQUIRES["3.3.1:validation-error-silent"]

MARKET_FORM_FIELDS = ["Reference number, edit", "Cancel this booking, button", "Save changes, button"]
MARKET_POST_SUBMIT = ["section, Reference number, edit", "Cancel this booking, button", "Save changes, button"]
MARKET_CANCEL = {"control": "Cancel this booking, button", "after": "", "kind": "taskButton", "baselineQuiet": True}
MARKET_SUBMIT_UNREAD = {"control": "Save changes, button", "after": "unknown", "afterUnresolved": True,
                        "kind": "submit"}
MARKET_SUBMIT_READ = {"control": "Save changes, button", "after": "Market pitch list, document", "kind": "submit"}


def market(changes):
    built = record(changes)
    built["input"]["structure"]["formFields"] = list(MARKET_FORM_FIELDS)
    built["input"]["interaction"]["postSubmitFields"] = list(MARKET_POST_SUBMIT)
    return built


def test_an_unread_submit_does_not_make_3_3_1_applicable():
    # repeat-2 bad: the only submit is unread, and the silent Cancel is a task button, not a submit.
    assert validation_applicable(market([MARKET_SUBMIT_UNREAD, MARKET_CANCEL])) is False


def test_the_same_form_with_its_submit_read_stays_applicable():
    # POSITIVE CONTROL for the test above: repeat-1 bad, identical but for the read submit. The subject is
    # there, so the precondition must hold -- whether 3.3.1 then fires is the model's to decide.
    assert validation_applicable(market([MARKET_SUBMIT_READ, MARKET_CANCEL])) is True


def test_a_silent_submit_that_was_read_is_the_finding_and_stays_applicable():
    # A true positive's shape: the submit resolved and nothing was said. Ruling this out would delete the
    # very absence 3.3.1 exists to catch.
    assert validation_applicable(market([SILENT_BUT_RESOLVED])) is True


def test_a_submit_recorded_as_a_task_button_stays_applicable():
    # `acceptance-b2-error-vessel/bad` as captured: its real submit is named for its task, so `probeKindFor`
    # recorded it as `taskButton`. The first #1903 rule required `kind == "submit"` and silenced this true
    # positive, and `b3-error-badge`/`b3-error-taxi` with it (lab audit at 5f65fc8f9: silenced 6).
    vessel = {"control": "Apply for a berth, button", "kind": "taskButton", "after": "", "baselineQuiet": True}
    assert validation_applicable(market([vessel])) is True


def test_an_unread_task_button_is_unread_too():
    # `kind` cannot say which entry was the submit, so an unread outcome of ANY kind might have been it.
    unread = {**MARKET_CANCEL, "after": "unknown", "afterUnresolved": True}
    assert validation_applicable(market([MARKET_SUBMIT_READ, unread])) is False


def test_an_entry_without_kind_is_judged_the_same_way():
    # Captures older than protocol 8 carry no `kind`.
    legacy = {"control": "Submit, button", "after": ""}
    assert validation_applicable(market([legacy])) is True
    assert validation_applicable(market([{**legacy, "afterUnresolved": True}])) is False
