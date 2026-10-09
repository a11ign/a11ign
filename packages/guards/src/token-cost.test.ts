/**
 * `scripts/token-cost.ts` reads calls and dollars per merged pull request from the host's session transcripts. Every definition is a pure
 * function over injected transcript lines and a merged-pull-request list, so this pins them with no network, no real transcript and no clock.
 *
 * What has to hold or the chairman's two numbers (calls per merged pull request, dollars per merged pull request) are wrong without looking it:
 *   1. A CALL IS ONE `message.id`, NOT ONE TRANSCRIPT LINE: a request writes a line per content block with the usage repeated.
 *   2. A MODEL NOT ON THE PRICE LIST IS UNPRICED, NOT $0, and a dated snapshot id prices as its family.
 *   3. THE WINDOW IS HALF-OPEN: a call stamped exactly at `until` belongs to the next window and never to both.
 *   4. ATTRIBUTION IS ORDERED AND REFUSES AMBIGUITY: branch, then `reviewer-<n>`, then `worker-<n>`; a key two repositories claim reaches none.
 *   5. EACH CALL IS COUNTED IN ONE CONTRIBUTOR, in a fixed order, and a tie names the earlier category.
 *   6. A MERGED PULL REQUEST WITH NO CALL IS UNREAD, out of the denominators, never a $0.00 that pulls the average down.
 *   7. A MISSING TARGETS FILE IS A STATE (UNREAD, no marker), any other read failure is an error.
 *
 * THE POSITIVE CONTROLS: each emptiness or null assertion sits beside a case that yields the non-empty answer from the same function.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Call, Pull, Window } from "../../../scripts/token-cost.ts";
import type { Targets } from "../../../scripts/ci-health.ts";
const tc = await import("../../../scripts/token-cost.ts");

const MILLION = 1_000_000;
const SONNET = "claude-sonnet-5-5";
const MIN_PULLS = 2;
const QUIET_TURN_MAX_CALLS = 8; // QUIET_TURN_MAX_CALLS in the source: a quiet turn of this many calls is still a wait

interface TokenInput { input?: number; output?: number; cacheRead?: number; write5m?: number; write1h?: number }
const tokens = ({ input = 0, output = 0, cacheRead = 0, write5m = 0, write1h = 0 }: TokenInput = {}) => ({ input, output, cacheRead, write5m, write1h });

interface CallInput {
  id: string; at?: string; model?: string; tokens?: TokenInput; file?: string; name?: string | null; branch?: string | null;
  firstInSession?: boolean; afterCompaction?: boolean; reread?: boolean; waitTurn?: boolean;
}
/** A parsed Call with only what a test names; everything else is the quiet default. */
const call = (input: CallInput): Call => ({
  id: input.id, at: input.at ?? "2026-10-01T10:00:00Z", model: input.model ?? SONNET, tokens: tokens(input.tokens), file: input.file ?? "f1",
  name: input.name ?? null, branch: input.branch ?? null, firstInSession: input.firstInSession ?? false,
  afterCompaction: input.afterCompaction ?? false, reread: input.reread ?? false, waitTurn: input.waitTurn ?? false, waitBy: "",
});

interface PullInput { number: number; repository?: string; branch?: string; rounds?: { from: string; to: string }[]; failures?: { from: string; to: string }[] }
const pull = ({ number, repository = "a11ign/a11ign", branch = `feat-${number}`, rounds = [], failures = [] }: PullInput): Pull => ({
  repository, number, branch, author: "dev", mergedAt: "2026-10-02T00:00:00Z", rounds, failures,
});

// ---- transcript line builders ---------------------------------------------------------------------------

const userLine = (content: string) => JSON.stringify({ type: "user", message: { role: "user", content } });

interface AssistantInput { id: string; at?: string; usage?: object; text?: string; model?: string; branch?: string }
function assistantLine({ id, at = "2026-10-01T10:00:00Z", usage = { input_tokens: 1, output_tokens: 1 }, text, model = SONNET, branch }: AssistantInput) {
  const content = text === undefined ? [{ type: "tool_use", id: "t" }] : [{ type: "text", text }];
  return JSON.stringify({ type: "assistant", timestamp: at, ...(branch ? { gitBranch: branch } : {}), message: { id, model, usage, content } });
}

const read = (lines: string[], file = "f1") => tc.callsFromTranscript({ file, lines });
const byId = (calls: ReturnType<typeof call>[]): Record<string, ReturnType<typeof call>> => Object.fromEntries(calls.map((c) => [c.id, c]));

// ---- the price list and the dollars ---------------------------------------------------------------------

test("PRICE_LIST: every model's prices are ordered the way the cache multipliers say", () => {
  const models = Object.entries(tc.PRICE_LIST.perMillionTokens) as [string, Record<string, number>][];
  assert.ok(models.length > 0);
  for (const [model, p] of models) {
    assert.ok(p.cacheRead <= p.input, `${model}: a cache read is no dearer than input`);
    assert.ok(p.input <= p.cacheWrite5m, `${model}: a 5m write costs at least input`);
    assert.ok(p.cacheWrite5m <= p.cacheWrite1h, `${model}: a 1h write costs at least a 5m write`);
    assert.ok(p.output > p.input, `${model}: output is dearer than input`);
  }
});

test("costOfCall: a million of each token kind sums the five prices", () => {
  const all = tokens({ input: MILLION, output: MILLION, cacheRead: MILLION, write5m: MILLION, write1h: MILLION });
  assert.equal(tc.costOfCall({ model: SONNET, tokens: all }, tc.PRICE_LIST), 2 + 10 + 0.2 + 2.5 + 4);
});

