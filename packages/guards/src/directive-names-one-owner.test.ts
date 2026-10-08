/**
 * A CHAIRMAN DIRECTION NAMES ONE OWNER AND IS RELAYED AS A POINTER TO ONE ROW (#4067, #4055 move 4).
 *
 * `ceo` used to relay a direction as typed orders to several managers, and each copy was a wake. #4055 is the first direction written the
 * other way: one row, one owner, and the other managers learn of it from the row's title at their next wake. A rule in a brief is not
 * kept by being said, so this holds both halves: the check `directiveFailures` (a pure function over a relayed order and the row body it
 * points to) and the pin that the brief `ceo` loads states the rule, with its reason, in the section about the chairman's chat.
 *
 * The check does not read GitHub: it is handed the two texts, which is what lets every failing case below be a fixture with a reason and
 * a twin that turns it green.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const BRIEF = resolve(import.meta.dirname, "../../../.agent-org/roles/ceo.md");

const ROW_REFERENCE = /#(\d+)\b/g;
// "ONE owner: `ceo`" as #4055 opens, or "Owner: `ceo`"; the run of backticked sessions after it is the owner list.
const OWNER_STATEMENT = /\b(?:ONE owner|Owners?):?\s+((?:(?:,|and|&|\+|\/)?\s*`[^`]+`\s*)+)/g;

function distinct(values: Iterable<string>): string[] {
  return [...new Set(values)];
}

function citedRows(order: string): string[] {
  return distinct([...order.matchAll(ROW_REFERENCE)].map((match) => match[1]));
}

function statedOwners(rowBody: string): string[] {
  const names = [...rowBody.matchAll(OWNER_STATEMENT)].flatMap((statement) =>
    [...statement[1].matchAll(/`([^`]+)`/g)].map((name) => name[1]),
  );
  return distinct(names);
}

/** Why a relayed order is not a pointer to one row naming one owner; empty when it is. */
function directiveFailures(order: string, rowBody: string): string[] {
  const rows = citedRows(order);
  const owners = statedOwners(rowBody);
  const failures: string[] = [];
  if (rows.length === 0) failures.push("the order cites no #<row>");
  if (rows.length > 1) failures.push(`the order cites ${rows.length} rows (${rows.map((row) => `#${row}`).join(", ")}), not one`);
  if (owners.length === 0) failures.push("the row states no owner");
  if (owners.length > 1) failures.push(`the row names ${owners.length} owners (${owners.join(", ")}), not one`);
  return failures;
}

// The opening of #4055 as filed, 2026-10-08: the first direction written as one row with one owner.
const ROW_4055 =
  "**Chairman's direction, 2026-10-08. ONE owner: `ceo`.** This row is the single written directive for the next round of token " +
  "efficiency. It replaces separate relayed messages, per recommendation 4 below. The full research report follows; every " +
  "recommendation is tied to our own measured trace data and cites its source.";
const POINTER_LINES = 3;
const POINTER = [
  "Chairman direction: token efficiency, #4055.",
  "You are the owner; the decision, done-when and where to report are in the row.",
  "Nothing else is sent; read the row.",
].join("\n");
const ROW_TWO_OWNERS = ROW_4055.replace("ONE owner: `ceo`", "Owners: `ceo` and `product-manager`");
const ORDER_TWO_ROWS = POINTER.replace("#4055.", "#4055 and #4067.");
const ORDER_NO_ROW = POINTER.replace(", #4055.", ".");

test("positive control: the opening of #4055 and a three-line pointer to it pass", () => {
  assert.deepEqual(directiveFailures(POINTER, ROW_4055), []);
  assert.deepEqual(statedOwners(ROW_4055), ["ceo"]);
  assert.equal(POINTER.split("\n").length, POINTER_LINES);
});

test("negative control: an order citing two rows fails with its reason, and citing one again turns it green", () => {
  assert.deepEqual(directiveFailures(ORDER_TWO_ROWS, ROW_4055), ["the order cites 2 rows (#4055, #4067), not one"]);
  assert.deepEqual(directiveFailures(ORDER_TWO_ROWS.replace(" and #4067", ""), ROW_4055), []);
});

test("negative control: an order citing the same row twice still cites one", () => {
  assert.deepEqual(directiveFailures(`${POINTER}\nSee #4055.`, ROW_4055), []);
});

test("negative control: an order citing no row fails with its reason, and naming the row turns it green", () => {
  assert.deepEqual(directiveFailures(ORDER_NO_ROW, ROW_4055), ["the order cites no #<row>"]);
  assert.deepEqual(directiveFailures(`${ORDER_NO_ROW} Row #4055.`, ROW_4055), []);
});

test("negative control: a row naming two owners fails with its reason, and naming one turns it green", () => {
  assert.deepEqual(directiveFailures(POINTER, ROW_TWO_OWNERS), ["the row names 2 owners (ceo, product-manager), not one"]);
  assert.deepEqual(directiveFailures(POINTER, ROW_TWO_OWNERS.replace(" and `product-manager`", "")), []);
});

test("negative control: a row stating no owner fails with its reason, and stating one turns it green", () => {
  const unowned = ROW_4055.replace("ONE owner: `ceo`", "for the next round");
  assert.deepEqual(directiveFailures(POINTER, unowned), ["the row states no owner"]);
  assert.deepEqual(directiveFailures(POINTER, `${unowned} ONE owner \`ceo\`.`), []);
});

// ── the brief states the rule ───────────────────────────────────────────────────────────────────────────────────────────────────────

const SECTION_HEADING = "## The chairman's chat reaches you through the `liaison`";
const RULE_PARTS: ReadonlyArray<readonly [string, RegExp]> = [
  ["written once, as a row", /chairman direction is relayed once, as a row/],
  ["the row states exactly one owner session", /states exactly one owner session/],
  ["the only order is a three-line pointer to the owner alone", /three-line\s+pointer to that row, to the owner alone/],
  ["other managers read the row's title at their next wake", /any other manager reads the row's title at its next wake/],
  ["a direction with two owners or none is not relayed", /names two\s+owners, or none, is not relayed until it names one/],
  ["a reason sentence", /The reason is [^.]+\./],
];
const CAPITAL_RUN = 5;

function chairmanChatSection(brief: string): string {
  const start = brief.indexOf(SECTION_HEADING);
  if (start === -1) return "";
  const next = brief.indexOf("\n## ", start + 1);
  return brief.slice(start, next === -1 ? undefined : next);
}

function ruleFiveText(brief: string): string {
  const section = chairmanChatSection(brief);
  const start = section.search(/^5\. /m);
  if (start === -1) return "";
  const end = section.indexOf("\n\n", start);
  return section.slice(start, end === -1 ? undefined : end);
}

function missingParts(brief: string): string[] {
  const rule = ruleFiveText(brief);
  return RULE_PARTS.filter(([, pattern]) => !pattern.test(rule)).map(([name]) => name);
}

function isCapitalWord(token: string): boolean {
  const letters = token.replace(/[^A-Za-z]/g, "");
  return letters.length > 0 && letters === letters.toUpperCase();
}

function longestCapitalRun(text: string): number {
  let longest = 0;
  let run = 0;
  for (const token of text.split(/\s+/).filter((word) => /[A-Za-z]/.test(word))) {
    run = isCapitalWord(token) ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return longest;
}

function statesTheRule(brief: string): boolean {
  return missingParts(brief).length === 0 && longestCapitalRun(ruleFiveText(brief)) < CAPITAL_RUN;
}

const GOOD_BRIEF = [
  `${SECTION_HEADING}, and five rules decide what you do with it`,
  "",
  "4. **A reply to the chairman goes through `chairman:reply`.**",
  "5. **A chairman direction is relayed once, as a row, and the order is a pointer to it.** The direction is written as a row that",
  "   states exactly one owner session, the decision, its done-when and the place progress is reported; the only order sent is a",
  "   three-line pointer to that row, to the owner alone, and any other manager reads the row's title at its next wake. A direction that",
  "   names two owners, or none, is not relayed until it names one. The reason is cost: each copy of a direction is a wake.",
  "",
  "## The next section",
].join("\n");

test("positive control: a brief with the rule in the chairman-chat section is accepted", () => {
  assert.deepEqual(missingParts(GOOD_BRIEF), []);
  assert.equal(statesTheRule(GOOD_BRIEF), true);
});

test("negative control: each part of the rule removed in turn is refused, and names that part", () => {
  for (const [name, pattern] of RULE_PARTS) {
    const without = GOOD_BRIEF.replace(pattern, "");
    const rule = ruleFiveText(without);
    assert.equal(pattern.test(rule), false, `fixture failed to remove "${name}"`);
    assert.ok(missingParts(without).includes(name), `removing "${name}" must be seen`);
    assert.equal(statesTheRule(without), false);
  }
});

test("negative control: the rule placed outside the chairman-chat section is not found", () => {
  const rule = ruleFiveText(GOOD_BRIEF);
  const moved = `${GOOD_BRIEF.replace(rule, "")}\n\n${rule}`;
  assert.equal(ruleFiveText(moved), "");
  assert.equal(statesTheRule(moved), false);
});

test("negative control: the rule written as a block of capitals is refused, and in lower case is accepted", () => {
  const shouting = GOOD_BRIEF.replace("is relayed once, as a row", "IS RELAYED ONCE AS A ROW ONLY");
  assert.ok(longestCapitalRun(shouting) >= CAPITAL_RUN);
  assert.equal(longestCapitalRun(GOOD_BRIEF) < CAPITAL_RUN, true);
});

test("negative control: four capitalised words in a row are tolerated and five are not", () => {
  assert.equal(longestCapitalRun("one TWO THREE FOUR FIVE six"), CAPITAL_RUN - 1);
  assert.equal(longestCapitalRun("one TWO THREE FOUR FIVE SIX seven"), CAPITAL_RUN);
});

test("the brief ceo loads states the one-owner directive rule, with its reason, in the chairman-chat section", () => {
  const brief = readFileSync(BRIEF, "utf8");
  assert.notEqual(chairmanChatSection(brief), "", "the section the rule belongs in was not found");
  assert.notEqual(ruleFiveText(brief), "", "the section carries no numbered rule 5");
  assert.deepEqual(missingParts(brief), []);
  assert.ok(longestCapitalRun(ruleFiveText(brief)) < CAPITAL_RUN, "the rule is written as a block of capitals");
  assert.match(chairmanChatSection(brief), /five rules decide what you do with it/);
});
