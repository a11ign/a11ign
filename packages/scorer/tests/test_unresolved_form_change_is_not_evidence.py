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
