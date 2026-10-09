#!/usr/bin/env node
// @ts-check
// command: read calls and dollars per merged pull request from the host's session transcripts and, with --post, add them to the week's CI-health comment on #928
//
// THE CHAIRMAN'S OTHER TWO TARGETS (calls per merged pull request at most 70, dollars under $2.50; #928, row #3217). His
// reading lived in his own session, so this puts the method in the repository. `docs/token-cost.md` states every
// definition; the ones a reader needs to trust a number are repeated at the top of what this prints.
//
// MEASURED 2026-10-05, and why the definitions are what they are:
//  - A CALL IS ONE `message.id`, NOT ONE TRANSCRIPT LINE. A model request writes one line per content block with the same
//    usage repeated (214 assistant lines were 89 requests in one transcript), so counting lines reads ~2.5x too high.
//    Counting ids reproduces the chairman's context per call: 194,634 tokens (his 195k) on 2026-09-25 14-20Z, 84,271 (his 84k)
//    on 2026-10-03 14-20Z.
//  - HIS CALLS PER MERGED PULL REQUEST DIVIDES ALL CALLS BY MERGED PULL REQUESTS: 1,293 / 20 = 65 and 4,357 / 54 = 81 (his 65
//    and 81), merged counting both repositories. That includes the standing seats' calls, which belong to no pull request.
//    This script prints that figure AND the attributed one, because an attribution rule that dropped the remainder would
//    quietly halve the number (2,035 of 4,357 calls matched a merged branch on 2026-10-03).
//
// EVERY DEFINITION IS A PURE FUNCTION over injected transcript lines and a merged-pull-request list, so the test needs no
// network and no real transcript. `main` only reads files and GitHub, hands them on, and posts what comes back.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, mkdtempSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { refuseUnknownFlags } from "@a11ign/screenreader-fleet/cli-flags";
const { assertNoLeakInArgv, leakRefusalReason } = await toolModule("src/lib/leak-patterns.mjs");
import { sandboxGitEnv } from "../packages/guards/src/git-env.mjs";
import {
  TARGETS_FILE, commentHeading, daySlices, inWindow, parseInclude, targetText, targetsFrom, verdictOf, weeklyWindow,
} from "./ci-health.ts";
import type { Run } from "./ci-health.ts";
import { toolModule } from "./agent-org-newest-tag.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
const HOURS_PER_DAY = 24;
const TOKENS_PER_MILLION = 1_000_000;
const PER_PAGE = 100;
const SEARCH_CAP = 1000;
const PERCENT = 100;
const SHORT_SHA = 12;
const MAX_GH_OUTPUT_BYTES = 67_108_864;
const RUN_LOOKBACK_DAYS = 2;
/** A turn that ends "nothing to do" after more calls than this did work first, so it is not a wait. A judgement, named so it can be moved. */
const QUIET_TURN_MAX_CALLS = 8;
const TOP_GROUPS = 5;
export const MARKER = "<!-- token-cost -->";

/** The closed set a contributor is named from, in the order a tie is broken. */
export const CATEGORIES: Category[] = ["review rounds", "CI red", "waits", "re-reads"];

export type Tokens = { input: number, output: number, cacheRead: number, write5m: number, write1h: number };
export type Call = { id: string, at: string, model: string, tokens: Tokens, file: string, name: string | null, branch: string | null, firstInSession: boolean, afterCompaction: boolean, reread: boolean, waitTurn: boolean, waitBy: "" | "idle nudge" | "nothing to do" };
export type Price = { input: number, output: number, cacheRead: number, cacheWrite5m: number, cacheWrite1h: number };
export type PriceList = { readOn: string, source: string, perMillionTokens: Record<string, Price> };
export type Window = { since: string, until: string, hours?: { from: number, to: number } };
export type Interval = { from: string, to: string };
export type Pull = { repository: string, number: number, branch: string, author: string, mergedAt: string, rounds: Interval[], failures: Interval[] };
export type Category = "review rounds" | "CI red" | "waits" | "re-reads";

// ---- the price list ------------------------------------------------------------------------------------

/**
 * USD per million tokens, the LIST price (the chairman's proxy: what the tokens would cost on the API, not what a
 * subscription charged). Read 2026-10-05 from the claude-api skill's model table (cached by it on 2026-09-25) and its
 * `model-migration.md` pricing lines. STATED there: input, output, cache reads for Sonnet 5.5, Opus 5.5 and Fable 5.1,
 * and the 5m/1h writes for those three. DERIVED by the documented multipliers (cache read 0.1x, 5m write 1.25x, 1h write
 * 2x of input): claude-sonnet-5 (same prices as 5.5 per the doc), claude-opus-5, claude-haiku-4-5. A model absent from
 * this list is UNPRICED and counted as such, never priced at zero.
 * @type {PriceList}
 */
export const PRICE_LIST: PriceList = {
  readOn: "2026-10-05",
  source: "claude-api skill model table (cached 2026-09-25) and shared/model-migration.md; cache read/write multipliers 0.1x/1.25x/2x where the doc states none",
  perMillionTokens: {
    "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite5m: 2.5, cacheWrite1h: 4 },
    "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite5m: 2.5, cacheWrite1h: 4 },
    "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite5m: 5, cacheWrite1h: 8 },
    "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10 },
    "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25, cacheWrite5m: 12.5, cacheWrite1h: 20 },
    "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite5m: 1.25, cacheWrite1h: 2 },
  },
};

