"""A lone UTF-16 surrogate in a capture must not crash the scorer (#3614).

The Quickstart job on `en.wikipedia.org/wiki/Main_Page` failed twice at the scorer, after 151 announcements
were read, with `TextEncodeInput must be Union[TextInputSequence, Tuple[InputSequence, InputSequence]]`.
That message reads as "the input is not a string". Measured here, with the shipped encoder's tokenizer: a
`str` holding a lone surrogate raises exactly it, because the Rust side cannot extract such a `str`.

The path is real rather than contrived: NVDA speaks Windows UTF-16, Node's `JSON.stringify` writes a lone
surrogate as the escape `"\\ud83d"`, and Python's `json` reads that back as a `str` that holds it.

Not measured: that the Main Page capture held one. It was discarded with the failed job. What is pinned is the
mechanism and the remedy, and the first test fails without the remedy.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

PYTHON_DIR = Path(__file__).resolve().parents[1] / "python"
sys.path.insert(0, str(PYTHON_DIR))

import score  # noqa: E402
import screenreader_features as features  # noqa: E402

#: Exactly what `JSON.stringify("a \ud83d b")` prints in Node, so the text goes through the real decoder.
LONE_SURROGATE_JSON = '"Main Page \\ud83d link"'
PAIR_JSON = '"Main Page \\ud83d\\ude00 link"'


def capture(announcement: str) -> dict:
    return {"screenReader": score.SUPPORTED_SCREEN_READER, "transcript": [announcement, "heading level 1 Welcome"]}


def every_string(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from every_string(item)
    elif isinstance(value, dict):
        for key, item in value.items():
            yield from every_string(key)
            yield from every_string(item)


def test_a_decoded_lone_surrogate_is_the_shape_that_breaks_the_tokenizer():
    # The positive control for the tests below: the input really is a `str`, and really is unencodable.
    decoded = json.loads(LONE_SURROGATE_JSON)
    assert isinstance(decoded, str)
    with pytest.raises(UnicodeEncodeError):
        decoded.encode("utf-8")


def test_the_record_a_capture_becomes_holds_no_lone_surrogate():
    record = score.raw_capture_record(capture(json.loads(LONE_SURROGATE_JSON)), "main-page")
    strings = list(every_string(record))
    assert strings, "the record carried no strings, so this asserts nothing"
    for text in strings:
        text.encode("utf-8")  # raises on a lone surrogate, which is the tokenizer's refusal
    assert "Main Page � link" in record["input"]["transcript"]
    assert "transcript: Main Page � link" in features.unit_texts(record)


def test_a_properly_paired_surrogate_is_an_emoji_and_is_kept():
    # The remedy must not eat real text: `json` joins an escaped pair into one character, which stays.
    record = score.raw_capture_record(capture(json.loads(PAIR_JSON)), "emoji")
    assert "Main Page \U0001F600 link" in record["input"]["transcript"]


def test_the_unit_still_matches_its_line_after_the_scrub():
    # `candidate_unit_flags` matches a unit back to the transcript by text, so the transcript and the units
    # must be scrubbed the same way or the flag lands on the wrong announcement.
    record = score.raw_capture_record(capture(json.loads(LONE_SURROGATE_JSON)), "main-page")
    transcript = set(record["input"]["transcript"])
    unit_lines = [unit["text"] for unit in record["input"]["evidenceUnits"] if unit["channel"] == "transcript"]
    assert unit_lines and set(unit_lines) <= transcript


def test_the_shipped_tokenizer_accepts_the_scrubbed_record():
    # The end the row names: the real tokenizer, with the same call `_onnx_encode` makes.
    encoder = score.ROOT / "models/encoders/all-MiniLM-L6-v2"
    if not (encoder / "tokenizer.json").exists():
        pytest.skip(f"no encoder fetched at {encoder} (packages/scorer/python/fetch-encoder.py)")
    transformers = pytest.importorskip("transformers")
    tokenizer = transformers.AutoTokenizer.from_pretrained(encoder, local_files_only=True)

    raw = json.loads(LONE_SURROGATE_JSON)
    with pytest.raises(TypeError, match="TextEncodeInput"):
        tokenizer([raw], padding=True, truncation=True, max_length=128, return_tensors="np")

    record = score.raw_capture_record(capture(raw), "main-page")
    tokenizer(features.unit_texts(record), padding=True, truncation=True, max_length=128, return_tensors="np")
