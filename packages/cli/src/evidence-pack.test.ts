// The evidence pack is what an assessor pastes from, so its refusals (no conformance claim, no pass for an
// uncovered criterion, no invented quote) are behaviour, pinned against a recorded result.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderEvidencePack, NOT_A_VPAT, type EvidencePackInput } from "./evidence-pack.js";

const FIXTURE = new URL("./fixtures/rehearsal3-34774183433-a11ign-result.json", import.meta.url);
const result = JSON.parse(readFileSync(FIXTURE, "utf8")) as Required<Pick<EvidencePackInput, "transcript" | "outcomes">> & EvidencePackInput;
const pack = renderEvidencePack(result);

const CRITERIA_COUNT = 55;
const CRITERIA_SECTION = "## Criteria";
const NOT_COVERED_SECTION = "## Not covered or not determined";
const tableRows = pack.slice(pack.indexOf(CRITERIA_SECTION), pack.indexOf(NOT_COVERED_SECTION))
  .split("\n").filter((line) => /^\| \d/.test(line));
const notCovered = pack.slice(pack.indexOf(NOT_COVERED_SECTION));
const cellsOf = (row: string) => row.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim());

test("the fixture is the population the other tests claim: 55 criteria, with untested ones among them", () => {
  assert.equal(result.outcomes.length, CRITERIA_COUNT);
  for (const num of ["2.5.7", "3.2.6", "3.3.7", "3.3.8"]) {
    assert.equal(result.outcomes.find((o) => o.criterion === num)?.outcome, "untested", num);
  }
});

test("every outcome criterion appears in the table exactly once", () => {
  assert.equal(tableRows.length, CRITERIA_COUNT);
  const numbers = tableRows.map((row) => cellsOf(row)[0]!.split(" ")[0]);
  assert.deepEqual(numbers, result.outcomes.map((o) => o.criterion));
});

test("every untested and cantTell criterion is under 'Not covered', and no passing row is one of them", () => {
  const uncovered = result.outcomes.filter((o) => o.outcome === "untested" || o.outcome === "cantTell");
  assert.ok(uncovered.length > 0, "positive control: the fixture has uncovered criteria");
  for (const o of uncovered) assert.ok(notCovered.includes(`**${o.criterion} `), `${o.criterion} missing from the section`);
  const passingRows = tableRows.filter((row) => cellsOf(row)[1] === "passed");
  assert.equal(passingRows.length, result.outcomes.filter((o) => o.outcome === "passed").length);
  for (const o of uncovered) assert.ok(!passingRows.some((row) => row.startsWith(`| ${o.criterion} `)), o.criterion);
});

test("removing the section is noticed: the control for the check above", () => {
  const without = pack.slice(0, pack.indexOf(NOT_COVERED_SECTION));
  assert.ok(!without.includes("**3.3.8 "), "3.3.8 must appear only in the section, so dropping it drops the criterion");
});

test("the WCAG 2.2 additions that were not covered are named as new in 2.2", () => {
  for (const num of ["2.5.7", "3.2.6", "3.3.7", "3.3.8"]) assert.match(notCovered, new RegExp(`\\*\\*${num} [^\\n]*\\(new in WCAG 2\\.2\\)`));
});

test("every quoted announcement is a substring of the transcript, and there are some", () => {
  const transcript = result.transcript.join("\n");
  const quotes = tableRows.flatMap((row) => [...(cellsOf(row)[3] ?? "").matchAll(/“([^”]*)”/g)].map((m) => m[1]!));
  assert.ok(quotes.length > 0, "positive control: the table quotes something");
  for (const quote of quotes) {
    const original = quote.replace(/\\\|/g, "|").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    assert.ok(transcript.includes(original), `fabricated quote: ${original}`);
  }
});

test("a fabricated quote would fail the substring check", () => {
  assert.ok(!result.transcript.join("\n").includes("a line NVDA never spoke"));
});

test("the header says what the document is not, and the page, date, version and screen reader", () => {
  assert.ok(pack.includes(NOT_A_VPAT));
  assert.match(pack, /\*\*Page:\*\* https:\/\/www\.w3\.org\/WAI/);
  assert.match(pack, /\*\*Date measured:\*\* 2026-09-13/);
  assert.match(pack, /\*\*a11ign version:\*\* \S+/);
  assert.match(pack, /\*\*Screen reader:\*\* NVDA 2026\.1\.1/);
});

test("the output makes no conformance claim in any wording", () => {
  for (const phrase of ["conforms", "is compliant", "passes WCAG"]) assert.ok(!pack.toLowerCase().includes(phrase.toLowerCase()), phrase);
});

test("a result with no outcomes renders a header and empty sections, never a fabricated row", () => {
  const bare = renderEvidencePack({ url: "https://example.com" });
  assert.ok(!/^\| \d/m.test(bare));
  assert.ok(bare.includes(NOT_A_VPAT));
  assert.match(bare, /Date measured:\*\* not recorded/);
});

test("a pipe or angle bracket in an announcement cannot break the table or open markup", () => {
  const out = renderEvidencePack({
    transcript: ["link, a|b <i>x</i>"],
    outcomes: [{ criterion: "2.4.4", outcome: "cantTell", reason: "r" }],
  });
  const row = out.split("\n").find((line) => line.startsWith("| 2.4.4"))!;
  assert.equal(cellsOf(row).length, 4);
  assert.ok(!row.includes("<i>"));
});

test("the rendered example in docs/evidence-pack.md is what the renderer prints for the fixture", () => {
  const doc = readFileSync(new URL("../../../docs/evidence-pack.md", import.meta.url), "utf8");
  const example = doc.split("````markdown\n")[1]!.split("\n````")[0]!.split("\n");
  const printed = new Set(pack.split("\n"));
  const ELISION = /^(\| … \| … \| … \| … \||- …)$/;
  const stale = example.filter((line) => !ELISION.test(line) && !printed.has(line));
  assert.deepEqual(stale, []);
  assert.ok(example.length > 20, "positive control: the example block was found");
});