/** A dated snapshot id (`claude-haiku-4-5-20251001`) prices as its family. @param {string} model @param {PriceList} priceList @returns {Price | undefined} */
const priceFor = (model: string, priceList: PriceList): Price | undefined => priceList.perMillionTokens[model] ?? priceList.perMillionTokens[model.replace(/-\d{8}$/, "")];

/**
 * The dollars one call cost at the given list, or null when its model is not on it (UNPRICED, which is not $0).
 * @param {{ model: string, tokens: Tokens }} call @param {PriceList} priceList @returns {number | null}
 */
export function costOfCall(call: { model: string; tokens: Tokens; }, priceList: PriceList): number | null {
  const price = priceFor(call.model, priceList);
  if (!price) return null;
  const t = call.tokens;
  return (t.input * price.input + t.output * price.output + t.cacheRead * price.cacheRead
    + t.write5m * price.cacheWrite5m + t.write1h * price.cacheWrite1h) / TOKENS_PER_MILLION;
}

/** What a call put in front of the model: new input plus everything read from or written to the cache. @param {Tokens} t */
export const contextOf = (t: Tokens) => t.input + t.cacheRead + t.write5m + t.write1h;

/** @param {Call[]} calls @param {PriceList} priceList @returns {{ dollars: number, unpriced: number }} */
export function totalCost(calls: Call[], priceList: PriceList): { dollars: number; unpriced: number; } {
  let dollars = 0;
  let unpriced = 0;
  for (const call of calls) {
    const cost = costOfCall(call, priceList);
    if (cost === null) unpriced += 1; else dollars += cost;
  }
  return { dollars, unpriced };
}

/**
 * THE CHAIRMAN'S PROXY PRICES EVERY CACHE WRITE AT THE 5-MINUTE RATE, though these transcripts report 1-hour writes (2x input, not 1.25x).
 * Measured 2026-10-05 on 2026-10-03 14-20Z: all calls cost $147.94 with 1-hour writes at the 1-hour rate and 34% of that is cache writes;
 * repricing them at the 5-minute rate gives $129.08, which is his 54 x $2.39 = $129.06. So this is the one definition that explains his dollars,
 * and it is printed beside the list-price figure rather than replacing it. @param {PriceList} priceList @returns {PriceList}
 */
export const withFiveMinuteWrites = (priceList: PriceList): PriceList => ({
  ...priceList,
  perMillionTokens: Object.fromEntries(Object.entries(priceList.perMillionTokens).map(([model, price]) => [model, { ...price, cacheWrite1h: price.cacheWrite5m }])),
});

// ---- the window ----------------------------------------------------------------------------------------

/**
 * HALF-OPEN AND UTC: `since` is in, `until` is out, so a call stamped exactly at the end belongs to the NEXT window and never to both.
 * With `hours` the instant must also fall in `[from, to)` o'clock UTC of its day (the chairman's 14:00-20:00 reading).
 * @param {Window} window @param {string} instant ISO-8601
 */
export function windowContains(window: Window, instant: string) {
  const ms = Date.parse(instant);
  if (!(ms >= Date.parse(window.since) && ms < Date.parse(window.until))) return false;
  if (!window.hours) return true;
  const sinceMidnight = ms % MS_PER_DAY;
  return sinceMidnight >= window.hours.from * MS_PER_HOUR && sinceMidnight < window.hours.to * MS_PER_HOUR;
}

/** @param {string} text `14-20` @returns {{ from: number, to: number }} */
export function parseHours(text: string): { from: number; to: number; } {
  const match = /^(\d{1,2})-(\d{1,2})$/.exec(text);
  const from = Number(match?.[1]);
  const to = Number(match?.[2]);
  if (!match || from >= to || to > HOURS_PER_DAY) throw new Error(`token-cost: --hours=${text} is not FROM-TO with 0 <= FROM < TO <= ${HOURS_PER_DAY}.`);
  return { from, to };
}

// ---- reading a transcript ------------------------------------------------------------------------------

/** Neither of these starts a turn: a background task's notice, or a slash command Claude Code echoed. @param {string} text */
const isNotATurn = (text: string) => /^<(task-notification|local-command|command-)/.test(text) || text.startsWith("/compact");
const IDLE_NUDGE = /IDLE FOR \d+ MINUTES/;
const NOTHING_TO_DO = /\b(nothing to do|nothing to act on|no action (is )?(needed|required)|nothing has changed)\b/i;
const CONTINUED = "This session is being continued";
/** Both a human line and a wake order carry their text as a plain string; a tool result is an array, so this skips the bulk of a transcript unparsed. */
const STRING_USER = /"role":"user","content":"/;

/** One transcript line's `message.usage`, as Claude Code writes it. */
export type Usage = {
  input_tokens?: number, output_tokens?: number, cache_read_input_tokens?: number, cache_creation_input_tokens?: number,
  cache_creation?: { ephemeral_1h_input_tokens?: number, ephemeral_5m_input_tokens?: number },
};
export type ContentBlock = { type: string, text?: string };
export type Message = { id: string, model: string, usage?: Usage, content?: string | ContentBlock[] };
/** One parsed transcript line: JSON a live session wrote, so only the fields read here are named. */
export type TranscriptEntry = { type?: string, timestamp: string, gitBranch?: string, message?: Message };

