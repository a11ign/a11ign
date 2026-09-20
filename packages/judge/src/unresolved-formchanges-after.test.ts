/**
 * #1105: consumer half of the same Mutation clause the producer half already satisfies.
 *
 * `capture-probes.mjs`'s `activateAndCaptureDelta` sets `afterUnresolved: true` on a `formChanges` entry
 * whenever `after` still reads as NVDA's "unknown" document-title placeholder once its own retry has run --
 * meaning `after` is NOT an announcement the page made, only a not-yet-readable read. Every reader in
 * `judge`/`scorer` that turns `formChanges[].after` into a finding must refuse to when `afterUnresolved` is
 * set, per product-manager's 2026-09-20T08:27:15Z re-laning ruling: "a finding must never be built on it
 * either way" is the half the producer's own `unresolved-document-title.test.ts` does not cover.
 *
 * `grep -rn afterUnresolved packages/ --include='*.ts' --include='*.mjs'` before this PR found only the
 * producer, its tests and the type declaration -- nothing in `judge` or `scorer` read the flag. This file
 * is the positive control for the two readers that do now: `readDisclosurePair` (via `addSilentStateChanges`,
 * asserting 4.1.2:state-change-silent) and `addErrorWithoutRemedy` (3.3.3 Error Suggestion, secondary).
 * Each test's positive control names where it lives -- the sibling test with `afterUnresolved` omitted or
 * `false`, which fires exactly the finding the `afterUnresolved: true` case must not.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ruleFindings } from "./rules.js";

const criteria = (findings: ReturnType<typeof ruleFindings>) => findings.map((f) => f.wcag.split(" ")[0]);

test("#1105 4.1.2:state-change-silent -- a disclosure pair whose `after` is only unresolved is not a finding", () => {
  // POSITIVE CONTROL: the identical same-state pair, `afterUnresolved` absent, IS the finding this rule
  // exists to raise -- proving the fixture shape below would fire if the guard were removed.
  const sameStateResolved = [{ control: "Travel advice, button, collapsed", after: "Travel advice, button, collapsed" }];
  assert.deepEqual(criteria(ruleFindings({ transcript: [], interaction: { stateChanges: sameStateResolved } })), ["4.1.2"]);

  // The same pair, but `after` never resolved -- MUST NOT be read as "announced the same state", because
  // it is not known what the control announced at all.
  const sameStateUnresolved = [
    { control: "Travel advice, button, collapsed", after: "Travel advice, button, collapsed", afterUnresolved: true },
  ];
  assert.deepEqual(ruleFindings({ transcript: [], interaction: { stateChanges: sameStateUnresolved } }), []);
});

test("#1105 3.3.3 Error Suggestion -- an unresolved submit `after` is not read as an unremedied error", () => {
  const postSubmitFields: string[] = [];

  // POSITIVE CONTROL: the identical announcement, `afterUnresolved` absent, DOES fire 3.3.3 -- an
  // announced error with no remedy instruction.
  const resolved = [{ control: "Submit, button", after: "There is an error", kind: "submit" }];
  assert.deepEqual(
    criteria(ruleFindings({ transcript: [], interaction: { formChanges: resolved, postSubmitFields } })),
    ["3.3.3"],
  );

  // The same text, but flagged as NVDA's unresolved-title placeholder having been retried past -- MUST NOT
  // be read as an announced error at all, let alone one lacking a remedy.
  const unresolved = [
    { control: "Submit, button", after: "There is an error", kind: "submit", afterUnresolved: true },
  ];
  assert.deepEqual(
    ruleFindings({ transcript: [], interaction: { formChanges: unresolved, postSubmitFields } }),
    [],
  );
});
