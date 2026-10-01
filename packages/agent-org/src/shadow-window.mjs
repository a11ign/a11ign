#!/usr/bin/env node
// @ts-check
// command: shadow-window -- ONE tick of the candidate gate beside the live one, over a copy of the state, appended to a diff record
// Row #2846 (the split, child 5d of #69): the program ADR 0040 decision 5 (1) describes and `shadow-gate.mjs` (child 4)
// only gave the instrument for. One invocation is ONE tick; running it every two minutes for 1,440 ticks is a host
// arrangement asked of `ceo` on #2623 and is NOT started by this file.
//
// THE LIVE SIDE IS RECORDED, NOT RECOMPUTED (`product-manager`'s ruling on #2846, 2026-10-01). `work-gate.mjs`'s `main()`
// has no seam to take its reads from outside and WRITES state when run (`claimStallTick`), so #2849 makes the live tick
// leave `<stateDir>/shadow-reads/<tickUtcMs>.json` = `{ tick, args, orders }` while `<stateDir>/shadow-window-open`
// exists: `args` is the exact object `decide` was called with and `orders` is `decide`'s raw return. This file runs
// only the CANDIDATE over `args` and diffs its orders against the recorded ones -- which also removes `decide`'s own
// `Date.now()` skew, so a difference here is the code and never the clock.
//
// WHAT IT WRITES, EXHAUSTIVELY: the COPY directory (emptied and refilled from the live one at the start of every
// invocation, so the candidate reads what the live gate read) and ONE appended line of the diff record. Never a
// state file, a marker or the handoff queue; the live directory is read and never written. The record path and the
// copy path are both refused when they resolve inside the live directory, because either would be a write there.
import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync }
  from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { diffOrders, refuseLiveStateDir, LIVE_STATE_DIR } from "./shadow-gate.mjs";
import { parseShadowRecord } from "./shadow-reads.mjs";
import { flagValue, refuseUnknownFlags } from "./lib/cli-flags.mjs";

/** `0` a tick was recorded, or there was none to record; `2` a path was refused or an input could not be read. */
export const EXIT = { OK: 0, REFUSED: 2 };

/** Where #2849's live tick leaves the reads, and the file inside the COPY that says the runner made that directory. */
export const READS_DIR = "shadow-reads";
export const COPY_MARKER = ".shadow-copy";
/** Handed to the candidate so one that reads local state can read the COPY; `decide` has no parameter for it. */
export const STATE_DIR_ENV = "A11IGN_SHADOW_STATE_DIR";

const SELF = fileURLToPath(import.meta.url);
/** A candidate that has not answered in this long is recorded as failed; it must not hold the next tick's turn. */
const CANDIDATE_TIMEOUT_MS = 120_000;
const CANDIDATE_MAX_BUFFER = 32 * 1024 * 1024;
const STDERR_TAIL_CHARS = 2000;

/** @param {string} path the path's real location, or its plain resolution when it does not exist yet */
function realOrResolved(path) {
  try { return realpathSync(path); } catch { return resolve(path); }
}

/** @param {string} child @param {string} parent */
function isInside(child, parent) {
  const rel = relative(realOrResolved(parent), realOrResolved(child));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Every refusal this invocation can make, made BEFORE a single read of the live directory.
 * @param {{ liveDir: string, copyDir: string, recordPath: string }} paths
 */
export function refuseBeforeReading({ liveDir, copyDir, recordPath }) {
  refuseLiveStateDir(copyDir, { liveStateDir: liveDir });
  if (isInside(copyDir, liveDir)) throw new Error(`REFUSING: the copy ${copyDir} is inside the live state directory ${liveDir}; refilling it would write there.`);
  if (isInside(recordPath, liveDir)) throw new Error(`REFUSING: the diff record ${recordPath} is inside the live state directory ${liveDir}; appending to it would write there.`);
}

/**
 * Empty `copyDir` and refill it from `liveDir`, so the candidate reads what the live gate read. Refuses a non-empty
 * directory this runner did not make: emptying one it did not make is how a mistyped path deletes somebody's files.
 * `dereference` so a symlink in the live directory becomes bytes, never a way back to a live file.
 * @param {{ liveDir: string, copyDir: string }} paths
 */
export function refreshCopy({ liveDir, copyDir }) {
  mkdirSync(copyDir, { recursive: true });
  const held = readdirSync(copyDir);
  if (held.length > 0 && !held.includes(COPY_MARKER)) {
    throw new Error(`REFUSING: ${copyDir} is not empty and was not made by this runner (no ${COPY_MARKER}); it will not be emptied.`);
  }
  for (const name of held) rmSync(join(copyDir, name), { recursive: true, force: true });
  for (const name of readdirSync(liveDir)) {
    if (name !== READS_DIR) cpSync(join(liveDir, name), join(copyDir, name), { recursive: true, dereference: true });
  }
  writeFileSync(join(copyDir, COPY_MARKER), "made by shadow-window.mjs; emptied and refilled from the live directory every tick\n");
}

/**
 * The record's last line, which is where the next tick starts. `null` for a record with no line yet.
 * @param {string} recordPath @returns {{ tickMs: number } | null}
 */
export function lastRecorded(recordPath) {
  if (!existsSync(recordPath)) return null;
  const lines = readFileSync(recordPath, "utf8").split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) return null;
  const { tickMs } = JSON.parse(lines[lines.length - 1]);
  return { tickMs };
}