/** @param {Usage} usage @returns {Tokens} */
function tokensOf(usage: Usage): Tokens {
  const written = usage.cache_creation_input_tokens ?? 0;
  const w1h = usage.cache_creation?.ephemeral_1h_input_tokens;
  const w5m = usage.cache_creation?.ephemeral_5m_input_tokens;
  return {
    input: usage.input_tokens ?? 0, output: usage.output_tokens ?? 0, cacheRead: usage.cache_read_input_tokens ?? 0,
    write5m: w5m ?? written - (w1h ?? 0), write1h: w1h ?? 0,
  };
}

export type FileState = { file: string, name: string | null, calls: Map<string, Call>, turn: Call[], turnNudge: boolean, finalText: string, afterCompaction: boolean, unparsed: number };

/** The turn that just ended is a wait when its wake was an idle nudge, or when it answered "nothing to do" in few calls. @param {FileState} state */
function closeTurn(state: FileState) {
  const quiet = state.turn.length <= QUIET_TURN_MAX_CALLS && NOTHING_TO_DO.test(state.finalText);
  for (const call of state.turn) {
    call.waitTurn = state.turnNudge || quiet;
    call.waitBy = state.turnNudge ? "idle nudge" : quiet ? "nothing to do" : "";
  }
  state.turn = [];
  state.finalText = "";
}

/** @param {FileState} state @param {string} text */
function openTurn(state: FileState, text: string) {
  closeTurn(state);
  state.turnNudge = IDLE_NUDGE.test(text);
  state.name ??= /You are `([^`]+)`/.exec(text)?.[1] ?? null;
}

/** @param {FileState} state @param {TranscriptEntry} entry one that `readEntry` found carrying a message with usage */
function addCall(state: FileState, entry: TranscriptEntry) {
  const message = entry.message as Message;
  const tokens = tokensOf(message.usage as Usage);
  const seen = state.calls.get(message.id);
  if (seen) {
    if (tokens.output > seen.tokens.output) seen.tokens = tokens; // every line of one request repeats the usage; the last may carry the final output count
    return;
  }
  /** @type {Call} */
  const call: Call = {
    id: message.id, at: entry.timestamp, model: message.model, tokens, file: state.file, name: state.name,
    branch: entry.gitBranch ?? null, firstInSession: state.calls.size === 0, afterCompaction: state.afterCompaction,
    reread: false, waitTurn: false, waitBy: "",
  };
  state.afterCompaction = false;
  state.calls.set(call.id, call);
  state.turn.push(call);
}

/** @param {FileState} state @param {TranscriptEntry} entry */
function readEntry(state: FileState, entry: TranscriptEntry) {
  if (entry.type === "assistant" && entry.message?.usage && entry.message.model !== "<synthetic>") {
    addCall(state, entry);
    const text = ((entry.message.content ?? []) as ContentBlock[]).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    if (text) state.finalText = text;
    return;
  }
  const content = entry.message?.content;
  if (entry.type !== "user" || typeof content !== "string") return;
  if (content.startsWith(CONTINUED)) state.afterCompaction = true;
  else if (!isNotATurn(content)) openTurn(state, content);
}

/**
 * Every call of one transcript, once each (by `message.id`), annotated with what its turn was.
 * @param {{ file: string, lines: Iterable<string> }} input @returns {{ calls: Call[], unparsed: number }}
 */
export function callsFromTranscript({ file, lines }: { file: string; lines: Iterable<string>; }): { calls: Call[]; unparsed: number; } {
  /** @type {FileState} */
  const state: FileState = { file, name: null, calls: new Map(), turn: [], turnNudge: false, finalText: "", afterCompaction: false, unparsed: 0 };
  for (const line of lines) {
    if (!line.includes('"type":"assistant"') && !STRING_USER.test(line)) continue;
    try {
      readEntry(state, JSON.parse(line) as TranscriptEntry);
    } catch (error) {
      state.unparsed += 1; // a line a live session was still writing: counted and reported, not guessed at
      if (!(error instanceof SyntaxError)) throw new Error(`token-cost: ${file}: ${error instanceof Error ? error.message : error}`, { cause: error });
    }
  }
  closeTurn(state);
  return { calls: [...state.calls.values()], unparsed: state.unparsed };
}

/**
 * A session NAME that appears in more than one transcript was resumed or cleared in the later ones, so the first call of each of
 * those re-reads its context; so does the first call after a compaction. Mutates and returns `calls`.
 * @param {Call[]} calls
 */
export function markRereads(calls: Call[]) {
  /** @type {Map<string, string>} the earliest transcript of each name */
  const firstFile: Map<string, string> = new Map();
  for (const call of [...calls].sort((a, b) => a.at.localeCompare(b.at))) {
    if (call.name && !firstFile.has(call.name)) firstFile.set(call.name, call.file);
  }
  for (const call of calls) {
    const later = call.name !== null && firstFile.get(call.name) !== call.file;
    call.reread = call.afterCompaction || (call.firstInSession && later);
  }
  return calls;
}

// ---- attributing calls to merged pull requests ----------------------------------------------------------

const pullKey = (/** @type {{ repository: string, number: number }} */ pull: { repository: string; number: number; }) => `${pull.repository}#${pull.number}`;

/** @template T @param {T[]} items @param {(item: T) => string | undefined} keyOf @returns {Map<string, T>} only keys that name exactly ONE item */
function uniqueIndex<T>(items: T[], keyOf: (item: T) => string | undefined): Map<string, T> {
  /** @type {Map<string, T[]>} */ const all: Map<string, T[]> = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (key !== undefined) all.set(key, [...(all.get(key) ?? []), item]);
  }
  return new Map([...all].filter(([, group]) => group.length === 1).map(([key, [only]]) => [key, only]));
}

