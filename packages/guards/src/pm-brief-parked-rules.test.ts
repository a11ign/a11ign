/**
 * THE PRODUCT-MANAGER BRIEF STATES THE THREE `parked` RULES, and no longer says the thing they replaced (#928, chairman 2026-10-08).
 *
 * Until 2026-10-08 the brief said "A future product line is `parked`, not `needs:chairman`", and #2628 sat parked for twelve days with
 * no condition that anything read. The chairman's three rules are that `parked` REQUIRES a `Waiting-for:` or `Not-before:`, that a
 * condition which is his carries `needs:chairman` and a brief and is never parked alone, and that a satisfied condition un-parks the
 * row. The audit (#4049) and the un-park (#4050) enforce them on the board; this pins that the session whose defect a conditionless row
 * is has been told, in the brief it loads on every wake.
 *
 * The property is read off the brief: the section exists, each rule's sentence is in it, and the superseded sentence is gone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const BRIEF = resolve(import.meta.dirname, "../../../.agent-org/roles/product-manager.md");
const SUPERSEDED = /A future product line is `parked`, not\s+`needs:chairman`/;

const RULES: ReadonlyArray<readonly [string, RegExp]> = [
  ["a parked row needs a Waiting-for or a Not-before", /`parked` REQUIRES a `Waiting-for:` or a `Not-before:`/],
  ["a parked row with no condition is this role's defect", /parked row with no condition is this role's defect/],
  ["the chairman's condition is needs:chairman and a brief, never parked alone", /`needs:chairman` AND a one-message brief[^.]*never `parked` alone/],
  ["a satisfied condition un-parks the row", /satisfied condition un-parks the row/],
];

function missingRules(text: string): string[] {
  return RULES.filter(([, pattern]) => !pattern.test(text)).map(([name]) => name);
}

function statesTheRules(text: string): boolean {
  return missingRules(text).length === 0 && !SUPERSEDED.test(text);
}

const GOOD = [
  "1. **`parked` REQUIRES a `Waiting-for:` or a `Not-before:` line the gate reads.** **A parked row with no condition is this role's defect**",
  "2. **A condition that is the chairman's is `needs:chairman` AND a one-message brief (#3409), never `parked` alone.**",
  "3. **A satisfied condition un-parks the row.**",
].join("\n");

test("positive control: a brief with all three rules and not the superseded sentence is accepted", () => {
  assert.deepEqual(missingRules(GOOD), []);
  assert.equal(statesTheRules(GOOD), true);
});

test("positive control: each rule removed in turn is refused, and names that rule", () => {
  for (const [name, pattern] of RULES) {
    const without = GOOD.split("\n").filter((line) => !pattern.test(line)).join("\n");
    assert.ok(missingRules(without).includes(name), `removing "${name}" must be seen`);
    assert.equal(statesTheRules(without), false);
  }
});

test("positive control: a brief that still carries the superseded sentence is refused even with all three rules", () => {
  const old = `${GOOD}\nA future product line is \`parked\`, not\n\`needs:chairman\`; a row a session could not clear goes to \`ceo\`.`;
  assert.deepEqual(missingRules(old), []);
  assert.equal(statesTheRules(old), false);
});

test("the product-manager brief states the three parked rules and not the sentence they replaced", () => {
  const text = readFileSync(BRIEF, "utf8");
  assert.deepEqual(missingRules(text), []);
  assert.equal(SUPERSEDED.test(text), false, "the brief still says a future product line is parked, not needs:chairman");
});
