/**
 * THE ENGINEER BRIEF ENDS EVERY TURN ON A DECLARED STATE, AND A BRIEF IS PROSE: nothing failed when a word of its three rules was changed
 * (#4488, epic #4437, class `worker-state-ambiguous`; `worker-4202` and `worker-4451` broke the prose rules and no guard noticed).
 *
 *  1. Every turn ends with one `agent-org worker:state` declaration (`waiting-ci <pr>`, `waiting-review <pr>`, `done`, `blocked <row>
 *     <reason>`); an idle worker without a fresh one is stalled, and the gate sends "continue" within minutes.
 *  2. A worker never waits on its own background job across a turn: long work runs in the foreground, or the wait is declared.
 *  3. A worker never asks a question at the prompt: a real one becomes `blocked <row> <reason>` plus `answer:<session>`, otherwise it decides
 *     and records why on the row.
 *
 * Each rule is read as the SENTENCES that carry it, as `role-files-chairman-source-and-haiku-default.test.ts` does, so a rule's facts must sit
 * in one sentence. Positive control: the shipped file passes. Negative controls: each load-bearing word replaced in a copy fails ITS rule, one
 * case per word, and a copy with the whole section removed fails all three, so a detector that stopped looking would turn the file red.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENGINEER = readFileSync(resolve(import.meta.dirname, "../../../.agent-org/roles/engineer.md"), "utf8");

/** Bold markers are removed first: `.**` would otherwise glue a bold lead sentence to the next one. */
function sentences(text: string): string[] {
  return text.replace(/\*\*/g, "").replace(/\s+/g, " ").split(/(?<=[.!?])\s/);
}

const hasSentence = (text: string, ...needles: string[]): boolean => sentences(text).some((s) => needles.every((n) => s.includes(n)));

type Rule = (text: string) => boolean;

/** The command, the four state names, what an undeclared idle worker is, and what the gate does about it. */
const statesDeclaredState: Rule = (text) =>
  hasSentence(text, "Every turn ends with exactly one declaration", "`agent-org worker:state`", "`waiting-ci <pr>`", "`waiting-review <pr>`", "`done`", "`blocked <row> <reason>`") &&
  hasSentence(text, "idle without a fresh one", "treated as stalled", 'the gate sends "continue"', "within minutes");

/** No wait held across a turn, where long work goes instead, and the old "wait for it" sentence gone. */
const forbidsBackgroundWait: Rule = (text) =>
  hasSentence(text, "Never wait on your own background job across a turn") &&
  hasSentence(text, "Long work runs in the foreground", "declare `waiting-ci <pr>`", "a background task is for work inside a turn only", "a wait is declared, never held") &&
  !hasSentence(text, "background job", "wait for it");

/** No question at the prompt, what it becomes, who routes it, the fallback, and the old "message product-manager" advice gone. */
const forbidsQuestionAtPrompt: Rule = (text) =>
  hasSentence(text, "A worker never asks a question at the prompt") &&
  hasSentence(text, "A real question becomes `blocked <row> <reason>`", "`answer:<session>`", "the gate routes it", "you decide and record why on the row") &&
  !hasSentence(text, "genuinely blocks you", "message `product-manager`");

const RULES: Array<[string, Rule]> = [
  ["declared state", statesDeclaredState],
  ["no background wait", forbidsBackgroundWait],
  ["no question at the prompt", forbidsQuestionAtPrompt],
];

test("the shipped engineer.md states all three rules", () => {
  for (const [name, rule] of RULES) assert.ok(rule(ENGINEER), `engineer.md lost the ${name} rule`);
});

test("negative control: the section removed entirely fails all three rules", () => {
  const section = /\n## Every turn ends on a declared state[\s\S]*?(?=\n## )/;
  assert.ok(section.test(ENGINEER), "the section heading moved, so the removal below proves nothing");
  const without = ENGINEER.replace(section, "");
  assert.notEqual(without, ENGINEER);
  for (const [name, rule] of RULES) assert.equal(rule(without), false, `the ${name} rule still reads as stated with its section removed`);
});

/** `[what, shipped words, replacement, the rule that must notice]`: one case per load-bearing word. */
const MUTATIONS: Array<[string, string, string, Rule]> = [
  ["the command", "`agent-org worker:state`", "`agent-org worker:status`", statesDeclaredState],
  ["state waiting-ci", "`waiting-ci <pr>`", "`waiting <pr>`", statesDeclaredState],
  ["state waiting-review", "`waiting-review <pr>`", "`reviewing <pr>`", statesDeclaredState],
  ["state done", "`done`", "`finished`", statesDeclaredState],
  ["state blocked", "`blocked <row> <reason>`", "`blocked`", statesDeclaredState],
  ["every turn", "Every turn ends with exactly one declaration", "Some turns end with a declaration", statesDeclaredState],
  ["stalled", "treated as stalled", "left alone", statesDeclaredState],
  ["continue", 'the gate sends "continue"', "the gate sends nothing", statesDeclaredState],
  ["within minutes", "within minutes", "eventually", statesDeclaredState],
  ["background", "your own background job", "your own foreground job", forbidsBackgroundWait],
  ["across a turn", "background job across a turn", "background job within a turn", forbidsBackgroundWait],
  ["never wait", "Never wait on your own", "You may wait on your own", forbidsBackgroundWait],
  ["foreground", "Long work runs in the foreground", "Long work runs in the background", forbidsBackgroundWait],
  ["inside a turn only", "for work inside a turn only", "for work that outlives a turn", forbidsBackgroundWait],
  ["declared never held", "a wait is declared, never held", "a wait is held, never declared", forbidsBackgroundWait],
  ["never asks", "A worker never asks a question", "A worker may ask a question", forbidsQuestionAtPrompt],
  ["at the prompt", "question at the prompt", "question in a comment", forbidsQuestionAtPrompt],
  ["answer label", "`answer:<session>`", "`needs:<session>`", forbidsQuestionAtPrompt],
  ["gate routes it", "the gate routes it", "nobody routes it", forbidsQuestionAtPrompt],
  ["record why", "decide and record why on the row", "decide and keep it to yourself", forbidsQuestionAtPrompt],
];

test("negative controls: each load-bearing word, replaced in a copy, is detected by its own rule", () => {
  for (const [what, from, to, detects] of MUTATIONS) {
    assert.ok(ENGINEER.includes(from), `the shipped file no longer carries "${from}", so the mutation for ${what} proves nothing`);
    assert.equal(detects(ENGINEER.replaceAll(from, to)), false, `replacing ${what} left its rule reading as stated`);
  }
});

test("negative controls: the superseded sentences, put back, are detected", () => {
  const oldWait = ENGINEER + "\nA turn does not end on a background job it still needs: wait for it, or hand its result to a row, before you stop (`ceo`).\n";
  assert.equal(forbidsBackgroundWait(oldWait), false, "the 'wait for it' sentence came back and the rule still read as stated");
  const oldAdvice = ENGINEER + "\nIf something genuinely blocks you, say so on the row and message `product-manager`, the first reader.\n";
  assert.equal(forbidsQuestionAtPrompt(oldAdvice), false, "the 'message product-manager' advice came back and the rule still read as stated");
});