test("costOfCall: a dated snapshot prices as its family, an unknown model is null and not zero", () => {
  const output = { model: "claude-haiku-4-5-20251001", tokens: tokens({ output: MILLION }) };
  assert.equal(tc.costOfCall(output, tc.PRICE_LIST), 5);
  assert.equal(tc.costOfCall({ model: "claude-mystery-9", tokens: tokens({ output: MILLION }) }, tc.PRICE_LIST), null);
  assert.equal(tc.costOfCall({ model: "claude-mystery-9-20251001", tokens: tokens() }, tc.PRICE_LIST), null);
  assert.equal(tc.costOfCall({ model: SONNET, tokens: tokens() }, tc.PRICE_LIST), 0);
});

test("contextOf: new input plus everything read from or written to the cache, never output", () => {
  assert.equal(tc.contextOf(tokens({ input: 1, output: 1000, cacheRead: 20, write5m: 300, write1h: 4000 })), 4321);
  assert.equal(tc.contextOf(tokens()), 0);
});

test("totalCost: sums priced calls and counts unpriced ones apart", () => {
  const calls = [call({ id: "a", tokens: { output: MILLION } }), call({ id: "b", model: "nope", tokens: { output: MILLION } }), call({ id: "c", tokens: { input: MILLION } })];
  assert.deepEqual(tc.totalCost(calls, tc.PRICE_LIST), { dollars: 12, unpriced: 1 });
  assert.deepEqual(tc.totalCost([], tc.PRICE_LIST), { dollars: 0, unpriced: 0 });
});

test("withFiveMinuteWrites: reprices 1-hour writes at the 5-minute rate and leaves the list untouched", () => {
  const proxy = tc.withFiveMinuteWrites(tc.PRICE_LIST);
  const written = call({ id: "a", tokens: { write1h: MILLION } });
  assert.equal(tc.costOfCall(written, tc.PRICE_LIST), 4);
  assert.equal(tc.costOfCall(written, proxy), 2.5);
  assert.equal(tc.PRICE_LIST.perMillionTokens[SONNET].cacheWrite1h, 4);
  assert.equal(proxy.readOn, tc.PRICE_LIST.readOn);
});

// ---- the window -----------------------------------------------------------------------------------------

const DAY = { since: "2026-10-01T00:00:00Z", until: "2026-10-02T00:00:00Z" };

test("windowContains: since is in and until is out", () => {
  assert.equal(tc.windowContains(DAY, "2026-09-30T23:59:59Z"), false);
  assert.equal(tc.windowContains(DAY, "2026-10-01T00:00:00Z"), true);
  assert.equal(tc.windowContains(DAY, "2026-10-01T23:59:59Z"), true);
  assert.equal(tc.windowContains(DAY, "2026-10-02T00:00:00Z"), false);
});

test("windowContains: an unparsable instant is outside, never inside", () => {
  assert.equal(tc.windowContains(DAY, "not a date"), false);
});

test("windowContains: hours restrict each day to [from, to) o'clock UTC", () => {
  const week = { since: "2026-10-01T00:00:00Z", until: "2026-10-04T00:00:00Z", hours: { from: 14, to: 20 } };
  assert.equal(tc.windowContains(week, "2026-10-02T13:59:59Z"), false);
  assert.equal(tc.windowContains(week, "2026-10-02T14:00:00Z"), true);
  assert.equal(tc.windowContains(week, "2026-10-03T19:59:59Z"), true);
  assert.equal(tc.windowContains(week, "2026-10-03T20:00:00Z"), false);
  assert.equal(tc.windowContains(week, "2026-10-04T15:00:00Z"), false); // the right hour, but past `until`
});

test("parseHours: reads FROM-TO and refuses everything that is not 0 <= FROM < TO <= 24", () => {
  assert.deepEqual(tc.parseHours("14-20"), { from: 14, to: 20 });
  assert.deepEqual(tc.parseHours("0-24"), { from: 0, to: 24 });
  assert.deepEqual(tc.parseHours("9-10"), { from: 9, to: 10 });
  for (const bad of ["14-14", "20-14", "0-25", "abc", "14", "14-", "-20", "14-20-1", "100-200"]) {
    assert.throws(() => tc.parseHours(bad), new RegExp(`--hours=${bad} is not FROM-TO`), bad);
  }
});

// ---- reading a transcript -------------------------------------------------------------------------------

test("callsFromTranscript: a request that wrote several lines is ONE call, keeping the largest output count", () => {
  const { calls, unparsed } = read([
    assistantLine({ id: "m1", usage: { input_tokens: 10, output_tokens: 5 } }),
    assistantLine({ id: "m1", usage: { input_tokens: 10, output_tokens: 50 } }),
    assistantLine({ id: "m1", usage: { input_tokens: 10, output_tokens: 7 } }),
    assistantLine({ id: "m2" }),
  ]);
  assert.equal(unparsed, 0);
  assert.deepEqual(calls.map((c: { id: string }) => c.id), ["m1", "m2"]);
  assert.deepEqual(calls[0].tokens, tokens({ input: 10, output: 50 }));
});

