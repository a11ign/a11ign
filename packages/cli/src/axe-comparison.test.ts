/**
 * `--compare-axe` joins two outputs a run already produces. The risk is not the join but its silences: an a11ign half that never
 * ran must not print as "a11ign added nothing", which is a claim about the page made from a fact about the run.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { RULE_CRITERIA } from "@a11ign/judge/coverage";
import { CRITERION_COVERAGE } from "@a11ign/judge/internal";
import { compareWithAxe, comparisonLines, coverageLine, coverageStatement, type ComparisonInput } from "./axe-comparison.js";

/** 1.4.3 only axe sees, 1.1.1 both see, 2.4.4 only a11ign sees (asserted), 4.1.2 only a11ign refers. */
const BOTH_RAN: ComparisonInput = {
  axe: { ran: true, reported: [
    { wcag: ["1.4.3"], rule: "color-contrast" },
    { wcag: ["1.1.1"], rule: "image-alt" },
    { wcag: ["1.1.1"], rule: "input-image-alt" },
  ] },
  a11ign: { ran: true, reported: [
    { wcag: "1.1.1 Non-text Content", mapping: "conformance" },
    { wcag: "2.4.4 Link Purpose (In Context)", mapping: "conformance" },
    { wcag: "4.1.2 Name, Role, Value" },
    { wcag: "4.1.2 Name, Role, Value", mapping: "secondary" },
  ] },
};

test("one criterion lands in each of the three lists", () => {
  const { lists } = compareWithAxe(BOTH_RAN);
  assert.ok(lists);
  assert.deepEqual(lists.axeOnly, [{ criterion: "1.4.3", axeRules: ["color-contrast"], a11ign: null }]);
  assert.deepEqual(lists.both, [{ criterion: "1.1.1", axeRules: ["image-alt", "input-image-alt"], a11ign: "asserted" }]);
  assert.deepEqual(lists.a11ignOnly.map((l) => [l.criterion, l.a11ign]), [["2.4.4", "asserted"], ["4.1.2", "referred"]]);
});

test("a criterion is listed once however many findings name it, and criteria sort numerically", () => {
  const { lists } = compareWithAxe({
    axe: { ran: true, reported: [{ wcag: ["2.4.4", "10.1.1"], rule: "link-name" }] },
    a11ign: { ran: true, reported: [{ wcag: "2.4.4 x", mapping: "conformance" }, { wcag: "2.4.4 x", mapping: "conformance" }] },
  });
  assert.deepEqual(lists?.both.map((l) => l.criterion), ["2.4.4"]);
  assert.deepEqual(lists?.axeOnly.map((l) => l.criterion), ["10.1.1"]);
});

test("a run where both layers ran and agree prints 'none' under the lists it left empty", () => {
  const text = comparisonLines(compareWithAxe({ axe: { ran: true, reported: [] }, a11ign: { ran: true, reported: [] } })).join("\n");
  assert.match(text, /axe only \(0\)\n {2}none/);
  assert.match(text, /both \(0\)\n {2}none/);
});

// THE POSITIVE CONTROL for the empty case: the a11ign half is absent, the lists are NOT empty arrays, and the text says it did not run.
test("with no screen-reader capture the axe half still prints and the other half says it did not run", () => {
  const comparison = compareWithAxe({
    axe: BOTH_RAN.axe, a11ign: { ran: false, why: "no capture worker answered at http://localhost:8765" },
  });
  assert.equal(comparison.lists, null);
  const text = comparisonLines(comparison).join("\n");
  assert.match(text, /axe-core reported \(2\)/);
  assert.match(text, /1\.4\.3 {2}axe: color-contrast/);
  assert.match(text, /a11ign did not run: no capture worker answered/);
  assert.doesNotMatch(text, /a11ign only/, "an absent half must not print a list of what it added");
  assert.doesNotMatch(text, /none/, "and must not print an empty list as 'nothing added'");
});

test("with axe absent the a11ign findings print and the axe half says it did not run", () => {
  const comparison = compareWithAxe({ axe: { ran: false, why: "its optional dependencies are not installed" }, a11ign: BOTH_RAN.a11ign });
  assert.equal(comparison.lists, null);
  const text = comparisonLines(comparison).join("\n");
  assert.match(text, /a11ign reported \(3\)/);
  assert.match(text, /axe-core did not run: its optional dependencies are not installed/);
});

test("the coverage statement is read off criterion-coverage.ts, and deterministic is a subset of fully assessed", () => {
  const { total, fullyAssessed, deterministic } = coverageStatement();
  assert.equal(total, Object.keys(CRITERION_COVERAGE).length);
  assert.ok(fullyAssessed.length > 0, "positive control: some criterion is fully assessed");
  assert.ok(fullyAssessed.every((c) => CRITERION_COVERAGE[c].status === "assessed"));
  assert.ok(deterministic.length > 0 && deterministic.length <= fullyAssessed.length);
  assert.ok(deterministic.every((c) => fullyAssessed.includes(c) && (RULE_CRITERIA as readonly string[]).includes(c)));
  assert.ok(!fullyAssessed.some((c) => CRITERION_COVERAGE[c].status === "partial"), "a partly covered criterion is not 'fully' assessed");
});

test("the coverage line states both counts and is printed with the lists and without them", () => {
  const { coverage } = compareWithAxe(BOTH_RAN);
  const line = coverageLine(coverage);
  assert.ok(line.includes(`fully assesses ${coverage.fullyAssessed.length} of ${coverage.total}`));
  assert.ok(line.includes(`${coverage.deterministic.length} of them by a deterministic rule`));
  for (const input of [BOTH_RAN, { ...BOTH_RAN, a11ign: { ran: false as const, why: "x" } }]) {
    assert.ok(comparisonLines(compareWithAxe(input)).includes(line));
  }
});