/**
 * The OLDEST tick file newer than the last one recorded, or `null`. Ordered by the number in its name (the tick's UTC
 * milliseconds), never by directory order or mtime.
 * @param {{ liveDir: string, after: number | null }} where @returns {{ tickMs: number, path: string } | null}
 */
export function nextTickFile({ liveDir, after }) {
  const dir = join(liveDir, READS_DIR);
  if (!existsSync(dir)) return null;
  const found = readdirSync(dir).map((name) => ({ name, tickMs: Number(name.replace(/\.json$/, "")) }))
    .filter(({ name, tickMs }) => name.endsWith(".json") && Number.isSafeInteger(tickMs) && (after === null || tickMs > after))
    .sort((a, b) => a.tickMs - b.tickMs);
  return found.length === 0 ? null : { tickMs: found[0].tickMs, path: join(dir, found[0].name) };
}

/** The live tick's cadence (#2849: "one hour at two minutes"); a tick id is its UTC milliseconds, so ticks are counted by it. */
export const TICK_INTERVAL_MS = 120_000;

/**
 * Ticks that never reached a file between the last recorded one and this one, so "1,440 consecutive ticks" is
 * computable from the record. #2849 names a tick by its UTC milliseconds, not by a counter, so a miss is read off the
 * elapsed time: rounded to whole intervals, which absorbs a timer's seconds of jitter. `null` when nothing is missing.
 * @param {number | null} previousMs @param {number} tickMs
 * @returns {{ missing: number, firstMissingUtc: string } | null}
 */
export function gapBetween(previousMs, tickMs) {
  if (previousMs === null) return null;
  const missing = Math.round((tickMs - previousMs) / TICK_INTERVAL_MS) - 1;
  return missing < 1 ? null : { missing, firstMissingUtc: new Date(previousMs + TICK_INTERVAL_MS).toISOString() };
}

/**
 * The candidate's side of the child process: `decide(args)` from the candidate's own module, orders as JSON on stdout.
 * A child, so a candidate that exits non-zero, throws or hangs is an observation and not a crash of the runner.
 * The revive happens HERE and not in `shadowTick`: `args` crosses the process boundary as JSON, which would flatten a revived Map back to `{}`.
 * The parent leaves the tap's `$type` tags as plain objects, so they cross unchanged and `parseShadowRecord` (one reviver, #2858) restores them.
 * @param {string} modulePath
 */
async function runAsCandidateChild(modulePath) {
  const args = parseShadowRecord(readFileSync(0, "utf8"));
  const { decide } = await import(pathToFileURL(resolve(modulePath)).href);
  process.stdout.write(JSON.stringify(decide(args)));
}

/**
 * Run the candidate gate over one tick's `args`, with the COPY as the state it may read.
 * @param {{ module: string, args: unknown, copyDir: string }} job
 * @returns {{ exit: number | null, orders: any[] | null, error: string | null }}
 */
export function runCandidate({ module, args, copyDir }) {
  const run = spawnSync(process.execPath, [SELF, "--candidate-child", `--module=${module}`], {
    input: JSON.stringify(args), encoding: "utf8", timeout: CANDIDATE_TIMEOUT_MS, maxBuffer: CANDIDATE_MAX_BUFFER,
    env: { ...process.env, [STATE_DIR_ENV]: copyDir },
  });
  if (run.status !== 0) {
    const how = run.error?.message ?? (run.signal ? `killed by ${run.signal}` : "");
    return { exit: run.status, orders: null, error: `${how} ${(run.stderr ?? "").slice(-STDERR_TAIL_CHARS)}`.trim() };
  }
  try {
    const orders = JSON.parse(run.stdout);
    if (Array.isArray(orders)) return { exit: 0, orders, error: null };
  } catch { /* falls through to the one report below, which names what was wrong */ }
  return { exit: 0, orders: null, error: "exit 0 but stdout was not a JSON array of orders" };
}