test("callsFromTranscript: cache writes split into 5m and 1h when the transcript says so, else all count as 5m", () => {
  const { calls } = read([
    assistantLine({ id: "split", usage: { cache_creation_input_tokens: 100, cache_creation: { ephemeral_1h_input_tokens: 40, ephemeral_5m_input_tokens: 60 } } }),
    assistantLine({ id: "flat", usage: { cache_creation_input_tokens: 100 } }),
    assistantLine({ id: "only1h", usage: { cache_creation_input_tokens: 100, cache_creation: { ephemeral_1h_input_tokens: 40 } } }),
    assistantLine({ id: "bare", usage: {} }),
    assistantLine({ id: "read", usage: { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 3 } }),
  ]);
  const { split, flat, only1h, bare, read: reads } = byId(calls);
  assert.deepEqual([split.tokens.write5m, split.tokens.write1h], [60, 40]);
  assert.deepEqual([flat.tokens.write5m, flat.tokens.write1h], [100, 0]);
  assert.deepEqual([only1h.tokens.write5m, only1h.tokens.write1h], [60, 40]);
  assert.deepEqual(bare.tokens, tokens());
  assert.deepEqual(reads.tokens, tokens({ input: 1, output: 2, cacheRead: 3 }));
});

test("callsFromTranscript: records timestamp, model, branch, file, and null when the line had no branch", () => {
  const { calls } = read([
    assistantLine({ id: "m1", at: "2026-10-01T09:30:00Z", model: "claude-opus-5", branch: "feat-9" }),
    assistantLine({ id: "m2" }),
  ], "/x/session.jsonl");
  assert.equal(calls[0].at, "2026-10-01T09:30:00Z");
  assert.equal(calls[0].model, "claude-opus-5");
  assert.equal(calls[0].branch, "feat-9");
  assert.equal(calls[0].file, "/x/session.jsonl");
  assert.equal(calls[1].branch, null);
  assert.equal(calls[0].firstInSession, true);
  assert.equal(calls[1].firstInSession, false);
});

test("callsFromTranscript: skips synthetic, usage-less and non-assistant lines (control: a real one is kept)", () => {
  const empty = read([
    assistantLine({ id: "s", model: "<synthetic>" }),
    JSON.stringify({ type: "assistant", message: { id: "nousage", model: SONNET } }),
    JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "tool_result", content: "x" }] } }),
    "",
    "garbage with no marker",
  ]);
  assert.deepEqual(empty, { calls: [], unparsed: 0 });
  assert.equal(read([assistantLine({ id: "real" })]).calls.length, 1);
});

test("callsFromTranscript: a line cut off mid-write is counted as unparsed and the rest still reads", () => {
  const { calls, unparsed } = read([assistantLine({ id: "m1" }), '{"type":"assistant","message":{"id":"m2","usa', userLine("fine"), assistantLine({ id: "m3" })]);
  assert.equal(unparsed, 1);
  assert.deepEqual(calls.map((c: { id: string }) => c.id), ["m1", "m3"]);
});

test("callsFromTranscript: a line that parses but is malformed is an error naming the file, not a silent skip", () => {
  const malformed = JSON.stringify({ type: "assistant", message: { id: "m", model: SONNET, usage: {}, content: "a string, not blocks" } });
  assert.throws(() => read([malformed], "/x/broken.jsonl"), /token-cost: \/x\/broken\.jsonl: .*filter/);
});

test("callsFromTranscript: the session name comes from the FIRST wake that names it", () => {
  const { calls } = read([
    assistantLine({ id: "before-any-name" }),
    userLine("You are `worker-12`. Begin."),
    assistantLine({ id: "named" }),
    userLine("You are `somebody-else`. Later."),
    assistantLine({ id: "still-first-name" }),
  ]);
  const { "before-any-name": before, named, "still-first-name": later } = byId(calls);
  assert.equal(before.name, null);
  assert.equal(named.name, "worker-12");
  assert.equal(later.name, "worker-12");
});

test("callsFromTranscript: an idle nudge makes its whole turn a wait, whatever the calls said", () => {
  const { calls } = read([
    userLine("work"), assistantLine({ id: "w1", text: "implemented the thing" }),
    userLine("IDLE FOR 30 MINUTES, anything to do?"), assistantLine({ id: "n1", text: "pushed a fix" }), assistantLine({ id: "n2" }),
  ]);
  const { w1, n1, n2 } = byId(calls);
  assert.deepEqual([w1.waitTurn, w1.waitBy], [false, ""]);
  assert.deepEqual([n1.waitTurn, n1.waitBy], [true, "idle nudge"]);
  assert.deepEqual([n2.waitTurn, n2.waitBy], [true, "idle nudge"]);
});

test("callsFromTranscript: a short turn that ends 'nothing to do' is a wait; the phrases are matched case-insensitively", () => {
  for (const phrase of ["Nothing to do.", "nothing to act on", "No action needed", "no action is required", "Nothing has changed"]) {
    const { calls } = read([userLine("tick"), assistantLine({ id: "q", text: `Checked. ${phrase}` })]);
    assert.deepEqual([calls[0].waitTurn, calls[0].waitBy], [true, "nothing to do"], phrase);
  }
  const { calls } = read([userLine("tick"), assistantLine({ id: "q", text: "Checked, and I have something to do." })]);
  assert.equal(calls[0].waitTurn, false);
});

test("callsFromTranscript: a turn of more than eight calls that ends 'nothing to do' did work first, so it is NOT a wait", () => {
  const turn = (count: number) => [userLine("tick"), ...Array.from({ length: count }, (_, i) => assistantLine({ id: `m${i}`, text: i === count - 1 ? "nothing to do" : undefined }))];
  assert.equal(read(turn(QUIET_TURN_MAX_CALLS)).calls.every((c: { waitTurn: boolean }) => c.waitTurn), true);
  assert.equal(read(turn(QUIET_TURN_MAX_CALLS + 1)).calls.some((c: { waitTurn: boolean }) => c.waitTurn), false);
});

