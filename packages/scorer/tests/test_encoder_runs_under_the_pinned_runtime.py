"""The pinned runtime still installs together, still encodes, and the exporter still traces (A11-262).

transformers 4.57.6 -> 5.20.1 is a major, and it broke two things nothing else here would have caught:

- `huggingface-hub==0.36.2` cannot be installed beside it (5.20.1 declares `>=1.31.0,<3.0`). CI never
  installs `requirements.txt` -- `requirements-ci.txt` is the subset the suite imports -- so the
  Dependabot pull request's `python` job was green on a file pip refuses to resolve.
- `export-encoder-onnx.py` raised "got multiple values for argument 'use_cache'" (see `export_onnx`).

The first test runs everywhere, and guards the exact pins rather than any one version of them. The rest are LAB ONLY: they need torch, transformers and onnxruntime, and
the encode test a fetched encoder (`packages/scorer/python/fetch-encoder.py`). They skip honestly
elsewhere; the pull request's acceptance block installs the full runtime so that they run.
"""
from __future__ import annotations

import importlib.metadata
import importlib.util
import re
import sys
from pathlib import Path

import numpy as np
import pytest

SCORER = Path(__file__).resolve().parents[1]
REQUIREMENTS = SCORER / "requirements.txt"
ENCODER = SCORER / "models" / "encoders" / "all-MiniLM-L6-v2"
sys.path.insert(0, str(SCORER / "python"))

#: The exporter's own tolerance: float32 rounding, where a real regression moves cosine in the third decimal.
MAX_ABS_DIFF = 1e-5
EMBEDDING_WIDTH = 384
REQUIREMENT_LINE = re.compile(r"^(?P<name>[A-Za-z0-9_.-]+)\s*(?P<constraint>.*)$")


def requirements() -> dict[str, str]:
    """Package name -> its constraint string, comments and blank lines dropped."""
    lines = (line.split("#", 1)[0].strip() for line in REQUIREMENTS.read_text(encoding="utf-8").splitlines())
    return {match["name"].lower(): match["constraint"].strip()
            for match in map(REQUIREMENT_LINE.match, filter(None, lines))}


def test_every_versioned_line_is_an_exact_pin():
    # No version is named here: Dependabot's patch and minor updates merge themselves when green (A11-251).
    versioned = {name: constraint for name, constraint in requirements().items() if constraint}
    assert "huggingface-hub" in versioned, "the positive control: the line this test exists for is read"
    loose = {name: constraint for name, constraint in versioned.items() if not re.fullmatch(r"==[\w.]+", constraint)}
    assert loose == {}, f"publish blocker B2: these pins are not exact: {loose}"


def test_the_huggingface_hub_pin_is_inside_the_range_the_pinned_transformers_declares():
    pytest.importorskip("transformers")
    from packaging.requirements import Requirement

    pins = requirements()
    installed = importlib.metadata.version("transformers")
    if pins["transformers"] != f"=={installed}":
        pytest.skip(f"transformers {installed} is installed, not the pinned {pins['transformers']}, so its "
                    "declared range is not the pinned one's")
    declared = [requirement for requirement in map(Requirement, importlib.metadata.requires("transformers"))
                if requirement.name == "huggingface-hub" and requirement.marker is None]
    assert len(declared) == 1, f"transformers {installed} declares no unconditional huggingface-hub requirement"
    hub = pins["huggingface-hub"].removeprefix("==")
    assert declared[0].specifier.contains(hub), \
        f"huggingface-hub=={hub} is outside transformers {installed}'s declared {declared[0].specifier}"


def test_both_encode_paths_return_a_384_d_float32_embedding(tmp_path):
    for module in ("onnxruntime", "torch", "transformers"):
        pytest.importorskip(module)
    if not (ENCODER / "onnx" / "model.onnx").exists():
        pytest.skip(f"no encoder fetched at {ENCODER} (packages/scorer/python/fetch-encoder.py)")
    import screenreader_features as features

    # `_onnx_encode` falls back to torch when, and only when, the encoder directory has no ONNX file.
    onnxless = tmp_path / "encoder"
    onnxless.mkdir()
    for entry in ENCODER.iterdir():
        if entry.name != "onnx":
            (onnxless / entry.name).symlink_to(entry)

    texts = ["heading, level 2, Welcome", "Travel advice, button, collapsed", "edit, Example value"]
    by_onnx = features._onnx_encode(texts, ENCODER, 256)
    by_torch = features._onnx_encode(texts, onnxless, 256)

    for embedding in (by_onnx, by_torch):
        assert embedding.shape == (len(texts), EMBEDDING_WIDTH)
        assert embedding.dtype == np.float32
    assert float(np.abs(by_onnx - by_torch).max()) < MAX_ABS_DIFF


def load_exporter():
    path = SCORER / "python" / "export-encoder-onnx.py"
    spec = importlib.util.spec_from_file_location("export_encoder_onnx", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_the_exporter_traces_a_bert_encoder_and_ort_reproduces_its_hidden_state(tmp_path):
    # A tiny RANDOM BERT, not the fetched encoder: the failure was in tracing BertModel's forward under
    # transformers 5, which needs the architecture and not the weights -- so this needs no download.
    for module in ("onnx", "onnxruntime", "torch", "transformers"):
        pytest.importorskip(module)
    import onnxruntime as ort
    import torch
    from transformers import BertConfig, BertModel

    torch.manual_seed(0)
    model = BertModel(BertConfig(vocab_size=64, hidden_size=32, num_hidden_layers=1,
                                 num_attention_heads=2, intermediate_size=37)).eval()
    batch = {
        "input_ids": torch.tensor([[2, 5, 9, 3], [2, 7, 3, 0]]),
        "attention_mask": torch.tensor([[1, 1, 1, 1], [1, 1, 1, 0]]),
        "token_type_ids": torch.zeros(2, 4, dtype=torch.long),
    }
    output = tmp_path / "encoder.onnx"

    load_exporter().export_onnx(model, batch, output)

    session = ort.InferenceSession(str(output), providers=["CPUExecutionProvider"])
    assert [spec.name for spec in session.get_outputs()] == ["last_hidden_state"]
    exported = session.run(None, {name: tensor.numpy() for name, tensor in batch.items()})[0]
    with torch.no_grad():
        reference = model(**batch).last_hidden_state.numpy()
    assert float(np.abs(reference - exported).max()) < MAX_ABS_DIFF
