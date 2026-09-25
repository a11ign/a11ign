"""`generic_heading_present` asks WCAG 2.4.6's question: does a heading relate to what it introduces? (#2188)

It used to ask whether the heading's STRING was on a hand-written word list, and the two questions gave
opposite answers on the held-out set:

    "Help" above help content       on the list -> fired      conformant (`acceptance-b3-icon-help`)
    "Info" / "General"              not on it   -> silent      vague      (`b3-heading-recycling`, `-taxi`)

so the head ranked BOTH declared 2.4.6 pairs backwards and no threshold could put it right. The criterion is
one sentence with no exception clause ("Headings and labels describe topic or purpose"), its Understanding
page says "a word, or even a single character, may suffice", and ACT rule b49b2e tests the heading against
"the first perceivable content after" it -- `Weather` fails and `Opening hours` passes above the SAME content.

These fixtures are that rule's shape, not the corpus's, so a corpus that happens to repeat one sentence under
every heading cannot be what makes them pass.
"""
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "packages" / "scorer" / "python"))

import screenreader_features as features  # noqa: E402


def heading(name: str, level: int) -> dict:
    return {"objects": [{"role": "heading", "name": name, "states": [f"level {level}"]}],
            "containers": [], "leaving": [], "trailing": []}


def prose(text: str) -> dict:
    return {"objects": [], "containers": [], "leaving": [], "trailing": [text]}


def link(name: str) -> dict:
    return {"objects": [{"role": "link", "name": name, "states": []}],
            "containers": [], "leaving": [], "trailing": []}


def record(*units: dict) -> dict:
    return {"input": {"parsed": {"transcript": list(units)}}}


def fires(*units: dict) -> bool:
    return features.unrelated_section_heading_present(record(*units))


OPENING_HOURS = prose("The library is open from nine until five on weekdays.")


def test_act_pair_one_word_heading_is_judged_against_the_content_under_it():
    """ACT b49b2e's own pair: `Weather` fails above opening hours, `Opening hours` passes above them."""
    assert fires(heading("Page", 1), heading("Weather", 2), OPENING_HOURS)
    assert not fires(heading("Page", 1), heading("Opening hours", 2), OPENING_HOURS)


def test_the_same_word_is_conformant_above_content_that_uses_it_and_vague_above_content_that_does_not():
    """The property the word list could not express: ONE heading, two verdicts, decided by the content."""
    assert not fires(heading("Hours", 2), prose("Opening hours are nine until five."))
    assert fires(heading("Hours", 2), prose("Parking is free."))


def test_help_above_help_content_is_descriptive_and_was_the_false_positive():
    """The four `acceptance-b3-icon-help` false positives: "help" WAS on the list, above a button named help."""
    assert "help" not in features.GENERIC_HEADINGS
    assert not fires(heading("Help", 2), link("Open help"))
    assert not fires(heading("Help", 2), prose("Help is available by phone or online."))


def test_help_above_unrelated_content_is_still_caught_so_removing_it_from_the_list_did_not_go_deaf():
    """Positive control for the test above: a word taken off the list must still be able to fire."""
    assert fires(heading("Help", 2), prose("Bins are collected on Tuesdays."))


def test_the_held_out_vague_headings_that_no_list_contained():
    """`Info` and `General` scored 0.086 and 0.048 against a cut of 0.605 because neither was on the list."""
    assert fires(heading("Recycling guide", 1), heading("Info", 2), prose("The section explains the next step."))
    assert fires(heading("Taxi licence guide", 1), heading("General", 2), prose("The section explains the next step."))


def test_the_descriptive_twins_of_those_headings_stay_silent():
    """The `/good` half of both pairs, which the head ranked ABOVE the vague one."""
    assert not fires(heading("Recycling guide", 1), heading("What goes in each bin", 2),
                     prose("The section explains the next step."))
    assert not fires(heading("Taxi licence guide", 1), heading("Documents needed to renew", 2),
                     prose("The section explains the next step."))


def test_a_generic_word_the_content_repeats_is_still_vague():
    """The corpus's own `Section` sits over "The section explains the next step." -- repeating a word that
    says nothing is not describing a topic, so the list survives as a veto on the relation."""
    assert "section" in features.GENERIC_HEADINGS
    assert fires(heading("Section", 2), prose("The section explains the next step."))
    assert fires(heading("Details", 2), prose("Details of the timetable follow."))