test("callsFromTranscript: the turn's wait verdict uses its LAST text, so an early 'nothing to do' does not stick", () => {
  const { calls } = read([userLine("tick"), assistantLine({ id: "a", text: "nothing to do yet" }), assistantLine({ id: "b", text: "actually, fixed a bug" })]);
  assert.deepEqual(calls.map((c: { waitTurn: boolean }) => c.waitTurn), [false, false]);
});

test("callsFromTranscript: background notices and slash commands do not start a turn", () => {
  const { calls } = read([
    userLine("IDLE FOR 5 MINUTES"), assistantLine({ id: "a" }),
    userLine("<task-notification>done</task-notification>"), userLine("<local-command-stdout>x</local-command-stdout>"),
    userLine("<command-name>/clear</command-name>"), userLine("/compact now"),
    assistantLine({ id: "b" }),
  ]);
  assert.deepEqual(calls.map((c: { waitBy: string }) => c.waitBy), ["idle nudge", "idle nudge"]); // still the nudge's turn
});

test("callsFromTranscript: the first call after a continuation notice is after-compaction, and only that one", () => {
  const { calls } = read([
    assistantLine({ id: "before" }),
    userLine("This session is being continued from a previous conversation..."),
    assistantLine({ id: "after" }), assistantLine({ id: "later" }),
  ]);
  assert.deepEqual(calls.map((c: { afterCompaction: boolean }) => c.afterCompaction), [false, true, false]);
});

// ---- re-reads -------------------------------------------------------------------------------------------

test("markRereads: the first call of a name's later transcript re-reads; the first transcript and later calls do not", () => {
  const calls = [
    call({ id: "a1", name: "worker-1", file: "A", at: "2026-10-01T01:00:00Z", firstInSession: true }),
    call({ id: "a2", name: "worker-1", file: "A", at: "2026-10-01T01:05:00Z" }),
    call({ id: "b1", name: "worker-1", file: "B", at: "2026-10-01T02:00:00Z", firstInSession: true }),
    call({ id: "b2", name: "worker-1", file: "B", at: "2026-10-01T02:05:00Z" }),
  ];
  const marked = tc.markRereads(calls);
  assert.equal(marked, calls, "mutates and returns the same array");
  assert.deepEqual(marked.map((c: { reread: boolean }) => c.reread), [false, false, true, false]);
});

test("markRereads: the earliest transcript is by time, not by the order the calls arrive in", () => {
  const calls = [
    call({ id: "late", name: "s", file: "LATER", at: "2026-10-02T00:00:00Z", firstInSession: true }),
    call({ id: "early", name: "s", file: "EARLIER", at: "2026-10-01T00:00:00Z", firstInSession: true }),
  ];
  assert.deepEqual(tc.markRereads(calls).map((c: { reread: boolean }) => c.reread), [true, false]);
});

test("markRereads: a compaction re-reads even in the first transcript, and an unnamed session never re-reads by name", () => {
  const calls = [
    call({ id: "compacted", name: "s", file: "A", afterCompaction: true }),
    call({ id: "unnamed-1", name: null, file: "A", firstInSession: true }),
    call({ id: "unnamed-2", name: null, file: "B", firstInSession: true }),
  ];
  assert.deepEqual(tc.markRereads(calls).map((c: { reread: boolean }) => c.reread), [true, false, false]);
});

// ---- attribution ----------------------------------------------------------------------------------------

test("attributeCalls: the branch a line was written on wins over the session name", () => {
  const pulls = [pull({ number: 1, branch: "feat-1" }), pull({ number: 2, branch: "feat-2" })];
  const { byPull, noPull } = tc.attributeCalls({ calls: [call({ id: "x", branch: "feat-2", name: "reviewer-1" })], pulls });
  assert.deepEqual([...byPull.keys()], ["a11ign/a11ign#2"]);
  assert.deepEqual(noPull, []);
});

test("attributeCalls: reviewer-<n> reaches the pull request numbered n; worker-<n> the branch ending in -n", () => {
  const pulls = [pull({ number: 31, branch: "agent/some-title-77" })];
  const calls = [call({ id: "r", name: "reviewer-31" }), call({ id: "w", name: "worker-77" }), call({ id: "other", name: "worker-31" }), call({ id: "r77", name: "reviewer-77" })];
  const { byPull, noPull } = tc.attributeCalls({ calls, pulls });
  assert.deepEqual(byPull.get("a11ign/a11ign#31")?.map((c: { id: string }) => c.id), ["r", "w"]);
  assert.deepEqual(noPull.map((c: { id: string }) => c.id), ["other", "r77"]);
});

test("attributeCalls: a branch or number two repositories both claim is ambiguous and reaches none", () => {
  const pulls = [
    pull({ number: 5, repository: "a/one", branch: "shared-9" }),
    pull({ number: 5, repository: "a/two", branch: "shared-9" }),
    pull({ number: 6, repository: "a/one", branch: "unique-6" }),
  ];
  const calls = [call({ id: "branch", branch: "shared-9" }), call({ id: "num", name: "reviewer-5" }), call({ id: "row", name: "worker-9" }), call({ id: "ok", name: "reviewer-6" })];
  const { byPull, noPull } = tc.attributeCalls({ calls, pulls });
  assert.deepEqual(noPull.map((c: { id: string }) => c.id), ["branch", "num", "row"]);
  assert.deepEqual([...byPull.keys()], ["a/one#6"]);
});

test("attributeCalls: no calls and no pulls attribute nothing (control: a matching call is attributed)", () => {
  const empty = tc.attributeCalls({ calls: [], pulls: [] });
  assert.equal(empty.byPull.size, 0);
  assert.deepEqual(empty.noPull, []);
  assert.equal(tc.attributeCalls({ calls: [call({ id: "a", branch: "feat-1" })], pulls: [pull({ number: 1 })] }).byPull.size, 1);
});

