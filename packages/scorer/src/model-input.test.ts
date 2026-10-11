/**
 * The model's input is built in ONE place, and every record-producing path uses it.
 *
 * It was built twice — once for corpus records in `export-screenreader-dataset.mjs`, once for real-page
 * records in `build-realism-tier.mjs` — with nothing relating the copies. The moment the contract gained a
 * field (`parsed`, so the featurizer stops re-deriving NVDA's grammar in Python), wiring three callers still
 * missed the fourth, and training died on a real-page record.
 *
 * That failure was LOUD, which was luck plus a deliberate refusal to fall back. The same drift in a field
 * the featurizer merely reads as zero would have trained a model on real pages that silently lacked it —
 * and a difference that exists only on real-page records is a shortcut a linear head can use, which
 * `evidence-units.ts`'s own header records happening once already with channel names.
 *
 * So: one builder, and a test that the builder produces the whole contract rather than a subset.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { modelInput } from "./evidence-units.js";

const CAPTURE = {
  screenReader: "NVDA",
  transcript: ["heading, level 1, Booking", "link, Check availability"],
  structure: {
    headings: ["Booking, heading, level 1"],
    formFields: ["Departure date, edit"],
    links: ["Check availability, link"],
    graphics: [], tableCells: [], landmarks: [], lists: [],
  },
  interaction: { controls: [], stateChanges: [], formChanges: [], postSubmitFields: [] },
};

test("the input carries the parse, which the featurizer now requires", () => {
  const input = modelInput(CAPTURE as never) as { parsed?: Record<string, unknown[]> };
  assert.ok(input.parsed, "no `parsed` block: the Python featurizer refuses this record outright");
  assert.ok(Array.isArray(input.parsed.formFields));
  assert.equal((input.parsed.formFields[0] as { objects: { name: string }[] }).objects[0].name,
    "Departure date", "the sweep channel is name-first; parsing it role-first loses the name");
});

test("the transcript is parsed role-first and the sweep name-first, in the same record", () => {
  // The two channels carry OPPOSITE orders — 884/0 and 0/880 across 300 captures. A builder that passed one
  // channel constant for both would silently mis-parse half of every record.
  const input = modelInput(CAPTURE as never) as { parsed: Record<string, { objects: { name: string }[] }[]> };
  assert.equal(input.parsed.transcript[1].objects[0].name, "Check availability");
  assert.equal(input.parsed.links[0].objects[0].name, "Check availability");
});

test("the contract keeps everything the featurizer and the dataset already read", () => {
  const input = modelInput(CAPTURE as never) as Record<string, unknown>;
  for (const key of ["screenReader", "transcript", "structure", "interaction", "evidenceUnits",
    "evidenceText", "parsed"]) {
    assert.ok(key in input, `${key} vanished from the model input contract`);
  }
});

// NOBODY builds the model's input except this module -- the scan of the two lab builders (`export-screenreader-dataset` and `build-realism-tier`)
// for a hand-assembled `evidenceUnits:` is `a11ign/lab`'s `src/product-checks/model-input-builders.test.ts` (ADR 0045 cut 2, #5080): it read the lab's
// scripts by a relative path, which a repository does not do to another's source.
