---
"@a11ign/scorer": patch
---

**The scorer's Python runtime now pins `transformers==5.20.1` and `huggingface-hub==2.3.0`, where it pinned 4.57.6 and 0.36.2 (A11-262).** Reinstall from `requirements.txt` to pick them up. The hub pin moves because transformers 5.20.1 requires `huggingface-hub>=1.31.0,<3.0`, so 0.36.2 can no longer be installed beside it. Scores do not change: on one annotated capture, `score.py`'s whole output (49 scores) was identical under the old and new pins on the ONNX path and on the torch fallback, and the embeddings of seven test strings were bit-identical on both paths. `export-encoder-onnx.py`, the offline tool that rebuilds the ONNX encoder, had stopped working under transformers 5 ("got multiple values for argument 'use_cache'") and works again. Its export now has one output, `last_hidden_state`, the same as the ONNX encoder the scorer fetches.