/**
 * THE ATTRIBUTION RULE, in order, and a call that none of them reaches belongs to NO pull request and is returned as such:
 *  1. the branch its line was written on is a merged pull request's head branch;
 *  2. the session is `reviewer-<n>` and exactly one repository merged a pull request numbered n;
 *  3. the session is `worker-<n>` and exactly one merged head branch ends in `-<n>` (the row number).
 * A branch or number two repositories both claim is ambiguous and reaches none of them.
 * @param {{ calls: Call[], pulls: Pull[] }} input
 * @returns {{ byPull: Map<string, Call[]>, noPull: Call[] }}
 */
export function attributeCalls({ calls, pulls }: { calls: Call[]; pulls: Pull[]; }): { byPull: Map<string, Call[]>; noPull: Call[]; } {
  const byBranch = uniqueIndex(pulls, (p) => p.branch);
  const byNumber = uniqueIndex(pulls, (p) => String(p.number));
  const byRow = uniqueIndex(pulls, (p) => /-(\d+)$/.exec(p.branch)?.[1]);
  /** @param {Call} call */
  const pullOf = (call: Call) => {
    const named = /^(reviewer|worker)-(\d+)$/.exec(call.name ?? "");
    return (call.branch ? byBranch.get(call.branch) : undefined)
      ?? (named?.[1] === "reviewer" ? byNumber.get(named[2]) : undefined)
      ?? (named?.[1] === "worker" ? byRow.get(named[2]) : undefined);
  };
  /** @type {Map<string, Call[]>} */ const byPull: Map<string, Call[]> = new Map();
  /** @type {Call[]} */ const noPull: Call[] = [];
  for (const call of calls) {
    const pull = pullOf(call);
    if (!pull) noPull.push(call);
    else byPull.set(pullKey(pull), [...(byPull.get(pullKey(pull)) ?? []), call]);
  }
  return { byPull, noPull };
}

/** Who a call without a pull request belongs to, for the one line that says where the remainder went. @param {Call} call */
export const groupOfCall = (call: Call) => {
  if (!call.name) return "unnamed session";
  return /^(reviewer|worker)-\d+$/.test(call.name) ? `${call.name.split("-")[0]}-<n>, pull request not merged in the window` : call.name;
};

// ---- the four contributors -------------------------------------------------------------------------------

/** @param {Interval[]} intervals @param {string} at [from, to) */
const within = (intervals: Interval[], at: string) => intervals.some((i) => at >= i.from && at < i.to);
const isReviewer = (/** @type {Call} */ call: Call) => (call.name ?? "").startsWith("reviewer-");

/**
 * A review round: from a non-approving verdict (changes requested, or a comment) to the next verdict by anyone but the author, or the merge.
 * @param {{ at: string, state: string, login: string }[]} reviews @param {{ author: string, mergedAt: string }} pull @returns {Interval[]}
 */
export function reviewRounds(reviews: { at: string; state: string; login: string; }[], { author, mergedAt }: { author: string; mergedAt: string; }): Interval[] {
  const verdicts = reviews.filter((r) => r.login !== author && r.state !== "PENDING" && r.state !== "DISMISSED")
    .sort((a, b) => a.at.localeCompare(b.at));
  return verdicts.flatMap((verdict, i) => (verdict.state === "APPROVED" ? [] : [{ from: verdict.at, to: verdicts[i + 1]?.at ?? mergedAt }]));
}

/**
 * CI red: from a failed `pull_request` run of the workflow on the pull request's branch to the next run of it that passed, or the merge.
 * A run finishes at `updated_at`, which is the instant the author could first have known.
 * @param {{ event: string, conclusion: string | null, head_branch: string, created_at: string, updated_at?: string }[]} runs
 * @param {{ branch: string, mergedAt: string }} pull @returns {Interval[]}
 */
export function failureIntervals(runs: { event: string; conclusion: string | null; head_branch: string; created_at: string; updated_at?: string; }[], { branch, mergedAt }: { branch: string; mergedAt: string; }): Interval[] {
  const finished = (/** @type {typeof runs[number]} */ r: typeof runs[number]) => r.updated_at ?? r.created_at;
  const ours = runs.filter((r) => r.event === "pull_request" && r.head_branch === branch).sort((a, b) => a.created_at.localeCompare(b.created_at));
  return ours.flatMap((run, i) => {
    if (run.conclusion !== "failure") return [];
    const fixed = ours.slice(i + 1).find((r) => r.conclusion === "success");
    return [{ from: finished(run), to: fixed ? finished(fixed) : mergedAt }];
  });
}

/**
 * THE ORDER A CALL IS COUNTED IN, and each call is counted ONCE: waits (the whole turn carried no change), then re-reads (its context was
 * read again), then CI red, then review rounds (the last two only for the author's own calls, never a reviewer's). Null fits none of the four.
 * @param {Call} call @param {Pull} pull @returns {Category | null}
 */
export function categoryOf(call: Call, pull: Pull): Category | null {
  if (call.waitTurn) return "waits";
  if (call.reread) return "re-reads";
  if (isReviewer(call)) return null;
  if (within(pull.failures, call.at)) return "CI red";
  if (within(pull.rounds, call.at)) return "review rounds";
  return null;
}