def test_a_plural_matches_its_singular():
    assert not fires(heading("Drafts", 2), link("Delete draft"))
    assert not fires(heading("Categories", 2), prose("Pick a category to browse."))


def test_role_words_NVDA_adds_are_not_content():
    """A heading called "Links" is not related to a page for having one: only NAMES and text count."""
    assert fires(heading("Links", 2), link("Timetable"))


def test_no_heading_fires_nothing():
    """2.4.6 "does not require headings or labels", and ACT's Inapplicable example is "There is no heading"."""
    assert not fires(prose("Bins are collected on Tuesdays."))
    assert not fires()


def test_a_heading_with_nothing_under_it_has_nothing_to_be_unrelated_to():
    assert not fires(heading("Page", 1), heading("Weather", 2))
    assert not fires(heading("Weather", 2), heading("Opening hours", 2))


def test_a_one_word_page_heading_is_not_judged_against_the_chrome_after_it():
    """Measured: three conformant pages whose one-word h1 ("Archive") was followed by a skip link and a nav."""
    assert not fires(heading("Archive", 1), link("Skip to main content"), link("News"))
    assert fires(heading("Archive", 2), link("Skip to main content"), link("News"))


def test_a_phrase_is_not_required_to_be_repeated():
    """A descriptive phrase carries its own topic; demanding the section echo it accuses honest headings."""
    assert not fires(heading("Planning your visit", 2), prose("Parking is free."))


def test_an_unannounced_level_never_fires():
    """Absence read as vague would be the defect this repo files most; no level, no reading."""
    assert not fires({"objects": [{"role": "heading", "name": "Weather", "states": []}],
                      "containers": [], "leaving": [], "trailing": []}, OPENING_HOURS)


def test_a_section_runs_to_the_next_heading_and_no_further():
    """"Hours" is related to ITS section; the vague word under it must not borrow the next one's content."""
    assert fires(heading("Hours", 2), prose("Parking is free."), heading("Parking", 2),
                 prose("Opening hours are nine until five."))
    assert not fires(heading("Hours", 2), prose("Opening hours are nine until five."), heading("Parking", 2),
                     prose("Parking is free."))


def heading_and(name: str, level: int, *rest: dict, trailing: tuple[str, ...] = ()) -> dict:
    """ONE announcement carrying a heading and what follows it ("heading, level 2, Archive, link, Timetable")."""
    unit = heading(name, level)
    unit["objects"].extend(obj for other in rest for obj in other["objects"])
    unit["trailing"].extend(trailing)
    return unit


def test_content_announced_in_the_headings_own_unit_is_that_headings_section():
    """The reviewed defect (#2398): a heading-plus-link unit read as an EMPTY section, so `Hours` above an
    unrelated link fell to the has-content guard and was silent -- a false negative on a supported shape."""
    assert fires(heading("Page", 1), heading_and("Hours", 2, link("Parking details")), heading("Next", 2))
    assert fires(heading("Page", 1), heading_and("Hours", 2, trailing=("Parking is free.",)), heading("Next", 2))


def test_same_unit_content_still_relates_when_it_repeats_the_word():
    """Negative control for the test above: the content read from the heading's unit must be able to CLEAR it."""
    assert not fires(heading_and("Hours", 2, link("Opening hours")), heading("Next", 2))
    assert not fires(heading_and("Hours", 2, trailing=("Opening hours are nine until five.",)), heading("Next", 2))


def test_an_object_announced_before_a_heading_in_its_unit_stays_in_the_earlier_section():
    """Order inside a unit matters. The link precedes `Parking`, so it is `Hours`' content and NOT Parking's:
    read as Parking's, `Hours` would be empty (silent) and `Parking` would be related to it (silent)."""
    link_then_heading = {"objects": [{"role": "link", "name": "Parking details", "states": []},
                                     {"role": "heading", "name": "Parking", "states": ["level 2"]}],
                         "containers": [], "leaving": [], "trailing": []}
    assert fires(heading("Hours", 2), link_then_heading)


def test_the_feature_carries_the_relation_and_not_the_list():
    """The assignment in `structured_feature_values` must call the relation, or the list is the decider again."""
    on = record(heading("Page", 1), heading("Info", 2), prose("The section explains the next step."))
    off = record(heading("Page", 1), heading("Help", 2), link("Open help"))
    assert features.structured_feature_values(on)["generic_heading_present"] == 1.0
    assert features.structured_feature_values(off)["generic_heading_present"] == 0.0
