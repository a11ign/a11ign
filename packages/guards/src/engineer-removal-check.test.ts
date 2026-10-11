/**
 * THE ENGINEER BRIEF TELLS A WORKER HOW TO WRITE A REMOVAL THE SAFETY CHECK CAN READ (a11ign#4957, sixth class): a multi-line script inline in
 * `bash -c '...'` or `node -e "..."` made Claude Code show "This shell -c script runs rm and could not be checked", and only a person may
 * approve that removal, so the turn stalled until one did.
 *
 *  1. A script longer than one line goes in a file in the session scratchpad, and the worker runs that file, never inline.
 *  2. Never `rm` a variable or a glob target: a literal path, or `"${VAR:?}/name"`.
 *  3. Do not clean the scratchpad: it is per-session and swept.
 *  4. A denial by the built-in safety check is taken: the command is rewritten and the same removal is never retried.
 *
 * Each rule is read as the SENTENCE that carries it, as `engineer-declared-state.test.ts` does, so a rule's facts must sit in one sentence.
 * Positive control: the shipped file passes. Negative controls: each load-bearing word replaced in a copy fails ITS rule, one case per word,
 * and a copy with the whole section removed fails all four, so a detector that stopped looking would turn the file red.
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

/** A long script is a file in the scratchpad that is run, and never a nested-quote one-liner. */
const scriptsInFiles: Rule = (text) =>
  hasSentence(text, "A script longer than one line", "goes in a file in your session scratchpad", "you run that file", "never inline in", "`bash -c '...'`", '`node -e "..."`', "nested quoting");

/** No `rm` on a variable or a glob, and the literal path or the `:?` form in its place. */
const neverRemoveVariable: Rule = (text) => hasSentence(text, "Never `rm` a variable or a glob target", "a literal path", '`"${VAR:?}/name"`');

/** The scratchpad is never cleaned by hand: it is per-session and swept. */
const leaveScratchpad: Rule = (text) => hasSentence(text, "Do not clean the scratchpad", "it is per-session and swept");

/** A denial is taken, the command rewritten, the same removal never retried, and only a person may approve it. */
const retryNeverDenial: Rule = (text) =>
  hasSentence(
    text,
    "If the prompt appears",
    "denied by a built-in Claude Code safety check",
    "take the denial",
    "rewrite the command",
    "never retry the same removal",
    "only a person may approve one",
  );

const RULES: Array<[string, Rule]> = [
  ["scripts in files", scriptsInFiles],
  ["never remove a variable", neverRemoveVariable],
  ["leave the scratchpad", leaveScratchpad],
  ["take the denial", retryNeverDenial],
];

test("the shipped engineer.md states all four rules", () => {
  for (const [name, rule] of RULES) assert.ok(rule(ENGINEER), `engineer.md lost the ${name} rule`);
});

test("negative control: the section removed entirely fails all four rules", () => {
  const section = /\n## Removal commands the safety check cannot read[\s\S]*?(?=\n## )/;
  assert.ok(section.test(ENGINEER), "the section heading moved, so the removal below proves nothing");
  const without = ENGINEER.replace(section, "");
  assert.notEqual(without, ENGINEER);
  for (const [name, rule] of RULES) assert.equal(rule(without), false, `the ${name} rule still reads as stated with its section removed`);
});

/** `[what, shipped words, replacement, the rule that must notice]`: one case per load-bearing word. */
const MUTATIONS: Array<[string, string, string, Rule]> = [
  ["a script longer than one line", "A script longer than one line", "A script longer than ten lines", scriptsInFiles],
  ["the session scratchpad", "in a file in your session scratchpad", "in a file in your working directory", scriptsInFiles],
  ["run that file", "you run that file", "you paste that file", scriptsInFiles],
  ["never inline", "never inline in", "may inline in", scriptsInFiles],
  ["nested quoting", "because nested quoting is what stops", "because length is what stops", scriptsInFiles],
  ["never rm", "Never `rm` a variable", "Sometimes `rm` a variable", neverRemoveVariable],
  ["a literal path", "a literal path", "any path", neverRemoveVariable],
  ["the :? form", '"${VAR:?}/name"', '"${VAR}/name"', neverRemoveVariable],
  ["do not clean", "Do not clean the scratchpad", "Clean the scratchpad", leaveScratchpad],
  ["per-session and swept", "it is per-session and swept", "it is shared and kept", leaveScratchpad],
  ["the denial's wording", "denied by a built-in Claude Code safety check", "denied by the harness", retryNeverDenial],
  ["take the denial", "take the denial", "argue with the denial", retryNeverDenial],
  ["rewrite the command", "rewrite the command", "rerun the command", retryNeverDenial],
  ["never retry", "never retry the same removal", "retry the same removal if it helps", retryNeverDenial],
  ["only a person", "only a person may approve one", "anyone may approve one", retryNeverDenial],
];

test("negative controls: each load-bearing word, replaced in a copy, is detected by its own rule", () => {
  for (const [what, from, to, detects] of MUTATIONS) {
    assert.ok(ENGINEER.includes(from), `the shipped file no longer carries "${from}", so the mutation for ${what} proves nothing`);
    assert.equal(detects(ENGINEER.replaceAll(from, to)), false, `replacing ${what} left its rule reading as stated`);
  }
});
