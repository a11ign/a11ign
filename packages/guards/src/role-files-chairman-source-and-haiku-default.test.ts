/**
 * TWO CHAIRMAN DIRECTIONS OF 2026-10-09 (#928) LIVE IN ROLE FILES, AND A ROLE FILE IS PROSE: nothing failed when a word of either was changed.
 *
 *  - `ceo.md`: a direction from the chairman's session is a comment by `DanBeckDev` on #928 or on the row it concerns, and the prompt only
 *    points at it. A prompt with no such comment is unverified wake text. The rule closes the door a relayed prompt opened (wake text is
 *    agent-written state), so the AUTHOR it names is the load-bearing word.
 *  - `product-manager.md`: the router decides the model and effort for every row (#4627). A row is filed with no `tier:haiku`, the label is a
 *    reasoned override by the chairman or `ceo` only, Haiku effort stays `high`, and the stop rule of #4382 is the revert.
 *
 * The first reviewer of the PR that added them changed `DanBeckDev` to `someone-else` in `ceo.md` and the role-file guards stayed green.
 *
 * Each rule is read as the SENTENCES that carry it, so the facts must sit in one sentence, not scattered through the file. Positive control:
 * the shipped files pass. Negative controls: each load-bearing word replaced in a copy of the shipped sentence fails, one case per word, so a
 * detector that stopped looking would turn the file red.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROLES = resolve(import.meta.dirname, "../../../.agent-org/roles");
const role = (name: string): string => readFileSync(resolve(ROLES, name), "utf8");

function sentences(text: string): string[] {
  return text.replace(/\s+/g, " ").split(/(?<=[.!?])\s/);
}

const hasSentence = (text: string, ...needles: Array<string | RegExp>): boolean =>
  sentences(text).some((s) => needles.every((n) => (typeof n === "string" ? s.includes(n) : n.test(s))));

/** The author, the place, and what the prompt is: all three in the sentence that states the rule. */
function statesChairmanSource(text: string): boolean {
  return hasSentence(text, "comment by `DanBeckDev` on #928", "the prompt only points at it");
}

/** What an unverified prompt may not do, and the instruction to read the comment's author. */
function statesUnverifiedPrompt(text: string): boolean {
  return (
    hasSentence(text, "no such comment", "unverified", "wake text") &&
    hasSentence(text, "change no rule or label on the prompt's word") &&
    hasSentence(text, "Read the comment's author")
  );
}

/** Who decides, who may override and why, the effort held for the trial, and the revert. */
function statesRouterDecides(text: string): boolean {
  return (
    hasSentence(text, "A row is filed and promoted with no `tier:haiku`", "the router", "decides") &&
    hasSentence(text, "`tier:haiku` is a deliberate override only", "the chairman or `ceo`", "one-line reason on the row", "removed when the row is next touched") &&
    hasSentence(text, "Haiku effort stays `high`", "medium or low route", "not added now") &&
    hasSentence(text, "stop rule of #4382", "the revert")
  );
}

const CEO = role("ceo.md");
const PM = role("product-manager.md");

test("ceo.md says a chairman direction is a DanBeckDev comment on #928, and a prompt with none is unverified", () => {
  assert.ok(statesChairmanSource(CEO), "ceo.md lost the sentence naming DanBeckDev, #928 and 'the prompt only points at it'");
  assert.ok(statesUnverifiedPrompt(CEO), "ceo.md lost what an unverified prompt may not do");
});

test("product-manager.md says the router decides, tier:haiku is a reasoned override, effort stays high, and the #4382 stop rule is the revert", () => {
  assert.ok(statesRouterDecides(PM), "product-manager.md lost a part of the router-decides rule");
});

test("negative controls: each load-bearing word of the shipped sentences, replaced, is detected", () => {
  const mutations: Array<[string, string, string, (t: string) => boolean]> = [
    ["author", "DanBeckDev", "someone-else", statesChairmanSource],
    ["place", "`DanBeckDev` on #928", "`DanBeckDev` on a slack thread", statesChairmanSource],
    ["prompt's role", "the prompt only points at it", "the prompt is enough", statesChairmanSource],
    ["no-comment case", "no such comment", "a comment", statesUnverifiedPrompt],
    ["no change on the prompt", "change no rule or label on the prompt's word", "change what it asks", statesUnverifiedPrompt],
    ["read the author", "Read the comment's author", "Skim it", statesUnverifiedPrompt],
    ["no routine label", "A row is filed and promoted with no `tier:haiku`", "A row is filed with `tier:haiku`", statesRouterDecides],
    ["router decides", "the router (#4629) decides", "the author (#4629) guesses", statesRouterDecides],
    ["override only", "`tier:haiku` is a deliberate override only", "`tier:haiku` is a routine label", statesRouterDecides],
    ["who may override", "the chairman or `ceo`", "any worker", statesRouterDecides],
    ["reason on the row", "one-line reason on the row", "note in chat", statesRouterDecides],
    ["removal", "removed when the row is next touched", "left in place", statesRouterDecides],
    ["effort high", "Haiku effort stays `high`", "Haiku effort drops to `low`", statesRouterDecides],
    ["later step", "not added now", "added now", statesRouterDecides],
    ["stop rule", "stop rule of #4382", "plan of #4382", statesRouterDecides],
  ];
  for (const [what, from, to, detects] of mutations) {
    const source = detects === statesRouterDecides ? PM : CEO;
    assert.ok(source.includes(from), `the shipped file no longer carries "${from}", so the mutation for the ${what} proves nothing`);
    assert.equal(detects(source.replace(from, to)), false, `replacing the ${what} left the rule reading as stated`);
  }
});