/** @param {{ pull: Pull, calls: Call[] }[]} attributed @returns {{ counts: Record<Category, number>, none: number }} */
export function countContributors(attributed: { pull: Pull; calls: Call[]; }[]): { counts: Record<Category, number>; none: number; } {
  const counts = { "review rounds": 0, "CI red": 0, waits: 0, "re-reads": 0 };
  let none = 0;
  for (const { pull, calls } of attributed) {
    for (const call of calls) {
      const category = categoryOf(call, pull);
      if (category) counts[category] += 1; else none += 1;
    }
  }
  return { counts, none };
}

/** The largest of the four, the earlier in CATEGORIES on a tie; null when all four are zero. @param {Record<Category, number>} counts @returns {Category | null} */
export function biggestContributor(counts: Record<Category, number>): Category | null {
  const best = CATEGORIES.reduce((a, b) => (counts[b] > counts[a] ? b : a));
  return counts[best] === 0 ? null : best;
}

// ---- one repository's reading ----------------------------------------------------------------------------

export type RepositoryReading = { repository: string, merged: number, read: number, unread: number[], calls: number, dollars: number, unpriced: number, callsPerPull: number | null, dollarsPerPull: number | null, enough: boolean, counts: Record<Category, number>, none: number, biggest: Category | null };

/**
 * A merged pull request with no attributed call is UNREAD and out of the denominators, never a $0.00 that would pull the average down.
 * @param {{ repository: string, pulls: Pull[], byPull: Map<string, Call[]>, prices: PriceList, minimum: number }} input @returns {RepositoryReading}
 */
export function readRepository({ repository, pulls, byPull, prices, minimum }: { repository: string; pulls: Pull[]; byPull: Map<string, Call[]>; prices: PriceList; minimum: number; }): RepositoryReading {
  const mine = pulls.filter((p) => p.repository === repository);
  const attributed = mine.map((pull) => ({ pull, calls: byPull.get(pullKey(pull)) ?? [] }));
  const withCalls = attributed.filter((a) => a.calls.length > 0);
  const all = withCalls.flatMap((a) => a.calls);
  const cost = totalCost(all, prices);
  const { counts, none } = countContributors(withCalls);
  return {
    repository, merged: mine.length, read: withCalls.length, unread: attributed.filter((a) => a.calls.length === 0).map((a) => a.pull.number),
    calls: all.length, dollars: cost.dollars, unpriced: cost.unpriced, enough: mine.length >= minimum,
    callsPerPull: withCalls.length === 0 ? null : all.length / withCalls.length,
    dollarsPerPull: withCalls.length === 0 ? null : cost.dollars / withCalls.length,
    counts, none, biggest: biggestContributor(counts),
  };
}

/**
 * THE WHOLE WINDOW: every call in it, the chairman's figure (all calls over merged pull requests), and where the calls with no pull request went.
 * @param {{ calls: Call[], noPull: Call[], merged: number, prices: PriceList }} input
 */
export function readWindow({ calls, noPull, merged, prices }: { calls: Call[]; noPull: Call[]; merged: number; prices: PriceList; }) {
  const cost = totalCost(calls, prices);
  const proxy = totalCost(calls, withFiveMinuteWrites(prices));
  const remainder = totalCost(noPull, prices);
  const sums = calls.map((c) => contextOf(c.tokens)).reduce((a, b) => a + b, 0);
  const written = calls.reduce((sum, c) => sum + (costOfCall({ model: c.model, tokens: { ...c.tokens, input: 0, output: 0, cacheRead: 0 } }, prices) ?? 0), 0);
  /** @type {Map<string, number>} */ const groups: Map<string, number> = new Map();
  for (const call of noPull) groups.set(groupOfCall(call), (groups.get(groupOfCall(call)) ?? 0) + 1);
  return {
    calls: calls.length, dollars: cost.dollars, unpriced: cost.unpriced, merged,
    callsPerPull: merged === 0 ? null : calls.length / merged, dollarsPerPull: merged === 0 ? null : cost.dollars / merged,
    dollarsPerPullFiveMinuteWrites: merged === 0 ? null : proxy.dollars / merged,
    unattributed: noPull.length, unattributedDollars: remainder.dollars,
    meanContext: calls.length === 0 ? null : sums / calls.length, cacheWriteShare: cost.dollars === 0 ? null : written / cost.dollars,
    groups: [...groups].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  };
}

// ---- the section ---------------------------------------------------------------------------------------

const pct = (/** @type {number} */ part: number, /** @type {number} */ whole: number) => (whole === 0 ? "0.0" : ((part / whole) * PERCENT).toFixed(1));
const usd = (/** @type {number} */ n: number) => `$${n.toFixed(2)}`;
const one = (/** @type {number | null} */ n: number | null) => (n === null ? "no reading" : String(Number(n.toFixed(1))));

/** @param {{ measure: string, target: import("./ci-health.ts").Target, value: number | null, enough: boolean, count: string }} cells */
function row({ measure, target, value, enough, count }: { measure: string; target: import("./ci-health.ts").Target; value: number | null; enough: boolean; count: string; }) {
  const shown = value === null ? "UNREAD" : target.unit === "dollars" ? usd(value) : one(value);
  return `| ${measure} | ${targetText(target)} | ${shown} | ${count} | **${verdictOf({ value, target, enough })}** |`;
}