test("groupOfCall: names where an unattributed call went", () => {
  assert.equal(tc.groupOfCall(call({ id: "a", name: null })), "unnamed session");
  assert.equal(tc.groupOfCall(call({ id: "a", name: "reviewer-12" })), "reviewer-<n>, pull request not merged in the window");
  assert.equal(tc.groupOfCall(call({ id: "a", name: "worker-3" })), "worker-<n>, pull request not merged in the window");
  assert.equal(tc.groupOfCall(call({ id: "a", name: "product-manager" })), "product-manager");
});

// ---- the four contributors ------------------------------------------------------------------------------

const at = (hour: number) => `2026-10-01T${String(hour).padStart(2, "0")}:00:00Z`;

test("reviewRounds: from each non-approving verdict to the next verdict by anyone but the author, or the merge", () => {
  const reviews = [
    { at: at(5), state: "APPROVED", login: "rev" },
    { at: at(1), state: "CHANGES_REQUESTED", login: "rev" },
    { at: at(2), state: "COMMENTED", login: "author" }, // the author's own comment is no verdict
    { at: at(3), state: "PENDING", login: "rev" },
    { at: at(3), state: "DISMISSED", login: "rev" },
    { at: at(4), state: "COMMENTED", login: "other" },
  ];
  assert.deepEqual(tc.reviewRounds(reviews, { author: "author", mergedAt: at(9) }), [{ from: at(1), to: at(4) }, { from: at(4), to: at(5) }]);
});

test("reviewRounds: a changes-requested with no later verdict runs to the merge (control: approval alone is no round)", () => {
  assert.deepEqual(tc.reviewRounds([{ at: at(1), state: "CHANGES_REQUESTED", login: "rev" }], { author: "a", mergedAt: at(9) }), [{ from: at(1), to: at(9) }]);
  assert.deepEqual(tc.reviewRounds([{ at: at(1), state: "APPROVED", login: "rev" }], { author: "a", mergedAt: at(9) }), []);
  assert.deepEqual(tc.reviewRounds([], { author: "a", mergedAt: at(9) }), []);
});

interface RunInput { event?: string; conclusion: string | null; branch?: string; created: string; updated?: string }
const ciRun = ({ event = "pull_request", conclusion, branch = "feat", created, updated }: RunInput) => ({
  event, conclusion, head_branch: branch, created_at: created, ...(updated ? { updated_at: updated } : {}),
});

test("failureIntervals: from a failed run's finish to the next passing run's finish, else the merge", () => {
  const runs = [
    ciRun({ conclusion: "failure", created: at(1), updated: at(2) }),
    ciRun({ conclusion: "failure", created: at(3), updated: at(4) }),
    ciRun({ conclusion: "success", created: at(5), updated: at(6) }),
    ciRun({ conclusion: "failure", created: at(7), updated: at(8) }),
  ];
  assert.deepEqual(tc.failureIntervals(runs, { branch: "feat", mergedAt: at(12) }), [
    { from: at(2), to: at(6) }, { from: at(4), to: at(6) }, { from: at(8), to: at(12) },
  ]);
});

test("failureIntervals: a run with no updated_at finishes at its creation; other branches, events and cancellations are ignored", () => {
  const runs = [
    ciRun({ conclusion: "failure", created: at(1) }),
    ciRun({ conclusion: "failure", created: at(2), branch: "other" }),
    ciRun({ conclusion: "failure", created: at(3), event: "merge_group" }),
    ciRun({ conclusion: "cancelled", created: at(4) }),
    ciRun({ conclusion: "success", created: at(5), branch: "other" }), // another branch's pass cannot end this one's red
  ];
  assert.deepEqual(tc.failureIntervals(runs, { branch: "feat", mergedAt: at(12) }), [{ from: at(1), to: at(12) }]);
  assert.deepEqual(tc.failureIntervals(runs.slice(1), { branch: "feat", mergedAt: at(12) }), []);
});

test("categoryOf: waits, then re-reads, then CI red, then review rounds; a reviewer's calls are never red or in a round", () => {
  const p = pull({ number: 1, failures: [{ from: at(1), to: at(5) }], rounds: [{ from: at(3), to: at(7) }] });
  const inBoth = at(4);
  assert.equal(tc.categoryOf(call({ id: "a", at: inBoth, waitTurn: true, reread: true }), p), "waits");
  assert.equal(tc.categoryOf(call({ id: "a", at: inBoth, reread: true }), p), "re-reads");
  assert.equal(tc.categoryOf(call({ id: "a", at: inBoth }), p), "CI red");
  assert.equal(tc.categoryOf(call({ id: "a", at: at(6) }), p), "review rounds");
  assert.equal(tc.categoryOf(call({ id: "a", at: at(8) }), p), null);
  assert.equal(tc.categoryOf(call({ id: "a", at: inBoth, name: "reviewer-1" }), p), null);
  assert.equal(tc.categoryOf(call({ id: "a", at: inBoth, name: "reviewer-1", reread: true }), p), "re-reads");
});

test("categoryOf: an interval is half-open, so the instant it ends is outside", () => {
  const p = pull({ number: 1, failures: [{ from: at(1), to: at(5) }] });
  assert.equal(tc.categoryOf(call({ id: "a", at: at(1) }), p), "CI red");
  assert.equal(tc.categoryOf(call({ id: "a", at: at(5) }), p), null);
});

