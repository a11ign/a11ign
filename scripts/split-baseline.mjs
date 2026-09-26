#!/usr/bin/env node
// @ts-check
// command: split-baseline -- the two readings the package split is claimed to improve (test selection, tokens per call), taken before anything moves
//
// #2610, child 0 of #69. THE SPLIT IS CLAIMED TO BUY TWO THINGS AND NOBODY HAD TAKEN EITHER READING:
//
//   1. `selection`  what a change to ONE source file of the layer packages sends to CI: the tests the selector
//                   reaches by import closure, and the tree-wide guards it runs whatever the diff touched.
//   2. `context`    what a model call in a layer session READS, per call, from the transcripts the org already
//                   writes -- cache read kept apart from fresh, because a figure that sums them is wrong by an
//                   order of magnitude in the flattering direction (`token-audit.mjs`'s own warning).
//   3. `ci-jobs`    the `ts` job's wall time on the last pull requests whose diff lay wholly in the layer.
//
// IT IS AN INSTRUMENT, NOT A REPORT: the same command over a window of the same length is what the AFTER
// reading runs, so nothing in it is chosen for the day it was first run. It CALLS the selector and the
// transcript parser rather than restating either -- `selectionFor`/`alwaysRunTests`/`narrowByDeclaredScope`
// from `select-changed-tests.mjs`, `claudeTurns` from `token-audit.mjs`, `extractRegionSection` from
// `region-paths.mjs` -- because a second copy of a walk is the thing that drifts, and a baseline taken with a
// copy would stop describing the selector the first time the selector changed.
//
// WHAT THE CONTEXT READING CANNOT SHOW is in `docs/split-baseline.md`, first paragraph, and it applies to
// every number this prints.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { refuseUnknownFlags, flagValue } from "../packages/worker-fleet/src/cli-flags.mjs";
import { sandboxGitEnv } from "../packages/guards/src/git-env.mjs";
import { claudeTurns, transcriptFiles } from "../packages/agent-org/src/token-audit.mjs";
import { extractRegionSection, regionPathsFromBody } from "../packages/agent-org/src/region-paths.mjs";
import {
  selectionFor, alwaysRunTests, narrowByDeclaredScope, testFilesToRun, packageIndex, sourceClosure, discoverTestFiles,
} from "./select-changed-tests.mjs";
import { knownPackages, readWorkspaceDependencyGraph, classify } from "./ci-changed.mjs";

/** The two packages the split moves. A parameter everywhere, so a fixture can stand in for them. */
export const LAYER_PACKAGES = ["nvda-worker", "nvda-speech"];

/** The window length the BEFORE reading used. The AFTER reading reruns with this, not with a length it likes better. */
export const DEFAULT_DAYS = 14;

/** How many merged layer-only pull requests the CI reading asks for. */
export const CI_SAMPLE = 10;

const PER_ROW_DIR = /-wt-(\d+)$/;
const MODULE_FILE = /\.(?:mjs|cjs|js|mts|cts|ts|py)$/;
const TEST_FILE = /\.test\.[a-z]+$|(?:^|\/)tests?\/|\/test_[^/]*\.py$/;
const MAX_LISTED_FILES = 100;
const TALLY_SHOWN = 12;
const SYNTHETIC = "<synthetic>";
const HEAD_SHA = /^[0-9a-f]{7,40}$/;

// ---------------------------------------------------------------- shared arithmetic

/**
 * NEAREST-RANK percentile, or `null` for no values. NEVER 0, NEVER NaN: an empty population is not a small
 * number, and a median printed over nothing is the reading this whole file exists to refuse.
 * Nearest rank (`sorted[ceil(p*n) - 1]`) is chosen because it names an OBSERVED value, so a hand count over a
 * fixture has one answer and no interpolation to argue about.
 * @param {number[]} values @param {number} p 0..1
 * @returns {number | null}
 */
export function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

const MEDIAN = 0.5;
const P90 = 0.9;

