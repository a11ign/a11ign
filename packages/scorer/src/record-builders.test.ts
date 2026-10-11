/**
 * THE LIVE SCORER'S RECORD BUILDER MUST EMIT `observation` BESIDE `input`.
 *
 * `observation` is a sibling of `input` carrying which questions the capture actually put, and the
 * featurizer crosses two channels with it. Its failure mode is the worst kind: **absent and `asked: false`
 * are the same row by design**, so a builder that never learned about the field produces records that are
 * structurally valid, featurize cleanly, and quietly say "nobody looked" about every capture it made.
 *
 * `score.py` is the PRODUCT path. It SELECTS keys, so a live capture would have reached the model with
 * both crossed columns at zero while every corpus record carried signal: the head fed a row it never
 * saw in training. Its own comment records the identical miss for `parsed`, which broke the abstention
 * sweep, and calls it "the model-input contract existing in a fifth place".
 *
 * There were four builders and three of them are the lab's: the corpus export, the realism tier and the
 * multi-defect composer. They are `a11ign/lab`'s `src/product-checks/record-builders.test.ts` (ADR 0045
 * cut 2, #5080), which discovers them in its own tree. This file keeps the one this repository owns, so a
 * lab that is absent cannot make it pass by finding nothing: the file is named and read, never discovered.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SCORE_PY = resolve(import.meta.dirname, "../python/score.py");

test("the live scorer builds a training record, and sets `observation` beside `input`", () => {
  const text = readFileSync(SCORE_PY, "utf8");
  // The record's own shape, not a parameter named `input`: the key paired with `target`, which every
  // training record carries and nothing else here does. A reader that stops matching must fail loud.
  assert.match(text, /(^|\s)("input"|input):/m, "score.py no longer emits an `input` key: this test is reading the wrong file or shape");
  assert.match(text, /(^|\s)("target"|target):\s*\{/m, "score.py no longer pairs `input` with a `target`: this test is reading the wrong shape");
  assert.match(text, /(^|\s)("observation"|observation):/m,
    "score.py builds a training record and never sets `observation`. Absent and `asked: false` are the SAME row for the "
    + "featurizer, so such a record says 'nobody looked' about every capture and nothing downstream can tell that from the truth.");
});