test("countContributors: each call lands in one category or in none", () => {
  const p = pull({ number: 1, failures: [{ from: at(1), to: at(3) }], rounds: [{ from: at(3), to: at(6) }] });
  const attributed = [{ pull: p, calls: [
    call({ id: "w", waitTurn: true }), call({ id: "r", reread: true }), call({ id: "f", at: at(2) }), call({ id: "v1", at: at(4) }),
    call({ id: "v2", at: at(5) }), call({ id: "n", at: at(9) }),
  ] }];
  assert.deepEqual(tc.countContributors(attributed), { counts: { "review rounds": 2, "CI red": 1, waits: 1, "re-reads": 1 }, none: 1 });
  assert.deepEqual(tc.countContributors([]), { counts: { "review rounds": 0, "CI red": 0, waits: 0, "re-reads": 0 }, none: 0 });
});

test("biggestContributor: the largest wins, the earlier in CATEGORIES wins a tie, all-zero is null", () => {
  const counts = (partial: object) => ({ "review rounds": 0, "CI red": 0, waits: 0, "re-reads": 0, ...partial });
  assert.equal(tc.biggestContributor(counts({ waits: 3, "re-reads": 2 })), "waits");
  assert.equal(tc.biggestContributor(counts({ "re-reads": 4, waits: 3 })), "re-reads");
  assert.equal(tc.biggestContributor(counts({ waits: 2, "CI red": 2, "re-reads": 2 })), "CI red");
  assert.equal(tc.biggestContributor(counts({ "review rounds": 1 })), "review rounds");
  assert.equal(tc.biggestContributor(counts({})), null);
  assert.deepEqual(tc.CATEGORIES, ["review rounds", "CI red", "waits", "re-reads"]);
});

// ---- the readings ---------------------------------------------------------------------------------------

const MILLION_OUT = { output: MILLION }; // one dollar-priced unit: $10 on sonnet-5-5

test("readRepository: averages over pull requests that have calls, and lists the rest as UNREAD", () => {
  const pulls = [pull({ number: 1 }), pull({ number: 2 }), pull({ number: 3 }), pull({ number: 4, repository: "a11ign/agent-org" })];
  const byPull = new Map([
    ["a11ign/a11ign#1", [call({ id: "a", tokens: MILLION_OUT }), call({ id: "b", tokens: MILLION_OUT })]],
    ["a11ign/a11ign#3", [call({ id: "c", tokens: MILLION_OUT, waitTurn: true })]],
    ["a11ign/agent-org#4", [call({ id: "d" })]],
  ]);
  const reading = tc.readRepository({ repository: "a11ign/a11ign", pulls, byPull, prices: tc.PRICE_LIST, minimum: MIN_PULLS });
  assert.equal(reading.merged, 3);
  assert.equal(reading.read, 2);
  assert.deepEqual(reading.unread, [2]);
  assert.equal(reading.calls, 3);
  assert.equal(reading.dollars, 30);
  assert.equal(reading.callsPerPull, 1.5);
  assert.equal(reading.dollarsPerPull, 15);
  assert.equal(reading.enough, true);
  assert.equal(reading.counts.waits, 1);
  assert.equal(reading.none, 2);
  assert.equal(reading.biggest, "waits");
});

test("readRepository: with no call attributed there is no rate, it is not enough below the minimum, and unpriced calls are counted", () => {
  const empty = tc.readRepository({ repository: "r", pulls: [pull({ number: 1, repository: "r" })], byPull: new Map(), prices: tc.PRICE_LIST, minimum: MIN_PULLS });
  assert.equal(empty.callsPerPull, null);
  assert.equal(empty.dollarsPerPull, null);
  assert.equal(empty.enough, false);
  assert.equal(empty.biggest, null);
  assert.deepEqual(empty.unread, [1]);
  const unpriced = tc.readRepository({
    repository: "r", pulls: [pull({ number: 1, repository: "r" })], prices: tc.PRICE_LIST, minimum: 1,
    byPull: new Map([["r#1", [call({ id: "a", model: "mystery" })]]]),
  });
  assert.deepEqual([unpriced.unpriced, unpriced.dollars, unpriced.callsPerPull, unpriced.enough], [1, 0, 1, true]);
});

test("readWindow: the chairman's figure divides ALL calls by merged pull requests, and the remainder is reported apart", () => {
  const priced = call({ id: "a", tokens: { write1h: MILLION } });
  const stray = call({ id: "b", model: "mystery", name: null, tokens: { input: MILLION } });
  const whole = tc.readWindow({ calls: [priced, stray], noPull: [stray], merged: 2, prices: tc.PRICE_LIST });
  assert.equal(whole.calls, 2);
  assert.equal(whole.dollars, 4);
  assert.equal(whole.unpriced, 1);
  assert.equal(whole.callsPerPull, 1);
  assert.equal(whole.dollarsPerPull, 2);
  assert.equal(whole.dollarsPerPullFiveMinuteWrites, 1.25);
  assert.equal(whole.unattributed, 1);
  assert.equal(whole.unattributedDollars, 0);
  assert.equal(whole.meanContext, MILLION);
  assert.equal(whole.cacheWriteShare, 1);
  assert.deepEqual(whole.groups, [["unnamed session", 1]]);
});

test("readWindow: groups sort by size then name, and an empty window has no ratios (control: a non-empty one has them)", () => {
  const stray = (id: string, name: string | null) => call({ id, name });
  const noPull = [stray("1", "zeta"), stray("2", "alpha"), stray("3", "zeta"), stray("4", "beta")];
  assert.deepEqual(tc.readWindow({ calls: noPull, noPull, merged: 1, prices: tc.PRICE_LIST }).groups, [["zeta", 2], ["alpha", 1], ["beta", 1]]);
  const empty = tc.readWindow({ calls: [], noPull: [], merged: 0, prices: tc.PRICE_LIST });
  assert.deepEqual(
    [empty.callsPerPull, empty.dollarsPerPull, empty.dollarsPerPullFiveMinuteWrites, empty.meanContext, empty.cacheWriteShare, empty.groups],
    [null, null, null, null, null, []],
  );
  const some = tc.readWindow({ calls: [call({ id: "a", tokens: { output: MILLION } })], noPull: [], merged: 1, prices: tc.PRICE_LIST });
  assert.deepEqual([some.callsPerPull, some.dollarsPerPull, some.meanContext, some.cacheWriteShare], [1, 10, 0, 0]);
});

