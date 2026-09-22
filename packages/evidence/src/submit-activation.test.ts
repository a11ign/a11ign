import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isSubmitActivation } from "./submit-activation.js";

// The table `test_validation_error_missing_needs_a_submit.py` also runs against `_is_submit`.
const TABLE = JSON.parse(readFileSync(
  fileURLToPath(new URL("./fixtures/submit-activation-cases.json", import.meta.url)), "utf8"));

test("#1918: isSubmitActivation answers every row of the shared case table", () => {
  const cases = TABLE.cases as Array<{ name: string; change: { kind?: string; submitted?: boolean }; submit: boolean }>;
  assert.ok(cases.some((c) => c.submit) && cases.some((c) => !c.submit),
    "the table must hold both answers, or a predicate that always says one thing passes it");
  const wrong = cases.filter((c) => isSubmitActivation(c.change) !== c.submit).map((c) => c.name);
  assert.deepEqual(wrong, [], "isSubmitActivation disagrees with the shared table on these rows");
});

test("#1918: absent kind is still not a submit here -- only the Python featurizer reads pre-8 absence as one", () => {
  // The featurizer's `kind` default ("submit" when absent) is a protocol-8 back-compat reading of ITS
  // records; the TS consumers never had it (`submitWasProbed` falls back to `postSubmitFields` instead).
  assert.equal(isSubmitActivation({}), false);
  assert.equal(isSubmitActivation(null), false);
});