/** @param {number[]} values @returns {{ median: number, p90: number, min: number, max: number } | null} */
export function spread(values) {
  if (values.length === 0) return null;
  return {
    median: /** @type {number} */ (percentile(values, MEDIAN)),
    p90: /** @type {number} */ (percentile(values, P90)),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

// ---------------------------------------------------------------- reading 1: selection

/**
 * Every non-test source file of the layer packages, from a tracked-file list.
 *
 * A "source file" is a JS/TS module or a Python module. The selector's import closure is defined over the
 * first; a `.py` file (all of `nvda-speech`'s source) is reached by NO import edge, so the selector answers it
 * with a package fallback -- which is a reading too, and the one that package actually gets. Markdown, JSON and
 * the like are left out and COUNTED, so the exclusion is a number, not a silence.
 * @param {string[]} trackedFiles repo-relative @param {string[]} [layer]
 * @returns {{ files: string[], excluded: number }}
 */
export function layerSourceFiles(trackedFiles, layer = LAYER_PACKAGES) {
  const inLayer = trackedFiles.filter((f) => layer.some((p) => f.startsWith(`packages/${p}/`)));
  const files = inLayer.filter((f) => MODULE_FILE.test(f) && !TEST_FILE.test(f) && !f.includes("/dist/"));
  return { files: files.sort(), excluded: inLayer.length - files.length };
}

/**
 * What the `ts` job would run for a diff of exactly ONE file: the precisely-selected tests, the always-run
 * guards that survive their declared walk scope, their union (`testFilesToRun`'s own dedup, so this is the
 * run's real size and not a sum), and any package the selector falls back to wholesale.
 *
 * `guards` is the same for every file up to the scope narrowing, so the expensive walk is done ONCE by the
 * caller (`guardsOf`) and handed in.
 *
 * @param {string} file @param {{ repoRoot: string, allPackages: string[],
 *   depGraph: Record<string, string[]>, guardsOf: (input: { everyTestFile: string[], closureOf: (t: string) => Set<string> }) => Array<{ test: string, why: string }> }} ctx
 */
export function selectionForFile(file, { repoRoot, allPackages, depGraph, guardsOf }) {
  // `getPackedFiles` is stubbed because it answers the `changeset` question (would this file ship?), which runs
  // `pnpm pack` once per package per call, and `testPackages` -- the only output read here -- does not depend on it.
  const { testPackages } = classify([file], allPackages, depGraph, { repoRoot, getPackedFiles: () => new Set() });
  const { result, everyTestFile, closureOf } = selectionFor([file], { repoRoot, allPackages, testPackages });
  const { kept } = narrowByDeclaredScope(guardsOf({ everyTestFile, closureOf }), [file],
    { readSource: (rel) => readFileSync(join(repoRoot, rel), "utf8") });
  const run = testFilesToRun({ selectedTests: result.selectedTests, alwaysRun: kept, fallbackPackages: result.fallbackPackages });
  const explicit = run.filter((entry) => !entry.includes("*"));
  const viaFallback = run.filter((entry) => entry.includes("*")).flatMap((glob) => expandTestGlob(glob, everyTestFile));
  const total = new Set([...explicit, ...viaFallback]);
  return {
    file,
    selected: result.selectedTests.length,
    alwaysRun: kept.length,
    // WHAT THE `ts` JOB RUNS: explicit files UNIONED with every file a fallback glob brings in. Counting the
    // explicit ones alone made a file the selector could not place (`capture.mjs`: selected 0) look like the
    // cheapest change in the package, when it is the one that runs the package's whole suite.
    total: total.size,
    onlyViaFallback: viaFallback.filter((t) => !explicit.includes(t)).length,
    of: everyTestFile.length,
    fallbackPackages: result.fallbackPackages,
  };
}

/**
 * The test files a fallback glob (`testFilesToRun`'s last entries) stands for. The GLOB is the selector's
 * (`FALLBACK_TEST_GLOB`); only its expansion is here. A glob shape this does not know is refused, because
 * guessing an expansion would put a wrong number in a baseline that is quoted later.
 * @param {string} glob @param {string[]} everyTestFile
 */
export function expandTestGlob(glob, everyTestFile) {
  const m = /^(.*)\/\*\*\/\*(\.test\.ts)$/.exec(glob);
  if (!m) throw new Error(`split-baseline: fallback glob ${JSON.stringify(glob)} is not <dir>/**/*.test.ts; expandTestGlob does not know how to count it`);
  return everyTestFile.filter((t) => t.startsWith(`${m[1]}/`) && t.endsWith(m[2]));
}

/**
 * The selection reading over a list of files. `alwaysRunTests` is computed once and reused: it depends on
 * the tree, not on the diff, and it is the slow half.
 * @param {string[]} files @param {{ repoRoot: string, allPackages: string[] }} scope
 */
export function selectionReading(files, { repoRoot, allPackages }) {
  const depGraph = readWorkspaceDependencyGraph(repoRoot, allPackages);
  /** @type {Array<{ test: string, why: string }> | null} */
  let every = null;
  const guardsOf = (/** @type {{ everyTestFile: string[], closureOf: (t: string) => Set<string> }} */ input) => {
    every ??= alwaysRunTests(input.everyTestFile, { closureOf: input.closureOf, repoRoot });
    return every;
  };
  return files.map((file) => selectionForFile(file, { repoRoot, allPackages, depGraph, guardsOf }));
}

/**
 * Where the always-run guards LIVE, and how many of them declared a walk scope (and so can be narrowed at all).
 * The split moves a layer's files; whether it moves the guards' cost depends on which package they sit in.
 * @param {Array<{ test: string }>} guards @returns {Array<[string, number]>} packages, most guards first
 */
export function guardsByPackage(guards) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const { test } of guards) {
    const pkg = /^packages\/([^/]+)\//.exec(test)?.[1] ?? "(outside packages)";
    counts.set(pkg, (counts.get(pkg) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/**
 * The guard population of the tree: every always-run guard (before any narrowing), how many declare a walk scope,
 * how many test files there are. Called with the selector's own exports, so it cannot describe a different selector.
 * @param {{ repoRoot: string, allPackages: string[] }} scope
 */
export function guardPopulation({ repoRoot, allPackages }) {
  const packages = packageIndex(repoRoot, allPackages);
  const everyTestFile = discoverTestFiles(repoRoot, allPackages);
  const guards = alwaysRunTests(everyTestFile, { closureOf: (t) => sourceClosure(join(repoRoot, t), repoRoot, packages), repoRoot });
  const { narrowed } = narrowByDeclaredScope(guards, [], { readSource: (rel) => readFileSync(join(repoRoot, rel), "utf8") });
  return { tests: everyTestFile.length, guards: guards.length, declaringScope: narrowed.length, byPackage: guardsByPackage(guards) };
}

/**
 * Per package: min / median / max of each column, over that package's files. A package with no files has
 * `null` columns, never zeros.
 * @param {ReturnType<typeof selectionReading>} rows @param {string[]} [layer]
 */
export function selectionSummary(rows, layer = LAYER_PACKAGES) {
  return layer.map((pkg) => {
    const mine = rows.filter((r) => r.file.startsWith(`packages/${pkg}/`));
    return {
      package: pkg,
      files: mine.length,
      selected: spread(mine.map((r) => r.selected)),
      alwaysRun: spread(mine.map((r) => r.alwaysRun)),
      total: spread(mine.map((r) => r.total)),
      onlyViaFallback: spread(mine.map((r) => r.onlyViaFallback)),
      // The share of a run that is guards: the number the chairman's first claim turns on.
      guardShare: spread(mine.map((r) => (r.total === 0 ? 0 : Math.round((r.alwaysRun / r.total) * 100)))),
      fallbackFiles: mine.filter((r) => r.fallbackPackages.length > 0).length,
      of: mine.length === 0 ? null : mine[0].of,
    };
  });
}

// ---------------------------------------------------------------- reading 2: context per call

/**
 * The inclusive day window ending at `until`, `days` long. Days are UTC dates because a `Turn.day` is the
 * first ten characters of an ISO timestamp, and the two must be compared as the same kind of string.
 * @param {string} until YYYY-MM-DD @param {number} days
 */
export function windowOf(until, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || !Number.isInteger(days) || days < 1) {
    throw new Error(`window: --until=${JSON.stringify(until)} --days=${JSON.stringify(days)} is not a date and a positive whole number`);
  }
  const end = new Date(`${until}T00:00:00Z`);
  const start = new Date(end.getTime() - (days - 1) * 86_400_000);
  return { since: start.toISOString().slice(0, 10), until, days };
}

/**
 * The row a transcript belongs to, or `null`. THE JOIN IS TWO FACTS, NOT ONE: the wake prompt names the
 * session (`worker-<n>`), and the directory the transcript sits in names the worktree (`wt-<n>`). Both must
 * agree. `worker-<n>` alone is ambiguous -- the roster has STANDING seats `worker-4`... and a seat that
 * claims row #2391 is still `worker-17`, so reading `<n>` off its name would join it to row #17's Region.
 * @param {string | null} session @param {string} dir the transcript's project directory name
 * @returns {number | null}
 */
export function perRowNumber(session, dir) {
  const named = /^worker-([1-9]\d*)$/.exec(session ?? "");
  const worktree = PER_ROW_DIR.exec(dir);
  return named && worktree && named[1] === worktree[1] ? Number(named[1]) : null;
}

/**
 * Which group a row's Region puts it in. `layer` means EVERY path lies under a layer package; `mixed` means
 * some do; a row whose Region names no path is `noRegion`, never guessed into `rest`.
 * @param {string[] | null} paths null = the row could not be read @param {string[]} [layer]
 * @returns {"layer" | "rest" | "mixed" | "noRegion"}
 */
export function groupOf(paths, layer = LAYER_PACKAGES) {
  if (paths === null || paths.length === 0) return "noRegion";
  const under = paths.filter((p) => layer.some((l) => p.startsWith(`packages/${l}/`))).length;
  if (under === 0) return "rest";
  return under === paths.length ? "layer" : "mixed";
}

/** The paths of a row body's Region section. @param {string} body */
export function regionPaths(body) {
  const section = extractRegionSection(body);
  return section === null ? [] : regionPathsFromBody(section);
}

/**
 * @typedef {{ dir: string, text: string }} Transcript
 * @typedef {{ session: string | null, row: number | null, calls: import("../packages/agent-org/src/token-audit.mjs").Turn[] }} Attributed
 */

/**
 * Every transcript as its in-window calls, with the session and row it attributes to. THE PARSER IS
 * `claudeTurns`, unchanged: this adds a window and a join and nothing else.
 * @param {Transcript[]} transcripts @param {{ since: string, until: string }} window
 * @returns {Attributed[]}
 */
export function attribute(transcripts, { since, until }) {
  return transcripts.map(({ dir, text }) => {
    const turns = claudeTurns(text, "unattributed");
    const session = turns[0]?.session ?? null;
    const named = session === "unattributed" ? null : session;
    return {
      session: named,
      row: perRowNumber(named, dir),
      // `<synthetic>` is the harness's own message (an interrupt, an API error): usage all zero, NOT a model call, and
      // counted it would drag every median toward 0 -- measured, 1,686 of 88,000 calls in the first window.
      calls: turns.filter((t) => t.day >= since && t.day <= until && t.model !== SYNTHETIC),
    };
  });
}

/** The rows the context reading needs a Region for. @param {Attributed[]} attributed @returns {number[]} */
export function rowsNeeded(attributed) {
  return [...new Set(attributed.flatMap((a) => (a.row !== null && a.calls.length > 0 ? [a.row] : [])))].sort((a, b) => a - b);
}

/**
 * One group's reading. `null` distributions when there are no calls: the caller prints "N = 0", never a median.
 * @param {Attributed[]} members
 */
export function groupReading(members) {
  const calls = members.flatMap((m) => m.calls);
  const column = (/** @type {(t: import("../packages/agent-org/src/token-audit.mjs").Turn) => number} */ pick) => spread(calls.map(pick));
  return {
    // A transcript that names no session has no session to count; it is a transcript and its calls, nothing more.
    sessions: new Set(members.flatMap((m) => (m.session === null ? [] : [m.session]))).size,
    transcripts: members.length,
    calls: calls.length,
    total: column((t) => t.fresh + t.cacheRead + t.cacheWrite),
    cacheRead: column((t) => t.cacheRead),
    fresh: column((t) => t.fresh),
    cacheWrite: column((t) => t.cacheWrite),
    models: Object.fromEntries([...calls.reduce((m, t) => m.set(t.model, (m.get(t.model) ?? 0) + 1), new Map())].sort()),
  };
}

/**
 * The context reading. A transcript is placed in EXACTLY ONE bucket, and one that fits none is counted, not dropped:
 *   `unattributed`  the wake prompt names no session, so there is no row to join (never guessed into a group)
 *   `notPerRow`     it names a session, but not a per-row `worker-<n>` in `wt-<n>` (a standing seat, a reviewer, ceo)
 *   `layer` `rest` `mixed` `noRegion`   per-row worker, split by its row's Region
 * A transcript with no call inside the window contributes nothing to any N.
 *
 * @param {Attributed[]} attributed @param {Map<number, string[] | null>} regions row -> Region paths, `null` = unreadable
 * @param {string[]} [layer]
 */
export function contextReading(attributed, regions, layer = LAYER_PACKAGES) {
  const live = attributed.filter((a) => a.calls.length > 0);
  /** @type {Record<string, Attributed[]>} */
  const buckets = { unattributed: [], notPerRow: [], layer: [], rest: [], mixed: [], noRegion: [] };
  for (const a of live) {
    if (a.session === null) buckets.unattributed.push(a);
    else if (a.row === null) buckets.notPerRow.push(a);
    else buckets[groupOf(regions.get(a.row) ?? null, layer)].push(a);
  }
  return Object.fromEntries(Object.entries(buckets).map(([name, members]) => [name, groupReading(members)]));
}

// ---------------------------------------------------------------- reading 3: the ts job on layer-only PRs

/**
 * Was every file of this pull request inside the layer packages? An EMPTY file list is not "wholly" anything
 * -- GitHub truncates the list at 100 files, so `truncated` is passed by the caller and refuses.
 * @param {string[]} files @param {string[]} [layer]
 */
export function whollyInLayer(files, layer = LAYER_PACKAGES) {
  return files.length > 0 && files.every((f) => layer.some((p) => f.startsWith(`packages/${p}/`)));
}

/** @typedef {{ name: string, status?: string, conclusion?: string | null, started_at?: string | null, completed_at?: string | null }} Timed */

/** @param {Timed} item @returns {number | null} */
function secondsOf(item) {
  // ONLY A GREEN RUN HAS A DURATION WORTH QUOTING: a cancelled or failed job stops early, and its 0 s or 3 s (measured on
  // two PRs in the first reading) is how long it lived, not how long the job takes.
  if (item.status !== "completed" || item.conclusion !== "success" || !item.started_at || !item.completed_at) return null;
  const seconds = (Date.parse(item.completed_at) - Date.parse(item.started_at)) / 1000;
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

// The `ts` job is a call to `reusable-build-test.yml`, and GitHub names such a job `<caller> / <callee job>`: the
// measured name is `ts / run`. Matching only `ts` found no job on any PR -- the first reading here was N = 0 for that reason.
const TS_JOB = /^ts(?: \/ .+)?$/;
// The step that runs what the selector picked; the rest of the job is build, lint and typecheck, which the split moves too.
const TEST_STEP = /^Unit tests of the changed test files/;

/**
 * The `ts` job's wall time AND the test step's, from a workflow run's job list; `null` when there is no COMPLETED
 * `ts` job. A job still running or skipped has no duration: it is absent, not zero.
 * @param {Array<Timed & { steps?: Timed[] }>} jobs
 * @returns {{ job: number, tests: number | null } | null}
 */
export function tsTimings(jobs) {
  const job = jobs.find((j) => TS_JOB.test(j.name));
  const seconds = job ? secondsOf(job) : null;
  if (!job || seconds === null) return null;
  const step = (job.steps ?? []).find((st) => TEST_STEP.test(st.name));
  return { job: seconds, tests: step ? secondsOf(step) : null };
}

/**
 * WHAT ELSE the layer-touching pull requests changed, as a count of PRs per top-level location outside the layer
 * (`.changeset`, `docs`, `packages/lab`, ...). It answers WHY layer-only pull requests are rare, which is the fact
 * the CI reading turns on: a layer change that always carries a changeset is never "layer-only".
 * @param {string[][]} fileLists one list per pull request @param {string[]} [layer]
 * @returns {Array<[string, number]>} most common first
 */
export function outsideTally(fileLists, layer = LAYER_PACKAGES) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const files of fileLists) {
    const places = new Set(files.filter((f) => !layer.some((p) => f.startsWith(`packages/${p}/`)))
      .map((f) => (f.startsWith("packages/") ? f.split("/").slice(0, 2).join("/") : f.split("/")[0])));
    for (const place of places) counts.set(place, (counts.get(place) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// ---------------------------------------------------------------- rendering

/** @param {{ median: number, p90: number, min: number, max: number } | null} s @param {(n: number) => string} [fmt] */
function cells(s, fmt = String) {
  return s === null ? "n/a | n/a | n/a" : `${fmt(s.min)} | ${fmt(s.median)} | ${fmt(s.max)}`;
}

/** @param {ReturnType<typeof selectionSummary>} summary */
export function renderSelection(summary) {
  const lines = ["| package | files | column | min | median | max |", "|---|---:|---|---:|---:|---:|"];
  for (const s of summary) {
    for (const [name, col] of [["selected tests", s.selected], ["always-run guards", s.alwaysRun],
      ["total test files", s.total], ["of which only via package fallback", s.onlyViaFallback], ["guards as % of run", s.guardShare]]) {
      lines.push(`| ${s.package} | ${s.files} | ${name} | ${cells(/** @type {any} */ (col))} |`);
    }
  }
  return lines.join("\n");
}

/** @param {ReturnType<typeof groupReading>} g */
function contextRow(g) {
  if (g.calls === 0) return `${g.sessions} | ${g.transcripts} | 0 | NO MEDIAN (N = 0) | - | - | - | - | - |`;
  const t = /** @type {NonNullable<typeof g.total>} */ (g.total);
  const [r, f, w] = [g.cacheRead, g.fresh, g.cacheWrite].map((s) => /** @type {NonNullable<typeof s>} */ (s));
  return `${g.sessions} | ${g.transcripts} | ${g.calls} | ${t.median} | ${t.p90} | ${r.median} | ${f.median} | ${w.median} | ${r.p90} |`;
}

/** @param {ReturnType<typeof contextReading>} reading */
export function renderContext(reading) {
  const lines = ["| group | sessions | transcripts | calls | median tokens/call | p90 tokens/call | median cache read | median fresh | median cache write | p90 cache read |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|"];
  for (const [name, g] of Object.entries(reading)) lines.push(`| ${name} | ${contextRow(g)}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------- shipped fixtures (also what --self-check runs)

/** A synthetic layer-a / guards-fx repository. `lonely.mjs` is imported by nothing, so the selector falls back to its whole package (one more test file). */
export const SELECTION_FIXTURE = {
  layer: ["layer-a"],
  files: {
    "packages/layer-a/package.json": JSON.stringify({ name: "@fx/layer-a", private: true }),
    "packages/layer-a/src/core.mjs": 'import { help } from "./helper.mjs";\nexport const core = help;\n',
    "packages/layer-a/src/helper.mjs": "export const help = 1;\n",
    "packages/layer-a/src/lonely.mjs": "export const lonely = 1;\n",
    "packages/layer-a/src/core.test.ts": 'import { core } from "./core.mjs";\nvoid core;\n',
    "packages/guards-fx/package.json": JSON.stringify({ name: "@fx/guards", private: true }),
    "packages/guards-fx/src/tree-walk.test.ts":
      'import { execFileSync } from "node:child_process";\nexecFileSync("git", ["ls-files"]);\n',
    "packages/guards-fx/src/other.test.ts": 'import { thing } from "./thing.mjs";\nvoid thing;\n',
    "packages/guards-fx/src/thing.mjs": "export const thing = 1;\n",
  },
  /** By hand: core.mjs is reached by core.test.ts; helper.mjs by the same test through core.mjs; lonely.mjs by none. */
  expected: {
    "packages/layer-a/src/core.mjs": { selected: 1, alwaysRun: 1, total: 2, of: 3, viaFallback: 0, fallback: 0 },
    "packages/layer-a/src/helper.mjs": { selected: 1, alwaysRun: 1, total: 2, of: 3, viaFallback: 0, fallback: 0 },
    "packages/layer-a/src/lonely.mjs": { selected: 0, alwaysRun: 1, total: 2, of: 3, viaFallback: 1, fallback: 1 },
  },
};

/**
 * One usage line. `fresh` / `read` / `write` are the three input columns; `model` is the fixture's own label.
 * @param {string} id @param {string} ts @param {{ fresh: number, read: number, write: number, model?: string }} usage
 */
function callLine(id, ts, { fresh, read, write, model = "m" }) {
  return JSON.stringify({ timestamp: ts, message: { id, model, usage: {
    input_tokens: fresh, cache_read_input_tokens: read, cache_creation_input_tokens: write, output_tokens: 5,
  } } });
}

/** @param {number} fresh @param {number} read @param {number} write @param {string} [model] */
const u = (fresh, read, write, model) => ({ fresh, read, write, model });

/** @param {string | null} session @param {string[]} calls */
function transcriptText(session, calls) {
  const wake = session === null ? "hello" : `You are \`${session}\`, an org session in this repository.`;
  return [JSON.stringify({ type: "user", message: { role: "user", content: wake } }), ...calls].join("\n");
}

const IN = "2026-09-20T10:00:00Z";
const OUT = "2026-08-01T10:00:00Z";

/**
 * Transcripts whose per-call totals a hand count gives. Per call `fresh + cacheRead + cacheWrite`:
 *   layer  (row 501, twice: a restart is the SAME session)   1110, 2020 | 3000   -> 3 calls, median 2020, p90 3000
 *   rest   (row 502)                                          400, 500, 600, 700 -> 4 calls, median 500,  p90 700
 *   ...and a duplicated line (same message id), a call outside the window, and one transcript for each
 *   other bucket. A line repeated under one id is ONE call, which is what `claudeTurns` guarantees and
 *   this fixture keeps honest.
 */
export const CONTEXT_FIXTURE = {
  window: windowOf("2026-09-26", DEFAULT_DAYS),
  transcripts: /** @type {Transcript[]} */ ([
    { dir: "-home-agent-repos-wt-501", text: transcriptText("worker-501", [
      callLine("a1", IN, u(10, 1000, 100, "m1")), callLine("a1", IN, u(10, 1000, 100, "m1")),
      callLine("a2", IN, u(20, 2000, 0, "m1")), callLine("old", OUT, u(9, 9, 9, "m1"))]) },
    { dir: "-home-agent-repos-wt-501", text: transcriptText("worker-501", [callLine("a3", IN, u(0, 2000, 1000, "m1"))]) },
    { dir: "-home-agent-repos-wt-502", text: transcriptText("worker-502", [
      callLine("b1", IN, u(0, 300, 100, "m2")), callLine("b2", IN, u(0, 400, 100, "m2")),
      callLine("b3", IN, u(0, 500, 100, "m2")), callLine("b4", IN, u(0, 600, 100, "m2"))]) },
    { dir: "-home-agent-repos-wt-503", text: transcriptText("worker-503", [callLine("c1", IN, u(1, 1, 1, "m2"))]) },
    { dir: "-home-agent-repos-wt-504", text: transcriptText(null, [callLine("d1", IN, u(1, 1, 1, "m2"))]) },
    { dir: "-home-agent-repos-a11y-witness", text: transcriptText("worker-5", [callLine("e1", IN, u(1, 1, 1, "m2"))]) },
    { dir: "-home-agent-repos-wt-505", text: transcriptText("worker-505", [callLine("f1", IN, u(1, 1, 1, "m2"))]) },
    { dir: "-home-agent-repos-wt-506", text: transcriptText("worker-506", [callLine("g1", OUT, u(1, 1, 1, "m2"))]) },
  ]),
  regions: new Map(/** @type {Array<[number, string[] | null]>} */ ([
    [501, ["packages/nvda-worker/src/a.mjs", "packages/nvda-speech/src/b.mjs"]],
    [502, ["scripts/x.mjs"]],
    [503, ["packages/nvda-worker/src/a.mjs", "scripts/x.mjs"]],
    [505, null],
  ])),
  expected: {
    layer: { sessions: 1, transcripts: 2, calls: 3, median: 2020, p90: 3000 },
    rest: { sessions: 1, transcripts: 1, calls: 4, median: 500, p90: 700 },
    mixed: { sessions: 1, transcripts: 1, calls: 1 },
    unattributed: { sessions: 0, transcripts: 1, calls: 1 },
    notPerRow: { sessions: 1, transcripts: 1, calls: 1 },
    noRegion: { sessions: 1, transcripts: 1, calls: 1 },
  },
};

/** The same fixture with every call moved outside the window: the population is real and the answer must be N = 0. */
export const OUT_OF_WINDOW_FIXTURE = {
  window: CONTEXT_FIXTURE.window,
  transcripts: [{ dir: "-home-agent-repos-wt-501", text: transcriptText("worker-501", [callLine("z1", OUT, u(1, 1, 1, "m1"))]) }],
  regions: new Map([[501, ["packages/nvda-worker/src/a.mjs"]]]),
};

/**
 * A git-tracked synthetic tree: `discoverTestFiles` enumerates with `git ls-files`, so an untracked file is
 * invisible to the selector. `git add` alone tracks it; no commit, so no identity to write anywhere.
 * @param {Record<string, string>} files @returns {string} the root; the caller removes it
 */
export function materialise(files) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "split-baseline-")));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  const git = (/** @type {string[]} */ ...args) => execFileSync("git", ["-c", "gc.auto=0", "-c", "maintenance.auto=false", ...args],
    { cwd: root, env: sandboxGitEnv(), stdio: "ignore" });
  git("init", "-q");
  git("add", "-A");
  return root;
}

/** Runs the selection fixture and returns `{ rows, expected }` so the test and `--self-check` compare the same thing. */
export function runSelectionFixture() {
  const root = materialise(SELECTION_FIXTURE.files);
  try {
    const files = Object.keys(SELECTION_FIXTURE.expected);
    return { rows: selectionReading(files, { repoRoot: root, allPackages: ["layer-a", "guards-fx"] }), expected: SELECTION_FIXTURE.expected };
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

/** @returns {string[]} what disagreed with a hand count; empty means the pure functions still agree with it */
export function selfCheckFailures() {
  const failures = [];
  const { rows, expected } = runSelectionFixture();
  if (rows.length === 0) failures.push("selection fixture produced no rows (a fixture that reads nothing checks nothing)");
  for (const r of rows) {
    const want = /** @type {Record<string, any>} */ (expected)[r.file];
    const got = { selected: r.selected, alwaysRun: r.alwaysRun, total: r.total, of: r.of, viaFallback: r.onlyViaFallback, fallback: r.fallbackPackages.length };
    if (JSON.stringify(got) !== JSON.stringify(want)) failures.push(`selection ${r.file}: got ${JSON.stringify(got)}, hand count ${JSON.stringify(want)}`);
  }
  const attributed = attribute(CONTEXT_FIXTURE.transcripts, CONTEXT_FIXTURE.window);
  const reading = contextReading(attributed, CONTEXT_FIXTURE.regions, LAYER_PACKAGES);
  for (const [name, want] of Object.entries(CONTEXT_FIXTURE.expected)) {
    const g = /** @type {Record<string, any>} */ (reading)[name];
    const got = { sessions: g.sessions, transcripts: g.transcripts, calls: g.calls,
      ...(/** @type {Record<string, any>} */ (want).median === undefined ? {} : { median: g.total?.median, p90: g.total?.p90 }) };
    if (JSON.stringify(got) !== JSON.stringify(want)) failures.push(`context ${name}: got ${JSON.stringify(got)}, hand count ${JSON.stringify(want)}`);
  }
  const empty = contextReading(attribute(OUT_OF_WINDOW_FIXTURE.transcripts, OUT_OF_WINDOW_FIXTURE.window), OUT_OF_WINDOW_FIXTURE.regions);
  if (empty.layer.calls !== 0 || empty.layer.total !== null) failures.push("an out-of-window population reported a median instead of N = 0");
  return failures;
}

// ---------------------------------------------------------------- the CLI (the only part that touches the world)

/** @param {string[]} args */
function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** @param {string} repoRoot */
function trackedFiles(repoRoot) {
  return execFileSync("git", ["ls-files", "packages"], { cwd: repoRoot, env: sandboxGitEnv(), encoding: "utf8" }).split("\n").filter(Boolean);
}

/** @param {string} repoRoot */
function runSelection(repoRoot) {
  const allPackages = knownPackages(repoRoot);
  const { files, excluded } = layerSourceFiles(trackedFiles(repoRoot));
  const rows = selectionReading(files, { repoRoot, allPackages });
  const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot, env: sandboxGitEnv(), encoding: "utf8" }).trim();
  const pop = guardPopulation({ repoRoot, allPackages });
  const out = [`selection reading at ${head}: ${files.length} source file(s) of ${LAYER_PACKAGES.join(" + ")} (${excluded} tracked non-module file(s) left out)`, "",
    renderSelection(selectionSummary(rows)), "",
    `guard population: ${pop.guards} always-run guards of ${pop.tests} test files; ${pop.declaringScope} of them declare a walk scope (can be narrowed by a diff); `
    + `they live in ${pop.byPackage.map(([k, n]) => `${k} ${n}`).join(", ")}`, "", "### per file", "",
    "| file | selected | always-run | total | added only by fallback | package fallback |", "|---|---:|---:|---:|---:|---|",
    ...rows.map((r) => `| ${r.file} | ${r.selected} | ${r.alwaysRun} | ${r.total} | ${r.onlyViaFallback} | ${r.fallbackPackages.join(", ") || "-"} |`)];
  process.stdout.write(`${out.join("\n")}\n`);
}

/** @param {string} root @returns {Transcript[]} */
function readTranscripts(root) {
  return transcriptFiles(root).map((file) => ({ dir: basename(dirname(file)), text: readFileSync(file, "utf8") }));
}

/** One row's Region paths from its body, or null when the row cannot be read. @param {number} row */
function fetchRegion(row) {
  try {
    return regionPaths(gh(["api", `repos/{owner}/{repo}/issues/${row}`, "--jq", ".body"]));
  } catch (cause) {
    process.stderr.write(`split-baseline: could not read row #${row} (${/** @type {Error} */ (cause).message.split("\n")[0]})\n`);
    return null;
  }
}

/**
 * One line per per-row session with a call in the window, so any group membership can be rechecked by hand.
 * @param {Attributed[]} attributed @param {Map<number, string[] | null>} regions
 */
export function renderRows(attributed, regions) {
  const perRow = attributed.filter((a) => a.row !== null && a.calls.length > 0);
  const lines = ["| row | session | group | calls | Region paths |", "|---:|---|---|---:|---|"];
  for (const a of perRow.sort((x, y) => /** @type {number} */ (x.row) - /** @type {number} */ (y.row))) {
    const paths = regions.get(/** @type {number} */ (a.row)) ?? null;
    lines.push(`| #${a.row} | ${a.session} | ${groupOf(paths)} | ${a.calls.length} | ${paths === null ? "unreadable" : paths.slice(0, 3).join(", ") || "none named"}${paths !== null && paths.length > 3 ? `, ... (${paths.length})` : ""} |`);
  }
  return lines.join("\n");
}

/** @param {string} root @param {{ since: string, until: string, days: number }} window */
function runContext(root, window) {
  const attributed = attribute(readTranscripts(root), window);
  const regions = new Map(rowsNeeded(attributed).map((row) => [row, fetchRegion(row)]));
  const reading = contextReading(attributed, regions);
  const total = attributed.filter((a) => a.calls.length > 0).length;
  const out = [`context reading: window ${window.since}..${window.until} (${window.days} days, UTC), ${total} transcript(s) with a call in it, of ${attributed.length} under ${root}`,
    "", renderContext(reading), "", "### per-row sessions", "", renderRows(attributed, regions), "", "models (calls): " + JSON.stringify(Object.fromEntries(Object.entries(reading).map(([k, v]) => [k, v.models])))];
  process.stdout.write(`${out.join("\n")}\n`);
}

/** The merged pull requests of a bounded scan, with the files each changed. @param {number} scan */
function mergedPullRequests(scan) {
  return JSON.parse(gh(["pr", "list", "--state", "merged", "--limit", String(scan), "--json", "number,mergedAt,headRefOid,files"]));
}

/** One PR's `ts` timings from its own `pull_request` `ci` run, the last if it ran more than once. @param {any} pr */
function timingsOf(pr) {
  if (!HEAD_SHA.test(pr.headRefOid)) return null;
  const runs = JSON.parse(gh(["api", `repos/{owner}/{repo}/actions/runs?head_sha=${pr.headRefOid}&event=pull_request&per_page=20`])).workflow_runs;
  const all = runs.filter((/** @type {any} */ run) => run.name === "ci")
    .map((/** @type {any} */ run) => tsTimings(JSON.parse(gh(["api", `repos/{owner}/{repo}/actions/runs/${run.id}/jobs?per_page=100`])).jobs));
  return all.filter((/** @type {unknown} */ t) => t !== null).pop() ?? null;
}

/** @param {number} scan @param {"wholly" | "touching"} population which pull requests are timed */
function runCiJobs(scan, population) {
  const prs = mergedPullRequests(scan);
  // A PR listing 100 files may have more; it is left out rather than judged on a truncated list.
  const complete = prs.filter((/** @type {any} */ pr) => Array.isArray(pr.files) && pr.files.length < MAX_LISTED_FILES);
  const touching = complete.filter((/** @type {any} */ pr) => pr.files.some((/** @type {any} */ f) => LAYER_PACKAGES.some((p) => f.path.startsWith(`packages/${p}/`))));
  const wholly = touching.filter((/** @type {any} */ pr) => whollyInLayer(pr.files.map((/** @type {any} */ f) => f.path)));
  const rows = (population === "touching" ? touching : wholly).slice(0, CI_SAMPLE).map((/** @type {any} */ pr) => ({ pr: pr.number, sha: String(pr.headRefOid).slice(0, 9), t: timingsOf(pr) }));
  const jobs = rows.flatMap((/** @type {{ t: { job: number } | null }} */ r) => (r.t === null ? [] : [r.t.job]));
  const out = [`ts job on the last merged ${population === "touching" ? "layer-TOUCHING" : "layer-only"} PRs: scanned the newest ${prs.length} merged (asked for ${scan}); ${touching.length} touch the layer; `
    + `${wholly.length} lie wholly in it; asked for ${CI_SAMPLE}, reporting ${rows.length}, ${jobs.length} with a completed ts job`, "",
  "| PR | head | ts job seconds | of which test step |", "|---:|---|---:|---:|",
  ...rows.map((/** @type {any} */ r) => `| #${r.pr} | ${r.sha} | ${r.t?.job ?? "n/a"} | ${r.t?.tests ?? "n/a"} |`), "",
  jobs.length === 0 ? "NO MEDIAN (N = 0)" : `median ${percentile(jobs, MEDIAN)} s, min ${Math.min(...jobs)} s, max ${Math.max(...jobs)} s (n = ${jobs.length})`, "",
  `what else the ${touching.length} layer-touching PRs changed (PRs per location): `
    + outsideTally(touching.map((/** @type {any} */ pr) => pr.files.map((/** @type {any} */ f) => f.path))).slice(0, TALLY_SHOWN).map(([k, n]) => `${k} ${n}`).join(", ")];
  process.stdout.write(`${out.join("\n")}\n`);
}

const EXIT = { OK: 0, SELF_CHECK_FAILED: 1, USAGE: 2 };
const DEFAULT_SCAN = 300;

function selfCheck() {
  const failures = selfCheckFailures();
  process.stdout.write(failures.length === 0 ? "split-baseline self-check: PASS (selection and context agree with the hand counts)\n"
    : `split-baseline self-check: FAIL\n${failures.map((f) => `  - ${f}`).join("\n")}\n`);
  process.exit(failures.length === 0 ? EXIT.OK : EXIT.SELF_CHECK_FAILED);
}

function contextFromArgv() {
  const window = windowOf(flagValue(process.argv, "until") ?? "", Number(flagValue(process.argv, "days") ?? DEFAULT_DAYS));
  runContext(flagValue(process.argv, "claude-root") ?? join(process.env.HOME ?? "", ".claude", "projects"), window);
}

function ciJobsFromArgv() {
  const population = flagValue(process.argv, "population") ?? "wholly";
  if (population !== "wholly" && population !== "touching") return usage();
  return runCiJobs(Number(flagValue(process.argv, "scan") ?? DEFAULT_SCAN), population);
}

function main() {
  refuseUnknownFlags(["--self-check", "--repo", "--claude-root", "--until", "--days", "--scan", "--population"],
    { entry: import.meta.url, command: "node scripts/split-baseline.mjs" });
  const argv = process.argv.slice(2);
  if (argv.includes("--self-check")) return selfCheck();
  const reading = argv.find((a) => !a.startsWith("--"));
  if (reading === "selection") return runSelection(flagValue(process.argv, "repo") ?? process.cwd());
  if (reading === "context") return contextFromArgv();
  if (reading === "ci-jobs") return ciJobsFromArgv();
  return usage();
}

function usage() {
  process.stderr.write("usage: node scripts/split-baseline.mjs selection | context --until=YYYY-MM-DD [--days=14] | "
    + "ci-jobs [--scan=1500] [--population=wholly|touching] | --self-check\n");
  process.exit(EXIT.USAGE);
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