// ---- the section ----------------------------------------------------------------------------------------

const TARGETS: Targets = {
  workflow: "ci.yml", reportOn: { repository: "a11ign/a11ign", issue: 928 }, repositories: ["a11ign/a11ign"], minimumPullRequests: MIN_PULLS,
  targets: {
    firstRunPassRate: { label: "First", unit: "ratio", atLeast: 0.8 },
    mergeQueueFailureRate: { label: "Queue", unit: "ratio", below: 0.05 },
    ciRunsPerPullRequest: { label: "Runs", unit: "count", atMost: 2 },
    callsPerMergedPullRequest: { label: "Calls", unit: "count", atMost: 70 },
    dollarsPerMergedPullRequest: { label: "Dollars", unit: "dollars", below: 2.5 },
  },
};

function sectionFor({ window = DAY, calls, pulls, byPull }: { window?: Window; calls: ReturnType<typeof call>[]; pulls: ReturnType<typeof pull>[]; byPull: Map<string, ReturnType<typeof call>[]> }) {
  const noPull = calls.filter((c) => ![...byPull.values()].flat().includes(c));
  const readings = [tc.readRepository({ repository: "a11ign/a11ign", pulls, byPull, prices: tc.PRICE_LIST, minimum: MIN_PULLS })];
  const whole = tc.readWindow({ calls, noPull, merged: pulls.length, prices: tc.PRICE_LIST });
  return tc.renderSection({ readings, whole, targets: TARGETS, prices: tc.PRICE_LIST, window, commit: "abc123def456", rateLimit: "4999 of 5000", minimum: MIN_PULLS });
}