/** @param {RepositoryReading} r @param {Record<string, import("./ci-health.ts").Target>} targets @param {number} minimum */
function repositoryLines(r: RepositoryReading, targets: Record<string, import("./ci-health.ts").Target>, minimum: number) {
  const count = `${r.calls} attributed calls over ${r.read} of ${r.merged} merged pull requests (${r.unread.length} UNREAD)`;
  const shares = CATEGORIES.map((c) => `${c} ${r.counts[c]}`).join(", ");
  const n = r.biggest ? r.counts[r.biggest] : 0;
  const biggest = r.biggest
    ? `Biggest contributor: ${r.biggest} (${n} calls, ${pct(n, r.calls)}% of the attributed calls)`
    : "Biggest contributor: UNREAD (all four counts are 0)";
  return [
    `#### ${r.repository}`, "",
    "| Measure | Target | Reading | Count it came from | Verdict |", "|---|---|---|---|---|",
    row({ measure: "Calls per merged pull request (attributed)", target: targets.callsPerMergedPullRequest, value: r.callsPerPull, enough: r.enough, count: count }),
    row({ measure: "Dollars per merged pull request (attributed)", target: targets.dollarsPerMergedPullRequest, value: r.dollarsPerPull, enough: r.enough, count: count }),
    "", "Attributed calls only: the target is read on ALL calls in the table above, and the calls of no pull request belong to no repository.", "", biggest,
    `Counts: ${shares}, none of the four ${r.none}; together ${r.calls} attributed calls.`,
    ...(r.unpriced > 0 ? [`${r.unpriced} attributed calls ran on a model with no price: the dollars are a floor.`] : []),
    ...(r.enough ? [] : [`UNREAD above: ${r.merged} merged pull requests is under the ${minimum} a rate needs.`]),
    ...(r.unread.length > 0 ? [`UNREAD, no call attributed: ${r.unread.map((number) => `#${number}`).join(", ")}.`] : []), "",
  ];
}

/** The definitions, once. @param {PriceList} prices @param {Window} window */
function definitionLines(prices: PriceList, window: Window) {
  const hours = window.hours ? ` and ${String(window.hours.from).padStart(2, "0")}:00-${String(window.hours.to).padStart(2, "0")}:00 of each day` : "";
  return [
    `Window: ${window.since} to ${window.until} (UTC, end exclusive)${hours}.`,
    "- **Call**: one model request, counted once by its `message.id` (a request writes one transcript line per content block).",
    "- **Sessions**: every Claude Code session on the host (standing seats, spawned workers, reviewers, subagents); Claude only.",
    `- **Price**: list price per million tokens, the list read ${prices.readOn} (\`scripts/token-cost.ts\`, \`PRICE_LIST\`).`,
    "- **Attribution**: a call belongs to a merged pull request when its branch is that pull request's head, else by `reviewer-<n>` / `worker-<n>`; otherwise it belongs to NO pull request.",
    "- **Merged**: merged in the window, in either repository. Full definitions: `docs/token-cost.md`.",
  ];
}

/**
 * @param {{ readings: RepositoryReading[], whole: ReturnType<typeof readWindow>, targets: import("./ci-health.ts").Targets,
 *   prices: PriceList, window: Window, commit: string, rateLimit: string, minimum: number }} input
 */
export function renderSection({ readings, whole, targets, prices, window, commit, rateLimit, minimum }: {
        readings: RepositoryReading[]; whole: ReturnType<typeof readWindow>; targets: import("./ci-health.ts").Targets;
        prices: PriceList; window: Window; commit: string; rateLimit: string; minimum: number;
    }) {
  const t = targets.targets;
  const enough = whole.merged >= minimum;
  const allIn = `${whole.calls} calls over ${whole.merged} merged pull requests, both repositories`;
  return [
    MARKER, "### Calls and dollars per merged pull request", "",
    ...definitionLines(prices, window),
    `Script: \`scripts/token-cost.ts\` at \`${commit}\`. Rate limit seen: ${rateLimit}.`, "",
    "| Measure | Target | Reading | Count it came from | Verdict |", "|---|---|---|---|---|",
    row({ measure: "Calls per merged pull request (ALL calls)", target: t.callsPerMergedPullRequest, value: whole.callsPerPull, enough: enough, count: allIn }),
    row({ measure: "Dollars per merged pull request (ALL calls) (verdict of record: list price as reported)", target: t.dollarsPerMergedPullRequest, value: whole.dollarsPerPull, enough: enough, count: allIn }),
    row({ measure: "Same, cache writes priced at the 5-minute rate (the chairman's proxy; comparison, not the verdict)", target: t.dollarsPerMergedPullRequest, value: whole.dollarsPerPullFiveMinuteWrites, enough: enough, count: allIn }), "",
    `UNATTRIBUTED (calls that belong to no merged pull request): ${whole.unattributed} of ${whole.calls} calls (${pct(whole.unattributed, whole.calls)}%), ${usd(whole.unattributedDollars)} of ${usd(whole.dollars)}.`,
    `Unattributed by session: ${whole.groups.slice(0, TOP_GROUPS).map(([name, n]) => `${name} ${n}`).join(", ") || "none"}.`,
    `Mean context per call: ${whole.meanContext === null ? "no reading" : Math.round(whole.meanContext).toLocaleString("en-US")} tokens. Cache-write share of cost: ${whole.cacheWriteShare === null ? "no reading" : `${pct(whole.cacheWriteShare, 1)}%`}.`,
    ...(whole.unpriced > 0 ? [`${whole.unpriced} calls ran on a model with no price and are in no dollar figure.`] : []), "",
    ...readings.flatMap((r) => repositoryLines(r, t, minimum)),
  ].join("\n");
}

// ---- reading the host and GitHub -------------------------------------------------------------------------

/** @param {string} root @param {string} since @returns {string[]} transcripts written since `since`: an older file cannot hold a call in the window */
export function transcriptFiles(root: string, since: string): string[] {
  return readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())
    .flatMap((d) => readdirSync(join(root, d.name)).filter((f) => f.endsWith(".jsonl")).map((f) => join(root, d.name, f)))
    .filter((file) => statSync(file).mtimeMs >= Date.parse(since));
}

/** @param {string} root @param {Window} window @returns {{ calls: Call[], files: number, unparsed: number }} */
function readTranscripts(root: string, window: Window): { calls: Call[]; files: number; unparsed: number; } {
  const files = transcriptFiles(root, window.since);
  const all = files.map((file) => callsFromTranscript({ file, lines: readFileSync(file, "utf8").split("\n") }));
  const calls = markRereads(all.flatMap((a) => a.calls)).filter((c) => windowContains(window, c.at));
  return { calls, files: files.length, unparsed: all.reduce((sum, a) => sum + a.unparsed, 0) };
}

/** @type {string} the lowest rate-limit header any call saw */
let rateLimitSeen: string = "no call made";

/** @param {string[]} args @returns {string} */
const gh = (args: string[]): string => {
  assertNoLeakInArgv("gh", args);
  return execFileSync("gh", args, { encoding: "utf8", cwd: REPO_ROOT, maxBuffer: MAX_GH_OUTPUT_BYTES });
};

/** One real call, so the header is read off it (`gh api rate_limit` is a broken gauge, gh-api-budget.md). @param {string} path */
function ghGet<Body>(path: string): Body {
  const { headers, body } = parseInclude(gh(["api", "-i", path]));
  rateLimitSeen = `X-Ratelimit-Remaining ${headers.get("x-ratelimit-remaining")} of ${headers.get("x-ratelimit-limit")}, resource ${headers.get("x-ratelimit-resource")}, as of the last read`;
  return body as Body;
}

/** The fields of a pull request (`pulls?state=closed`) and of one of its reviews that this script reads. */
type ApiPull = { number: number, merged_at: string, updated_at: string, head: { ref: string }, user?: { login?: string } | null };
type ApiReview = { submitted_at: string, state: string, user?: { login?: string } | null };

/** Pages of closed pull requests, newest update first, until one is older than the window: a merged one cannot hide below it. @param {string} repository @param {Window} window */
function readMerged(repository: string, window: Window) {
  const merged: ApiPull[] = [];
  for (let page = 1; ; page += 1) {
    const body = ghGet<ApiPull[]>(`repos/${repository}/pulls?state=closed&sort=updated&direction=desc&per_page=${PER_PAGE}&page=${page}`);
    merged.push(...body.filter((p) => p.merged_at && windowContains(window, p.merged_at)));
    if (body.length < PER_PAGE || (body.at(-1) as ApiPull).updated_at < window.since) return merged;
  }
}

/** One day's runs of the workflow, refused when the endpoint's cap would cut it short. @param {string} repository @param {string} workflow @param {string} slice */
function readSlice(repository: string, workflow: string, slice: string) {
  const runs: Run[] = [];
  for (let page = 1; ; page += 1) {
    const body = ghGet<{ total_count: number, workflow_runs: Run[] }>(`repos/${repository}/actions/workflows/${workflow}/runs?per_page=${PER_PAGE}&created=${slice}&page=${page}`);
    if (body.total_count > SEARCH_CAP) throw new Error(`token-cost: ${repository} ${slice} holds ${body.total_count} runs, over the ${SEARCH_CAP} the endpoint returns; refusing a short list.`);
    runs.push(...body.workflow_runs);
    if (page * PER_PAGE >= body.total_count) return runs;
  }
}

/** The runs reach back before the window: a failure on Sunday night shapes Monday's calls. @param {string} repository @param {string} workflow @param {Window} window */
function readRuns(repository: string, workflow: string, window: Window) {
  const since = new Date(Date.parse(window.since) - RUN_LOOKBACK_DAYS * MS_PER_DAY).toISOString().replace(".000", "");
  const wide = { since, until: window.until };
  const byId = new Map(daySlices(wide).flatMap((slice) => readSlice(repository, workflow, slice)).map((run) => [run.id, run]));
  return inWindow([...byId.values()], wide);
}

/** @param {string} repository @param {ApiPull} pr @param {Run[]} runs @returns {Pull} one REST call: the pull request's reviews */
function pullFrom(repository: string, pr: ApiPull, runs: Run[]): Pull {
  const reviews = ghGet<ApiReview[]>(`repos/${repository}/pulls/${pr.number}/reviews?per_page=${PER_PAGE}`)
    .map((r) => ({ at: r.submitted_at, state: r.state, login: r.user?.login ?? "" }));
  const base = { branch: pr.head.ref, mergedAt: pr.merged_at };
  return {
    repository, number: pr.number, ...base, author: pr.user?.login ?? "",
    rounds: reviewRounds(reviews, { author: pr.user?.login ?? "", mergedAt: pr.merged_at }), failures: failureIntervals(runs, base),
  };
}

/** @param {string} repository @param {string} workflow @param {Window} window @returns {Pull[]} */
function readPulls(repository: string, workflow: string, window: Window): Pull[] {
  const merged = readMerged(repository, window);
  const runs = merged.length === 0 ? [] : readRuns(repository, workflow, window);
  return merged.map((pr) => pullFrom(repository, pr, runs));
}

const scriptCommit = () => {
  try {
    return execFileSync("git", ["rev-parse", `--short=${SHORT_SHA}`, "HEAD"], { encoding: "utf8", cwd: REPO_ROOT, env: sandboxGitEnv() }).trim();
  } catch (error) {
    return `unknown (${error instanceof Error ? error.message.split("\n")[0] : "git failed"})`;
  }
};

/**
 * The targets file is a state, not an exception: a checkout without it has no target, repository list or minimum to read against.
 * @param {string} file @returns {{ targets: import("./ci-health.ts").Targets } | { missing: string }}
 */
export function readTargetsFile(file: string): { targets: import("./ci-health.ts").Targets; } | { missing: string; } {
  try {
    return { targets: targetsFrom(JSON.parse(readFileSync(file, "utf8"))) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { missing: file };
    throw new Error(`token-cost: ${file} could not be read: ${error instanceof Error ? error.message : error}`, { cause: error });
  }
}

/** UNREAD says so and why; it carries no MARKER, so a later run with the file present still posts. @param {string} file */
export const unreadSection = (file: string) => [
  "### Calls and dollars per merged pull request", "",
  `**UNREAD**: \`${file}\` is missing, so there is no target, repository list or minimum to read the figures against. Nothing was measured.`,
].join("\n");

/** @param {string} flag @returns {string | undefined} */
const flagValue = (flag: string): string | undefined => process.argv.slice(2).find((arg) => arg.startsWith(`${flag}=`))?.slice(flag.length + 1);

/** @returns {Window} the week before today unless `--since=DATE`, `--until=ISO-UTC` and `--hours=FROM-TO` say otherwise (a reproduction reads an arbitrary window) */
function windowFromArgv(): Window {
  const week = weeklyWindow(new Date());
  const since = flagValue("--since");
  const hours = flagValue("--hours");
  return { since: since ? `${since}T00:00:00Z` : week.since, until: flagValue("--until") ?? week.until, ...(hours ? { hours: parseHours(hours) } : {}) };
}

/** The CI-health comment of this week is the door: one comment, one table, one window. @param {string} body @param {{ repository: string, issue: number }} on @param {string} date */
function appendToCiHealthComment(body: string, on: { repository: string; issue: number; }, date: string) {
  const comments = ghGet<{ id: number, body: string }[]>(`repos/${on.repository}/issues/${on.issue}/comments?per_page=${PER_PAGE}&since=${new Date(Date.parse(`${date}T00:00:00Z`)).toISOString()}`);
  const heading = commentHeading({ date });
  const target = comments.find((c) => c.body.startsWith(heading));
  if (!target) throw new Error(`token-cost: "${heading}" is not on #${on.issue} yet. ci-health posts it (Monday 06:43Z) and this appends to it; posting nothing of its own.`);
  if (target.body.includes(MARKER)) return `token-cost: the comment for week of ${date} already carries this reading; changing nothing.`;
  const text = `${target.body}\n\n${body}\n`;
  const leak = leakRefusalReason(text);
  if (leak) throw new Error(leak);
  const dir = mkdtempSync(join(tmpdir(), "token-cost-"));
  try {
    writeFileSync(join(dir, "comment.md"), text);
    gh(["api", "--method", "PATCH", `repos/${on.repository}/issues/comments/${target.id}`, "-F", `body=@${join(dir, "comment.md")}`, "--jq", ".html_url"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return `token-cost: appended to the CI-health comment of week ${date} on ${on.repository}#${on.issue}.`;
}

function main() {
  refuseUnknownFlags(["--since=", "--until=", "--hours=", "--transcripts=", "--post"], { entry: import.meta.url, command: "node --import tsx scripts/token-cost.ts" });
  const file = readTargetsFile(TARGETS_FILE);
  if ("missing" in file) {
    process.stdout.write(`${unreadSection(file.missing)}\n`);
    process.exitCode = 1;
    return;
  }
  const { targets } = file;
  const window = windowFromArgv();
  const transcripts = readTranscripts(flagValue("--transcripts") ?? join(homedir(), ".claude/projects"), window);
  const pulls = targets.repositories.flatMap((repository) => readPulls(repository, targets.workflow, window));
  const { byPull, noPull } = attributeCalls({ calls: transcripts.calls, pulls });
  const readings = targets.repositories.map((repository) => readRepository({ repository, pulls, byPull, prices: PRICE_LIST, minimum: targets.minimumPullRequests }));
  const whole = readWindow({ calls: transcripts.calls, noPull, merged: pulls.length, prices: PRICE_LIST });
  const section = renderSection({ readings, whole, targets, prices: PRICE_LIST, window, commit: scriptCommit(), rateLimit: rateLimitSeen, minimum: targets.minimumPullRequests });
  process.stdout.write(`${section}\n\nTranscripts read: ${transcripts.files} files, ${transcripts.unparsed} unparsable lines.\n`);
  if (process.argv.includes("--post")) process.stdout.write(`${appendToCiHealthComment(section, targets.reportOn, window.since.slice(0, "YYYY-MM-DD".length))}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  main();
}