/** @param {any[]} orders @returns {string[]} the distinct causes that fired, for the window's seven-day coverage rule */
const causesOf = (orders) => [...new Set(orders.map((o) => String(o?.cause ?? "")))].sort();

/**
 * A candidate that did not answer is ONE difference naming how it ended, not one per live order: nothing was said, so
 * there is nothing to line up against.
 * @param {{ exit: number | null, orders: any[] | null, error: string | null }} candidate
 */
function candidateFailure({ exit, error }) {
  return { causeKey: `candidate-exit:${exit ?? "none"}`, live: null, candidate: null, exit, error };
}

/**
 * @param {{ tickMs: number, tick: number | null, live: any[], candidate: ReturnType<typeof runCandidate>,
 *   gapBefore: ReturnType<typeof gapBetween>, now: Date }} facts
 */
export function buildRecord({ tickMs, tick, live, candidate, gapBefore, now }) {
  const answered = candidate.orders !== null;
  return {
    tick, tickMs, utc: new Date(tickMs).toISOString(), recordedAt: now.toISOString(), gapBefore,
    live, candidate: candidate.orders, candidateExit: candidate.exit,
    differences: answered ? diffOrders(live, /** @type {any[]} */ (candidate.orders)) : [candidateFailure(candidate)],
    causes: { live: causesOf(live), candidate: answered ? causesOf(/** @type {any[]} */ (candidate.orders)) : null },
  };
}

/**
 * ONE tick: refuse, refresh the copy, take the oldest unrecorded tick, run the candidate over it, append one line.
 * @param {{ liveDir?: string, copyDir: string, recordPath: string, candidate: string, now?: Date }} job
 * @returns {{ status: "QUIET" | "RECORDED", record?: ReturnType<typeof buildRecord> }}
 */
export function shadowTick({ liveDir = LIVE_STATE_DIR, copyDir, recordPath, candidate, now = new Date() }) {
  refuseBeforeReading({ liveDir, copyDir, recordPath });
  const last = lastRecorded(recordPath);
  const next = nextTickFile({ liveDir, after: last?.tickMs ?? null });
  if (next === null) return { status: "QUIET" };
  refreshCopy({ liveDir, copyDir });
  const { tick, args, orders } = JSON.parse(readFileSync(next.path, "utf8"));
  const answer = runCandidate({ module: candidate, args, copyDir });
  const record = buildRecord({ tickMs: next.tickMs, tick: Number.isInteger(tick) ? tick : null, live: orders, candidate: answer,
    gapBefore: gapBetween(last?.tickMs ?? null, next.tickMs), now });
  mkdirSync(dirname(recordPath), { recursive: true });
  appendFileSync(recordPath, `${JSON.stringify(record)}\n`);
  return { status: "RECORDED", record };
}

async function main() {
  const known = ["--live-dir=", "--copy-dir=", "--record=", "--candidate=", "--candidate-child", "--module="];
  refuseUnknownFlags(known, { entry: import.meta.url, command: "node packages/agent-org/src/shadow-window.mjs" });
  const argv = process.argv.slice(2);
  if (argv.includes("--candidate-child")) return runAsCandidateChild(String(flagValue(argv, "module")));
  const copyDir = flagValue(argv, "copy-dir"), recordPath = flagValue(argv, "record"), candidate = flagValue(argv, "candidate");
  if (!copyDir || !recordPath || !candidate) {
    process.stderr.write("usage: shadow-window.mjs --copy-dir=<dir> --record=<file.jsonl> --candidate=<module exporting decide> [--live-dir=<dir>]\n");
    process.exit(EXIT.REFUSED);
  }
  try {
    const { status, record } = shadowTick({ liveDir: flagValue(argv, "live-dir"), copyDir, recordPath, candidate });
    process.stdout.write(status === "QUIET" ? "QUIET: no tick newer than the record\n"
      : `RECORDED tick ${record?.tick} (${record?.utc}): ${record?.differences.length} difference(s)\n`);
  } catch (error) {
    process.stderr.write(`${/** @type {Error} */ (error).message}\n`);
    process.exit(EXIT.REFUSED);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) await main();