test("renderSection: opens with the marker, states the definitions once, and reads the verdicts against the targets", () => {
  const cheap = call({ id: "a", tokens: { output: MILLION / 10 }, name: "worker-1" }); // $1.00
  const pulls = [pull({ number: 1 }), pull({ number: 2 })];
  const text = sectionFor({ calls: [cheap], pulls, byPull: new Map([["a11ign/a11ign#1", [cheap]]]) });
  const lines = text.split("\n");
  assert.equal(lines[0], tc.MARKER);
  assert.equal(lines[1], "### Calls and dollars per merged pull request");
  assert.match(text, /Window: 2026-10-01T00:00:00Z to 2026-10-02T00:00:00Z \(UTC, end exclusive\)\./);
  assert.match(text, /list read 2026-10-05/);
  assert.match(text, /Script: `scripts\/token-cost\.ts` at `abc123def456`\. Rate limit seen: 4999 of 5000\./);
  assert.match(text, /\| Calls per merged pull request \(ALL calls\) \| at most 70 \| 0\.5 \| 1 calls over 2 merged pull requests, both repositories \| \*\*MET\*\* \|/);
  assert.match(text, /\| Dollars per merged pull request \(ALL calls\) \(verdict of record: list price as reported\) \| under \$2\.50 \| \$0\.50 \| .* \| \*\*MET\*\* \|/);
  assert.match(text, /UNATTRIBUTED .*: 0 of 1 calls \(0\.0%\), \$0\.00 of \$1\.00\./);
  assert.match(text, /Unattributed by session: none\./);
  assert.match(text, /Mean context per call: 0 tokens\. Cache-write share of cost: 0\.0%\./);
  assert.match(text, /#### a11ign\/a11ign/);
  assert.match(text, /1 attributed calls over 1 of 2 merged pull requests \(1 UNREAD\)/);
  assert.match(text, /UNREAD, no call attributed: #2\./);
  assert.doesNotMatch(text, /no price/);
});

test("renderSection: a window with hours says so, a missed target says MISSED, too few pull requests says UNREAD", () => {
  const dear = call({ id: "a", tokens: { output: MILLION } }); // $10
  const pulls = [pull({ number: 1 })];
  const text = sectionFor({ window: { ...DAY, hours: { from: 9, to: 17 } }, calls: [dear], pulls, byPull: new Map([["a11ign/a11ign#1", [dear]]]) });
  assert.match(text, /and 09:00-17:00 of each day\./);
  assert.match(text, /\$10\.00 \|[^\n]*\| \*\*UNREAD\*\* \|/); // one merged pull request is under the minimum of two
  assert.match(text, /UNREAD above: 1 merged pull requests is under the 2 a rate needs\./);
  const enough = sectionFor({ calls: [dear], pulls: [pull({ number: 1 }), pull({ number: 2 })], byPull: new Map([["a11ign/a11ign#1", [dear]]]) });
  assert.match(enough, /\$5\.00 \|[^\n]*\| \*\*MISSED\*\* \|/);
  assert.doesNotMatch(enough, /merged pull requests is under the/);
  assert.doesNotMatch(enough, /and \d\d:00-/);
});

test("renderSection: an empty week reads UNREAD everywhere and says no reading (nothing is invented)", () => {
  const text = sectionFor({ calls: [], pulls: [], byPull: new Map() });
  assert.match(text, /\| UNREAD \| 0 calls over 0 merged pull requests, both repositories \| \*\*UNREAD\*\* \|/);
  assert.match(text, /Mean context per call: no reading tokens\. Cache-write share of cost: no reading\./);
  assert.match(text, /Biggest contributor: UNREAD \(all four counts are 0\)/);
});

test("renderSection: unpriced calls are named in both the whole-window and the per-repository lines", () => {
  const odd = call({ id: "a", model: "mystery", name: "worker-1" });
  const text = sectionFor({ calls: [odd], pulls: [pull({ number: 1 })], byPull: new Map([["a11ign/a11ign#1", [odd]]]) });
  assert.match(text, /1 calls ran on a model with no price and are in no dollar figure\./);
  assert.match(text, /1 attributed calls ran on a model with no price: the dollars are a floor\./);
});

test("renderSection: unattributed calls are broken down by session, the top five only", () => {
  const strays = ["a", "b", "c", "d", "e", "f"].map((name, i) => call({ id: `${i}`, name }));
  const text = sectionFor({ calls: strays, pulls: [], byPull: new Map() });
  assert.match(text, /UNATTRIBUTED .*: 6 of 6 calls \(100\.0%\)/);
  assert.match(text, /Unattributed by session: a 1, b 1, c 1, d 1, e 1\./);
  assert.doesNotMatch(text, /f 1/);
});

test("renderSection: names the biggest contributor and its share of the attributed calls", () => {
  const waiting = [call({ id: "a", waitTurn: true }), call({ id: "b", waitTurn: true }), call({ id: "c" })];
  const text = sectionFor({ calls: waiting, pulls: [pull({ number: 1 })], byPull: new Map([["a11ign/a11ign#1", waiting]]) });
  assert.match(text, /Biggest contributor: waits \(2 calls, 66\.7% of the attributed calls\)/);
  assert.match(text, /Counts: review rounds 0, CI red 0, waits 2, re-reads 0, none of the four 1; together 3 attributed calls\./);
});

// ---- the host and the targets file ----------------------------------------------------------------------

/** A temp directory removed afterwards, whatever the body does. */
function withTempDir(body: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "token-cost-test-"));
  try {
    body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const touch = (file: string, iso: string) => {
  writeFileSync(file, "{}\n");
  const seconds = Date.parse(iso) / 1000;
  utimesSync(file, seconds, seconds);
};

test("transcriptFiles: takes .jsonl files one directory down, written at or after `since`", () => {
  withTempDir((root) => {
    mkdirSync(join(root, "proj-a"));
    mkdirSync(join(root, "proj-b"));
    touch(join(root, "proj-a", "new.jsonl"), "2026-10-02T00:00:00Z");
    touch(join(root, "proj-a", "edge.jsonl"), "2026-10-01T00:00:00Z");
    touch(join(root, "proj-a", "old.jsonl"), "2026-09-30T23:59:59Z");
    touch(join(root, "proj-a", "notes.txt"), "2026-10-02T00:00:00Z");
    touch(join(root, "proj-b", "other.jsonl"), "2026-10-03T00:00:00Z");
    touch(join(root, "stray.jsonl"), "2026-10-03T00:00:00Z"); // a file at the top level is no project directory
    assert.deepEqual(tc.transcriptFiles(root, "2026-10-01T00:00:00Z").sort(), [
      join(root, "proj-a", "edge.jsonl"), join(root, "proj-a", "new.jsonl"), join(root, "proj-b", "other.jsonl"),
    ]);
  });
});

test("transcriptFiles: an empty root has none, and a `since` after every file leaves none (control: the files exist)", () => {
  withTempDir((root) => {
    assert.deepEqual(tc.transcriptFiles(root, "2026-10-01T00:00:00Z"), []);
    mkdirSync(join(root, "p"));
    touch(join(root, "p", "a.jsonl"), "2026-10-02T00:00:00Z");
    assert.equal(tc.transcriptFiles(root, "2026-10-01T00:00:00Z").length, 1);
    assert.deepEqual(tc.transcriptFiles(root, "2026-10-03T00:00:00Z"), []);
  });
});

test("readTargetsFile: a missing file is a state, a good one is read, a broken or unbound one is an error naming the file", () => {
  withTempDir((dir) => {
    const missing = join(dir, "absent.json");
    assert.deepEqual(tc.readTargetsFile(missing), { missing });
    const good = join(dir, "good.json");
    writeFileSync(good, JSON.stringify(TARGETS));
    assert.deepEqual(tc.readTargetsFile(good), { targets: TARGETS });
    const torn = join(dir, "torn.json");
    writeFileSync(torn, '{"targets": ');
    assert.throws(() => tc.readTargetsFile(torn), (error: Error) => error.message.startsWith(`token-cost: ${torn} could not be read:`) && error.cause instanceof SyntaxError);
    const unbound = join(dir, "unbound.json");
    writeFileSync(unbound, JSON.stringify({ ...TARGETS, targets: { loose: { label: "Loose", unit: "count" } } }));
    assert.throws(() => tc.readTargetsFile(unbound), /could not be read: ci-health: target "Loose" names none/);
    assert.throws(() => tc.readTargetsFile(dir), /could not be read/); // a directory is not ENOENT
  });
});

test("unreadSection: says UNREAD and why, and carries no marker so a later run can still post", () => {
  const text = tc.unreadSection("docs/ci-targets.json");
  assert.match(text, /^### Calls and dollars per merged pull request\n\n\*\*UNREAD\*\*: `docs\/ci-targets\.json` is missing/);
  assert.match(text, /Nothing was measured\.$/);
  assert.equal(text.includes(tc.MARKER), false);
  assert.equal(tc.MARKER, "<!-- token-cost -->");
});
