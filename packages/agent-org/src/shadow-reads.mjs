// @ts-check
// Row #2849 (the split, child 5d-0 of #69): the live gate TAPS its own `decide` call, for the shadow-window runner (#2846).
//
// WHY A TAP AND NOT A SECOND SET OF READS. ADR 0040 decision 5 (1) says the shadow adds no GitHub calls, and a runner that
// read for itself would read at a different instant than the live gate -- every PR or label that changed between the two
// reads would show up as a "difference" that is the clock and not the code. So the live gate records the exact object it
// called `decide` with, plus what `decide` returned, and the runner replays only the CANDIDATE over `args`.
//
// DORMANT UNTIL THE MARKER EXISTS. `<stateDir>/shadow-window-open` is created by the host arrangement that opens the window
// (asked of `ceo` on #2623); nothing in this file creates it. With the marker absent a tap costs one `existsSync`, writes
// nothing and makes no directory, so merging this starts nothing.
//
// FOUR WAYS THE TAP COULD HURT THE LIVE GATE, AND THE ANSWER TO EACH:
//   1. It never changes the tick's outcome: every failure comes back as a diagnostic and on stderr, and none throws.
//   2. It is bounded: the newest `KEEP_TICKS` records stay (one hour at two minutes); 1,440 unpruned ticks is the failure.
//   3. It is atomic: a temp name in the SAME directory, then `rename`, so the runner never reads half a file.
//   4. `args` must survive a JSON round trip: that is a property of `decide`'s arguments, pinned in `shadow-reads.test.ts`.
import { existsSync, mkdirSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stateEntryPath } from "./host-config.mjs";

/** The marker whose EXISTENCE opens the window. Not read for content. */
export const SHADOW_WINDOW_MARKER = "shadow-window-open";
/** Where the records go, under the state directory. */
export const SHADOW_READS_DIR = "shadow-reads";
/** One hour of ticks at two minutes. The runner records a GAP for a tick id it never saw, so pruning loses no information it needs. */
export const KEEP_TICKS = 30;

const RECORD_NAME = /^(\d+)\.json$/;
/** A temp name never matches `RECORD_NAME`, so the runner listing the directory cannot mistake one for a tick. */
/** @param {number} tick */
const tempName = (tick) => `.${tick}.json.tmp`;
const TEMP_NAME = /^\.\d+\.json\.tmp$/;

/** @param {unknown} cause */
const causeText = (cause) => (cause instanceof Error ? cause.message : String(cause));

/**
 * Write one tick's record atomically, and return its path.
 * @param {{ dir: string, tick: number, args: unknown, orders: unknown }} record
 */
function writeRecord({ dir, tick, args, orders }) {
  mkdirSync(dir, { recursive: true });
  const temp = join(dir, tempName(tick));
  const final = join(dir, `${tick}.json`);
  writeFileSync(temp, JSON.stringify({ tick, args, orders }));
  renameSync(temp, final);
  return final;
}

/**
 * Keep the newest `keep` records and delete the rest, OLDEST first by tick id; also sweep temp debris an interrupted write left.
 * Never throws: a file that will not go is named in `diagnostics` and the others are still tried.
 * @param {string} dir @param {{ keep?: number }} [options]
 * @returns {{ removed: string[], diagnostics: string[] }}
 */
export function pruneShadowReads(dir, { keep = KEEP_TICKS } = {}) {
  /** @type {string[]} */ const removed = [];
  /** @type {string[]} */ const diagnostics = [];
  let names;
  try {
    names = readdirSync(dir);
  } catch (cause) {
    return { removed, diagnostics: [`could not list ${dir}: ${causeText(cause)}`] };
  }
  const ticks = names.filter((name) => RECORD_NAME.test(name)).sort((a, b) => Number(a.match(RECORD_NAME)?.[1]) - Number(b.match(RECORD_NAME)?.[1]));
  const stale = [...ticks.slice(0, Math.max(0, ticks.length - keep)), ...names.filter((name) => TEMP_NAME.test(name))];
  for (const name of stale) {
    try {
      unlinkSync(join(dir, name));
      removed.push(name);
    } catch (cause) {
      diagnostics.push(`could not remove ${join(dir, name)}: ${causeText(cause)}`);
    }
  }
  return { removed, diagnostics };
}

/**
 * Record one tick's `decide` call, if the shadow window is open. `args` is the exact object `decide` was called with and `orders`
 * its RAW return (before `withStalePrimaryNotice`), so the runner compares like with like.
 *
 * NEVER THROWS, and never changes what the tick does: a failure is written to `log` with its cause and returned in `diagnostic`.
 * @param {{ args: unknown, orders: unknown, tick?: number, stateDir?: string, keep?: number, log?: (line: string) => void }} tap
 * @returns {{ recorded: boolean, path?: string, diagnostic?: string }}
 */
export function tapShadowReads({ args, orders, tick = Date.now(), stateDir = stateEntryPath(""), keep = KEEP_TICKS, log = (line) => process.stderr.write(line) }) {
  try {
    if (!existsSync(join(stateDir, SHADOW_WINDOW_MARKER))) return { recorded: false };
    const dir = join(stateDir, SHADOW_READS_DIR);
    const path = writeRecord({ dir, tick, args, orders });
    const { diagnostics } = pruneShadowReads(dir, { keep });
    // The record is on disk, so a pruning failure is reported and is not a failed tap.
    for (const line of diagnostics) log(`shadow-reads: ${line}\n`);
    return { recorded: true, path };
  } catch (cause) {
    const diagnostic = `could not record tick ${tick} under ${join(stateDir, SHADOW_READS_DIR)}: ${causeText(cause)}`;
    log(`shadow-reads: ${diagnostic}\n`);
    return { recorded: false, diagnostic };
  }
}
