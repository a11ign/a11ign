/**
 * THE CEO BRIEF SAYS A `paused` NUMBER IS NOT A CLASS TO FILE A ROW FOR, in the daily-retrospective section and only there (agent-org#1429).
 *
 * agent-org's retrospective order carries that sentence after the class-fix instruction, but the ceo's role text lives in this repository,
 * where an agent-org pull request cannot change it. A `paused` verdict is the Claude allowance's pause, not an org defect, so the ceo must
 * read it as such before it files anything. The sentence is pinned in the section that governs the retrospective and nowhere else: a copy
 * in another section would not be read by the session the retrospective is for.
 *
 * The property is read off the role file: the section exists, carries the sentence, and the sentence appears exactly once in the file.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CEO = resolve(import.meta.dirname, "../../../.agent-org/roles/ceo.md");
const HEADING = "## The daily retrospective";
const PAUSED_RULE = /A number whose verdict reads `paused` is NOT a class to file a row for/;

/** A markdown section: its heading line to the next `## ` heading. Null when the heading is absent. */
function section(markdown: string, heading: string): string | null {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.startsWith(heading));
  if (start < 0) return null;
  const next = lines.findIndex((line, i) => i > start && line.startsWith("## "));
  return lines.slice(start, next < 0 ? undefined : next).join("\n");
}

function statesPausedRule(markdown: string): boolean {
  const body = section(markdown, HEADING);
  const copies = markdown.split("\n").filter((line) => PAUSED_RULE.test(line)).length;
  return body !== null && PAUSED_RULE.test(body) && copies === 1;
}

const PAUSED_LINE = "- **A number whose verdict reads `paused` is NOT a class to file a row for: the Claude allowance was paused, so no org defect caused it.**";

const GOOD = [
  "## Who it talks to",
  "- **Someone else.**",
  "",
  "## The daily retrospective — a scheduled duty",
  "- **For each number worse than yesterday's, file a row.**",
  PAUSED_LINE,
  "- **The report now carries yesterday.**",
  "",
  "## Where state lives",
  "- **State is in the row.**",
].join("\n");

const BAD = GOOD.split("\n").filter((line) => !PAUSED_RULE.test(line)).join("\n");

test("positive control: the sentence in the daily-retrospective section, and only there, is accepted", () => {
  assert.equal(statesPausedRule(GOOD), true);
});

test("positive control: the same section without the sentence is refused", () => {
  assert.equal(PAUSED_RULE.test(BAD), false);
  assert.equal(statesPausedRule(BAD), false);
});

test("positive control: the sentence in ANOTHER section, with the retrospective section lacking it, is refused", () => {
  const elsewhere = `${BAD}\n${PAUSED_LINE}`;
  assert.equal(PAUSED_RULE.test(elsewhere), true, "the copy is in the file");
  assert.equal(statesPausedRule(elsewhere), false);
});

test("positive control: a file with no daily-retrospective heading is refused, not read as passing", () => {
  assert.equal(section(GOOD.replace(HEADING, "## Something else"), HEADING), null);
  assert.equal(statesPausedRule(GOOD.replace(HEADING, "## Something else")), false);
});

test("ceo.md states the paused-number rule in the daily-retrospective section, and only there", () => {
  assert.equal(statesPausedRule(readFileSync(CEO, "utf8")), true);
});
