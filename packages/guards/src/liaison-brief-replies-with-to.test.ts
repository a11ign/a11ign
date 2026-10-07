/**
 * THE LIAISON BRIEF TEACHES `--to`, because a reply that names no message is counted as unanswered (#3955).
 *
 * `messaging:measure` counts a reply to a chairman message only when the reply's `replyTo` is that message's ref, and it does not
 * guess at a reply that names nothing. `chairman:reply` takes the ref as `--to <ref>`. The brief's two worked examples carried none,
 * so the seat copied them and every reply it sent was `replyTo: null`: measured 2026-10-06 on the one real reply the ledger held
 * (message 256, reply 258, 28 seconds, unanswered), which #3431's live window found.
 *
 * The brief is the only place the seat is taught the command, so the property is read off the brief: EVERY example line that starts
 * `agent-org chairman:reply` carries `--to <ref>`, there are at least two of them (an emptied section must not pass), and the
 * button-press case is said, since the order for a button reads `Telegram message: <ref> (a button press)`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const BRIEF = resolve(import.meta.dirname, "../../../.agent-org/roles/liaison.md");
/** The two worked examples (`--dry-run` and the send); fewer means the section was emptied, not that nothing is wrong. */
const MINIMUM_EXAMPLES = 2;

function exampleLines(text: string): string[] {
  return text.split("\n").filter((line) => /^\s*agent-org chairman:reply\b/.test(line));
}

function examplesLackingTo(text: string): string[] {
  return exampleLines(text).filter((line) => !/--to \S+/.test(line));
}

function teachesTo(text: string): boolean {
  return exampleLines(text).length >= MINIMUM_EXAMPLES
    && examplesLackingTo(text).length === 0
    && /a button press/.test(text);
}

const GOOD = [
  'agent-org chairman:reply --dry-run --to 256 "text"',
  'agent-org chairman:reply --to 256 "text"',
  "the order reads `Telegram message: <ref> (a button press)`",
].join("\n");

test("positive control: a brief with --to on both examples and the button-press line is accepted", () => {
  assert.equal(teachesTo(GOOD), true);
});

test("positive control: a brief with one example lacking --to is refused", () => {
  const oneBare = GOOD.replace("--dry-run --to 256", "--dry-run");
  assert.deepEqual(examplesLackingTo(oneBare), ['agent-org chairman:reply --dry-run "text"']);
  assert.equal(teachesTo(oneBare), false);
});

test("positive control: a brief with no example lines at all is refused", () => {
  assert.equal(teachesTo("a button press"), false);
});

test("positive control: a brief without the button-press sentence is refused", () => {
  assert.equal(teachesTo(GOOD.replace("a button press", "a tap")), false);
});

test("the liaison brief shows --to on every chairman:reply example and covers a button press", () => {
  const text = readFileSync(BRIEF, "utf8");
  assert.ok(exampleLines(text).length >= MINIMUM_EXAMPLES, "fewer than two example lines: the section moved or was emptied");
  assert.deepEqual(examplesLackingTo(text), [], "every `agent-org chairman:reply` example must carry `--to <ref>`");
  assert.match(text, /a button press/, "the button-press case must be said");
});
