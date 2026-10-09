#!/usr/bin/env node
// @ts-check
// command: mutate the lines a pull request ADDED, run the tests it CHANGED, and report the survivors (#3282, decided on #3213)
// NON-BLOCKING, BY THE RULE `ceo` WROTE BEFORE THE RESULT. Nothing here has an exit code that depends on a survivor:
// `MUTATION: MISSING` used to fail a pull request on paperwork, and what replaces it is a comment saying which changes
// no changed test pinned. The reading (numbers, why Stryker was not chosen) is the `## Mutation-in-CI reading` comment
// on #3213: Stryker 10 cannot run this repository's tests in its sandbox, parses no YAML/JSON/Markdown, and its
// in-place instrumentation broke #3158's baseline, so the operator set below is in-house and line-based.
//
// SCOPE IS THE LINES THE DIFF ADDED, IN NON-TEST FILES THAT A CHANGED TEST NAMES BY BASENAME. Never the whole file
// (whole-file scope on a test-only pull request gave 61 survivors, 24 of them killed by sibling tests that import the
// file, #3168), and never a fixture (data is never the subject). One hop: a file named by a changed JS test also
// names the changed files that test reaches through it.
//
// A BUDGET, PRINTED. The p90 pull request cost 588 s against a CI median of 300 s, and p90 survivors were 106. So the
// run is capped in mutants AND in wall time, says "N of M run", and lists at most 20 survivors (the rest go to the
// job summary). Lines are sampled by STRIDE, never by taking the first N: the first N is one file's top.
//
// A SURVIVOR IS NOT A SCORE. It is "a change no changed test pinned", and some are equivalent (a `<` that can never
// be equal, a shebang). No kill rate is printed anywhere, because a rate invites a target and a target invites
// writing tests to the operators.
//
// ONE RUN PER TREE. Mutants are written into the working tree and put back from a copy held in memory, so a second
// run, or a test run by hand, in the same tree reads somebody else's mutant (a baseline that went red for exactly that
// reason while this file was being written). In CI the tree is the runner's own; locally, use a worktree of your own.
//
// Usage:
//   node packages/guards/src/mutate-diff.ts <base> <head> [--max-mutants=<n>] [--budget=<seconds>]
//        [--comment=<file>] [--summary=<file>]
//
// The working tree must BE <head>: mutants are written into it and put back from a copy held in memory.
import { spawn, execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { changedFiles } from "./changed-files.mjs";
import { sandboxGitEnv } from "./git-env.mjs";
import { changedLines } from "./mutant-survivors.ts";
import { flagValue, refuseUnknownFlags } from "@a11ign/screenreader-fleet/cli-flags";

export const DEFAULT_MAX_MUTANTS = 100;
export const DEFAULT_BUDGET_SECONDS = 420;
export const LISTED_SURVIVORS = 20;
export const COMMENT_MARKER = "<!-- mutation-comment -->";
export const QUIET_MARKER = "<!-- mutation-comment:quiet -->";
const MUTANT_TIMEOUT_MS = 90_000;
const MS = 1000;
const TAIL_CHARS = 4000;
const MAX_DIFF_BYTES = 268_435_456;
const SNIPPET_LENGTH = 100;
const STRING_LITERAL_MAX = 200;
const ASSERT_GLOB = fileURLToPath(new URL("./assert-glob-not-empty.mjs", import.meta.url));

const require = createRequire(import.meta.url);
/**
 * `typescript` and `yaml` are the parsers that decide whether a mutant is a mutant or a typo. Loaded LAZILY, for the
 * reason `tree-wide-guard.ts` records above its own `require`: a process that never parses a JS or YAML mutant
 * should not pay 170-380 ms for one. `yaml` is publicly hoisted to the root (`pnpm-workspace.yaml`).
 * @param {string} name
 * @returns {any}
 */
const lazy = <T>(name: string): T => require(name);

/** One line-local text edit; `to === null` deletes the line. */
export type Edit = { op: string, from: number, len: number, to: string | null };
export type Kind = "js" | "yml" | "json" | "md";
export type Mutant = { file: string, line: number, op: string, edit: Edit, original: string, mutated: string };

// ---- operators ---------------------------------------------------------------------------------------------------

/**
 * @param {string} op @param {Record<string, string>} pairs @param {RegExp} re
 * @returns {(line: string) => Edit[]}
 */
const swaps = (op: string, pairs: Record<string, string>, re: RegExp): (line: string) => Edit[] => (line) =>
  [...line.matchAll(re)].map((m) => ({ op, from: m.index, len: m[0].length, to: pairs[m[0]] }));

const BOOL = swaps("BOOL", { true: "false", false: "true" }, /\b(true|false)\b/g);
const EQ = swaps("EQ", { "===": "!==", "!==": "===", "==": "!=", "!=": "==" },
  /===|!==|(?<![=!<>])==(?!=)|(?<![=!])!=(?!=)/g);
const LOGIC = swaps("LOGIC", { "&&": "||", "||": "&&" }, /&&|\|\|/g);
const REL = swaps("REL", { " <= ": " < ", " < ": " <= ", " >= ": " > ", " > ": " >= " }, / <= | < | >= | > /g);
const ARITH = swaps("ARITH", { " + ": " - ", " - ": " + ", " * ": " / ", " / ": " * " }, / [+\-*/] /g);

/** @type {(line: string) => Edit[]} */
const STR: (line: string) => Edit[] = (line): Edit[] => [...line.matchAll(new RegExp(`(["'])([^"'\\\\\\n]{1,${STRING_LITERAL_MAX}})\\1`, "g"))]
  .map((m) => ({ op: "STR", from: m.index, len: m[0].length, to: `${m[1]}${m[1]}` }));

/** `return <expr>;` becomes `return undefined;`. An identity (the line already says so) is dropped by `editsOf`. */
const RET = (/** @type {string} */ line: string) => {
  const at = line.indexOf("return");
  return /^\s*return [^;]+;\s*$/.test(line) ? [{ op: "RET", from: at, len: line.trimEnd().length - at, to: "return undefined;" }] : [];
};

/** `if (<cond>)` forced to true and to false: a branch no test takes, and one no test needs. */
const IF = (/** @type {string} */ line: string) => {
  const i = line.search(/\bif \(/);
  if (i < 0) return [];
  let depth = 0;
  let end = -1;
  for (let k = i + "if ".length; k < line.length && end < 0; k++) {
    if (line[k] === "(") depth++;
    else if (line[k] === ")" && --depth === 0) end = k;
  }
  if (end < 0) return [];
  return ["true", "false"].map((to) => ({ op: "IF", from: i + "if (".length, len: end - i - "if (".length, to }));
};

// A regex literal is found by where it can START (after an operator, `(`, `,`, `return` or the line's own start), so a
// division is not read as one. Stryker's 22 survivors on #3169 were anchors the other operators cannot see: an
// unanchored `package.json` path regex also accepts `docs/x/package.json`.
const REGEX_LITERAL = /(?<=^\s*|[=(,:!&|?[{;]\s*|\breturn\s+)\/(?![/*])((?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n[])+)\/[dgimsuvy]*/g;

/** A regex's leading `^` and trailing `$` dropped, one mutant each. */
const ANCHOR = (/** @type {string} */ line: string) => [...line.matchAll(REGEX_LITERAL)].flatMap((m) => {
  const body = m[1];
  const bodyAt = m.index + 1;
  /** @type {Edit[]} */
  const edits: Edit[] = [];
  if (body.startsWith("^")) edits.push({ op: "ANCHOR", from: bodyAt, len: 1, to: "" });
  if (body.endsWith("$") && !body.endsWith("\\$")) edits.push({ op: "ANCHOR", from: bodyAt + body.length - 1, len: 1, to: "" });
  return edits;
});

const NUM = (/** @type {string} */ line: string) => [...line.matchAll(/(?<=[:=] )(\d+)\s*$/g)]
  .map((m) => ({ op: "NUM", from: m.index, len: m[1].length, to: String(Number(m[1]) + 1) }));
const JSON_STRING = (/** @type {string} */ line: string) => [...line.matchAll(/(?<=: )"([^"\\]+)"/g)]
  .map((m) => ({ op: "STR", from: m.index, len: m[0].length, to: '""' }));
const DELETE = () => [{ op: "DELETE", from: 0, len: Infinity, to: null }];

/** @type {Record<Kind, ((line: string) => Edit[])[]>} */
export const OPERATORS_BY_KIND: Record<Kind, ((line: string) => Edit[])[]> = {
  js: [BOOL, EQ, LOGIC, REL, ARITH, STR, RET, IF, ANCHOR, DELETE],
  yml: [BOOL, EQ, LOGIC, NUM, DELETE],
  json: [BOOL, NUM, JSON_STRING, DELETE],
  md: [DELETE],
};

/** @param {string} file @returns {Kind} */
export function kindOf(file: string): Kind {
  if (/\.(mjs|js|ts|cjs|mts)$/.test(file)) return "js";
  if (/\.ya?ml$/.test(file)) return "yml";
  return file.endsWith(".json") ? "json" : "md";
}

/** Blank lines, comments and imports are not behaviour: a mutant there only measures the parser. */
function skipLine(/** @type {string} */ line: string, /** @type {Kind} */ kind: Kind) {
  if (!line.trim()) return true;
  if (kind === "js") return /^\s*(\/\/|\*|\/\*|import\b|export .* from )/.test(line);
  return kind === "yml" && /^\s*#/.test(line);
}

/**
 * Every edit the operators offer on one line, NO IDENTITY AMONG THEM: 28 of 2,327 mutants in the reading were
 * `return undefined;` rewritten to itself, and 20 of those counted as survivors that no test could ever kill.
 * @param {Kind} kind @param {string} line
 * @returns {Edit[]}
 */
export function editsOf(kind: Kind, line: string): Edit[] {
  return OPERATORS_BY_KIND[kind].flatMap((operator) => operator(line))
    .filter((edit) => applyEdit(line, edit) !== line);
}

/** @param {string} line @param {Edit} edit @returns {string | null} the mutated line, or null when the line is deleted */
function applyEdit(line: string, edit: Edit): string | null {
  return edit.to === null ? null : line.slice(0, edit.from) + edit.to + line.slice(edit.from + edit.len);
}

/**
 * Does the mutated file still parse? A mutant that does not is discarded and COUNTED, never run: the suite would go
 * red for the wrong reason and the mutant would be counted killed (448 of 2,803 in the reading).
 * @param {Kind} kind @param {string} file @param {string} text
 * @returns {boolean}
 */
export function parses(kind: Kind, file: string, text: string): boolean {
  if (kind === "json") return jsonParses(text);
  if (kind === "yml") return lazy<typeof import("yaml")>("yaml").parseDocument(text).errors.length === 0;
  if (kind === "md") return true;
  const ts = lazy<typeof import("typescript")>("typescript");
  const out = ts.transpileModule(text, { reportDiagnostics: true,
    fileName: file.replace(/\.mjs$/, ".mts"), compilerOptions: { target: ts.ScriptTarget.ESNext } });
  return (out.diagnostics ?? []).length === 0;
}

/** `JSON.parse` throws a SyntaxError for text that is not JSON; anything else it throws is not this question's answer. */
function jsonParses(/** @type {string} */ text: string) {
  try {
    JSON.parse(text);
    return true;
  } catch (error) {
    if (error instanceof SyntaxError) return false;
    throw error;
  }
}

/** @param {string} text @param {Mutant} mutant @returns {string} the whole file with the one mutant applied */
export function mutatedText(text: string, mutant: Mutant): string {
  const lines = text.split("\n");
  const mutated = applyEdit(lines[mutant.line - 1], mutant.edit);
  if (mutated === null) lines.splice(mutant.line - 1, 1);
  else lines[mutant.line - 1] = mutated;
  return lines.join("\n");
}

// ---- scope -------------------------------------------------------------------------------------------------------

const TEST_FILE = /\.test\.(ts|mjs)$/;
const SUPPORTED = /\.(mjs|js|ts|cjs|mts|ya?ml|json|md)$/;
const NOT_SUBJECT = /(^|\/)(fixtures|node_modules|dist)\/|\.d\.ts$|\.test\.[a-z]+$|(^|\/)pnpm-lock\.yaml$/;

/**
 * The changed non-test files a changed test NAMES, by basename, plus one hop through the changed JS files it names.
 * @param {{ changed: string[], tests: string[], read: (file: string) => string }} args
 * @returns {string[]}
 */
export function chooseSubjects({ changed, tests, read }: { changed: string[]; tests: string[]; read: (file: string) => string; }): string[] {
  const candidates = changed.filter((f) => SUPPORTED.test(f) && !NOT_SUBJECT.test(f));
  const testTexts = tests.map(read);
  const named = (/** @type {string} */ f: string) => testTexts.some((text) => text.includes(path.basename(f)));
  const direct = candidates.filter(named);
  const reachedThrough = (/** @type {string} */ f: string) => direct.some((d) => kindOf(d) === "js" && read(d).includes(path.basename(f)));
  return [...direct, ...candidates.filter((f) => !direct.includes(f) && reachedThrough(f))].sort();
}

/**
 * The scope of a range: the changed tests, the subject files, and the added line numbers of each subject.
 * @param {{ base: string, head: string, cwd: string }} args
 * @returns {{ tests: string[], subjects: { file: string, lines: Set<number> }[] }}
 */
export function scopeOf({ base, head, cwd }: { base: string; head: string; cwd: string; }): { tests: string[]; subjects: { file: string; lines: Set<number>; }[]; } {
  const range = `${base}...${head}`;
  const diff = execFileSync("git", ["diff", "-U0", "--no-renames", range], {
    cwd, env: sandboxGitEnv(), encoding: "utf8", maxBuffer: MAX_DIFF_BYTES });
  const added = changedLines(diff);
  const read = (/** @type {string} */ file: string) => readFileSync(path.join(cwd, file), "utf8");
  const present = changedFiles([range], { repoRoot: cwd }).filter((f) => existsSync(path.join(cwd, f)));
  const tests = present.filter((f) => TEST_FILE.test(f));
  const subjects = chooseSubjects({ changed: present.filter((f) => added.has(f)), tests, read })
    .map((file) => ({ file, lines: (added.get(file) as Set<number>) }));
  return { tests, subjects };
}

// ---- generation and sampling -------------------------------------------------------------------------------------

/**
 * Every mutant of one subject file on an added line, and how many did not parse.
 * @param {{ file: string, text: string, lines: Set<number> }} subject
 * @returns {{ mutants: Mutant[], discarded: number }}
 */
export function mutantsOfSubject({ file, text, lines }: { file: string; text: string; lines: Set<number>; }): { mutants: Mutant[]; discarded: number; } {
  const kind = kindOf(file);
  const source = text.split("\n");
  /** @type {Mutant[]} */
  const mutants: Mutant[] = [];
  let discarded = 0;
  for (const n of [...lines].sort((a, b) => a - b)) {
    const line = source[n - 1];
    if (line === undefined || skipLine(line, kind)) continue;
    for (const edit of editsOf(kind, line)) {
      const mutated = applyEdit(line, edit);
      const mutant = { file, line: n, op: edit.op, edit, original: line.trim().slice(0, SNIPPET_LENGTH),
        mutated: mutated === null ? "(line deleted)" : mutated.trim().slice(0, SNIPPET_LENGTH) };
      if (parses(kind, file, mutatedText(text, mutant))) mutants.push(mutant);
      else discarded++;
    }
  }
  return { mutants, discarded };
}

/**
 * At most `max` items, evenly spread across the list, in order. NEVER THE FIRST `max`: the head of the list is one
 * file's top lines, and a pull request's last file would never be looked at.
 * @template T
 * @param {T[]} items @param {number} max
 * @returns {T[]}
 */
export function sampleByStride<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  return Array.from({ length: max }, (_unused, i) => items[Math.floor((i * items.length) / max)]);
}

// ---- running -----------------------------------------------------------------------------------------------------

/**
 * One run of the changed tests, in its own process group so a timed-out run takes its workers with it. The tail of
 * the output is kept: a RED BASELINE is reported with it, because "the tests were red" is useless without which.
 * `argv` and `timeoutMs` are seams a test replaces; the defaults are the real command and the real limit.
 * @param {{ cwd: string, tests: string[], argv?: string[], timeoutMs?: number }} args
 * @returns {Promise<{ code: number | null, timedOut: boolean, ms: number, tail: string }>}
 */
export function runChangedTests({ cwd, tests, argv = [ASSERT_GLOB, ...tests, "--min=1", "--run", "--runner=rstest"], timeoutMs = MUTANT_TIMEOUT_MS }: { cwd: string; tests: string[]; argv?: string[]; timeoutMs?: number; }): Promise<{ code: number | null; timedOut: boolean; ms: number; tail: string; }> {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, argv,
      { cwd, detached: true, env: sandboxGitEnv(), stdio: ["ignore", "pipe", "pipe"] });
    let timedOut = false;
    let tail = "";
    const keep = (/** @type {Buffer} */ chunk: Buffer) => { tail = (tail + chunk).slice(-TAIL_CHARS); };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-((child.pid as number)), "SIGKILL"); } catch (error) { console.error(`mutate-diff: the timed-out run had already gone: ${error}`); }
    }, timeoutMs);
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, timedOut, ms: Date.now() - started, tail }); });
  });
}

/**
 * Write one mutant, run, and put the file back FROM THE COPY HELD HERE, whatever happened in between.
 * @param {{ cwd: string, mutant: Mutant, original: string, run: () => Promise<{ code: number | null, timedOut: boolean }> }} args
 * @returns {Promise<"killed" | "survived" | "timeout">}
 */
async function runOneMutant({ cwd, mutant, original, run }: { cwd: string; mutant: Mutant; original: string; run: () => Promise<{ code: number | null; timedOut: boolean; }>; }): Promise<"killed" | "survived" | "timeout"> {
  const target = path.join(cwd, mutant.file);
  writeFileSync(target, mutatedText(original, mutant));
  /** @type {"killed" | "survived" | "timeout"} */
  let verdict: "killed" | "survived" | "timeout" = "killed";
  try {
    const result = await run();
    if (result.timedOut) verdict = "timeout";
    else if (result.code === 0) verdict = "survived";
  } finally {
    writeFileSync(target, original);
  }
  if (readFileSync(target, "utf8") !== original) throw new Error(`mutate-diff: could not restore ${mutant.file}`);
  return verdict;
}

export type Hunt = { ran: number, killed: number, timedOut: number, survivors: Mutant[], cutByBudget: number };

/**
 * Run the mutants one at a time until they are done or the wall budget is spent. The budget gates STARTING a mutant,
 * never kills one mid-run, so a file is never left mutated by the budget.
 * @param {{ mutants: Mutant[], cwd: string, run: () => Promise<{ code: number | null, timedOut: boolean }>,
 *   budgetSeconds: number, now?: () => number }} args
 * @returns {Promise<Hunt>}
 */
export async function hunt({ mutants, cwd, run, budgetSeconds, now = Date.now }: {
        mutants: Mutant[]; cwd: string; run: () => Promise<{ code: number | null; timedOut: boolean; }>;
        budgetSeconds: number; now?: () => number;
    }): Promise<Hunt> {
  const started = now();
  /** @type {Hunt} */
  const result: Hunt = { ran: 0, killed: 0, timedOut: 0, survivors: [], cutByBudget: 0 };
  /** @type {Map<string, string>} */
  const originals: Map<string, string> = new Map();
  for (const mutant of mutants) {
    if (now() - started >= budgetSeconds * MS) { result.cutByBudget = mutants.length - result.ran; break; }
    if (!originals.has(mutant.file)) originals.set(mutant.file, readFileSync(path.join(cwd, mutant.file), "utf8"));
    const verdict = await runOneMutant({ cwd, mutant, original: (originals.get(mutant.file) as string), run });
    result.ran++;
    if (verdict === "survived") result.survivors.push(mutant);
    else if (verdict === "timeout") result.timedOut++;
    else result.killed++;
  }
  return result;
}

// ---- the whole run -----------------------------------------------------------------------------------------------

export type Report = { tests: string[], subjects: string[], generated: number, discarded: number, eligible: number, planned: number, maxMutants: number, budgetSeconds: number, baselineSeconds: number | null, baselineRed: boolean, baselineTail: string, hunt: Hunt };

/** @returns {Hunt} */
const nothingRan = (): Hunt => ({ ran: 0, killed: 0, timedOut: 0, survivors: [], cutByBudget: 0 });

/**
 * How many mutants the budget can afford, from what one run of the tests actually cost: a cap that ignores the
 * measured cost is a cap that stops mid-list, and a prefix of a sorted list is one file's top.
 * @param {{ maxMutants: number, budgetSeconds: number, baselineSeconds: number }} args
 * @returns {number}
 */
export function affordable({ maxMutants, budgetSeconds, baselineSeconds }: { maxMutants: number; budgetSeconds: number; baselineSeconds: number; }): number {
  return Math.max(1, Math.min(maxMutants, Math.floor(budgetSeconds / Math.max(baselineSeconds, 1))));
}

/**
 * The pipeline over injected seams: the scope, the file reads and the test run are arguments, so a test can drive
 * it with a fake clock and a real tiny repository.
 * @param {{ cwd: string, scope: ReturnType<typeof scopeOf>, run: () => Promise<{ code: number | null, timedOut: boolean, ms: number, tail?: string }>,
 *   maxMutants: number, budgetSeconds: number, now?: () => number }} args
 * @returns {Promise<Report>}
 */
export async function mutateDiff({ cwd, scope, run, maxMutants, budgetSeconds, now }: {
        cwd: string; scope: ReturnType<typeof scopeOf>; run: () => Promise<{ code: number | null; timedOut: boolean; ms: number; tail?: string; }>;
        maxMutants: number; budgetSeconds: number; now?: () => number;
    }): Promise<Report> {
  const found = scope.subjects.map(({ file, lines }) =>
    mutantsOfSubject({ file, text: readFileSync(path.join(cwd, file), "utf8"), lines }));
  const eligible = found.flatMap((f) => f.mutants);
  const base = { tests: scope.tests, subjects: scope.subjects.map((s) => s.file), maxMutants, budgetSeconds,
    discarded: found.reduce((sum, f) => sum + f.discarded, 0), eligible: eligible.length };
  const generated = base.eligible + base.discarded;
  if (eligible.length === 0 || scope.tests.length === 0) {
    return { ...base, generated, planned: 0, baselineSeconds: null, baselineRed: false, baselineTail: "", hunt: nothingRan() };
  }
  const baseline = await run();
  if (baseline.code !== 0) {
    return { ...base, generated, planned: 0, baselineSeconds: baseline.ms / MS, baselineRed: true,
      baselineTail: baseline.tail ?? "", hunt: nothingRan() };
  }
  const cap = affordable({ maxMutants, budgetSeconds, baselineSeconds: baseline.ms / MS });
  const planned = sampleByStride(eligible, cap);
  const result = await hunt({ mutants: planned, cwd, run, budgetSeconds, now });
  return { ...base, generated, planned: planned.length, baselineSeconds: baseline.ms / MS, baselineRed: false, baselineTail: "", hunt: result };
}

// ---- rendering ---------------------------------------------------------------------------------------------------

/**
 * A markdown code span that cannot be closed from inside: the delimiter is longer than any backtick run in the text.
 * The text is a line of the pull request's own source, so it is untrusted, and this comment is posted by a bot.
 * @param {string} text
 * @returns {string}
 */
export function codeSpan(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const fence = "`".repeat(Math.max(0, ...runs.map((r) => r.length)) + 1);
  return `${fence} ${text.replace(/\s+/g, " ")} ${fence}`;
}

/** @param {Mutant[]} survivors @returns {string[]} survivors grouped by file, then line, each with both lines */
function survivorLines(survivors: Mutant[]): string[] {
  /** @type {Map<string, Mutant[]>} */
  const byFile: Map<string, Mutant[]> = new Map();
  for (const s of survivors) byFile.set(s.file, [...(byFile.get(s.file) ?? []), s]);
  return [...byFile].sort(([a], [b]) => a.localeCompare(b)).flatMap(([file, list]) => [
    `- ${codeSpan(file)}`,
    ...list.sort((a, b) => a.line - b.line || a.op.localeCompare(b.op)).flatMap((s) => [
      `  - line ${s.line} (${s.op}): ${codeSpan(s.original)}`,
      `    became ${codeSpan(s.mutated)}`,
    ]),
  ]);
}

/** @param {Report} report @returns {string} the sentence that says how much was looked at */
function ranSentence(report: Report): string {
  const { hunt: h } = report;
  const cut = h.cutByBudget > 0 ? ` The ${report.budgetSeconds} s wall budget ended the run: ${h.cutByBudget} planned mutants never ran.` : "";
  const stride = report.eligible > report.planned
    ? ` Mutants were sampled by stride from ${report.eligible}, caps ${report.maxMutants} mutants and ${report.budgetSeconds} s.`
    : ` Caps: ${report.maxMutants} mutants, ${report.budgetSeconds} s.`;
  const discarded = report.discarded > 0 ? ` ${report.discarded} generated mutants did not parse and were discarded, not run.` : "";
  const timeouts = h.timedOut > 0 ? ` ${h.timedOut} timed out and count as caught.` : "";
  return `**${h.ran} of ${report.eligible} mutants run** on the lines this pull request added.${stride}${cut}${discarded}${timeouts}`;
}

const WHAT_A_SURVIVOR_IS = "A survivor is a change no changed test pinned; some are equivalent (the change cannot be observed). "
  + "This is a reading, not a score, and it fails nothing.";

/**
 * The comment: the header, at most `LISTED_SURVIVORS` survivors, and where the rest are.
 * @param {Report} report
 * @returns {string}
 */
export function renderComment(report: Report): string {
  if (report.baselineRed) {
    return [COMMENT_MARKER, "**Mutation (non-blocking): not run.** The changed tests were already RED on the unmutated "
      + "head, so every mutant would have read as caught for the wrong reason. Fix the tests; this comment updates on the next push."].join("\n");
  }
  if (report.hunt.ran === 0) {
    return [COMMENT_MARKER, QUIET_MARKER, "**Mutation (non-blocking):** nothing to mutate. No changed test names a non-test file "
      + "this pull request added lines to."].join("\n");
  }
  const { survivors } = report.hunt;
  const shown = survivors.slice(0, LISTED_SURVIVORS);
  const rest = survivors.length - shown.length;
  return [COMMENT_MARKER, `**Mutation (non-blocking): ${survivors.length} survivor${survivors.length === 1 ? "" : "s"}.** ${ranSentence(report)}`,
    "", WHAT_A_SURVIVOR_IS, "", ...survivorLines(shown),
    ...(rest > 0 ? ["", `${rest} more survivors are listed in this run's job summary (at most ${LISTED_SURVIVORS} here).`] : []),
  ].join("\n");
}

/**
 * The job summary: everything the comment cut, and what was looked at. Written with no token: a write to
 * `GITHUB_STEP_SUMMARY` is the first surface and the comment the second.
 * @param {Report} report
 * @returns {string}
 */
export function renderSummary(report: Report): string {
  const head = ["## Mutation (non-blocking)", "", report.baselineRed
    ? "The changed tests were already red on the unmutated head, so no mutant was run."
    : report.hunt.ran === 0 ? "Nothing to mutate: no changed test names a non-test file this pull request added lines to."
      : ranSentence(report), "", WHAT_A_SURVIVOR_IS, "",
  `Changed tests: ${report.tests.length === 0 ? "none" : report.tests.map(codeSpan).join(", ")}`,
  `Subject files: ${report.subjects.length === 0 ? "none" : report.subjects.map(codeSpan).join(", ")}`,
  report.baselineSeconds === null ? "" : `One run of the changed tests took ${report.baselineSeconds.toFixed(1)} s.`, ""];
  const survivors = report.hunt.survivors.length === 0 ? ["No survivors in the mutants that ran."] : survivorLines(report.hunt.survivors);
  const tail = report.baselineRed ? ["", "The end of the red run's output:", "", "~~~", report.baselineTail.replaceAll("~~~", "~ ~ ~"), "~~~"] : [];
  return [...head, ...(report.baselineRed ? [] : survivors), ...tail, ""].join("\n");
}

// ---- command line ------------------------------------------------------------------------------------------------

/** @param {string | undefined} value @param {number} fallback @returns {number} */
export function positive(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error(`expected a positive integer, got ${JSON.stringify(value)}`);
  return n;
}

/**
 * The mutants are written into the working tree, so it must BE the head that was named: a diff against one commit
 * with the tests of another reports survivors of nothing.
 * @param {string} cwd @param {string} head
 */
function assertTreeIsHead(cwd: string, head: string) {
  const rev = (/** @type {string} */ r: string) => execFileSync("git", ["rev-parse", `${r}^{commit}`], { cwd, env: sandboxGitEnv(), encoding: "utf8" }).trim();
  if (rev(head) !== rev("HEAD")) throw new Error(`the working tree is at ${rev("HEAD")}, not ${head} (${rev(head)}): check out the head first`);
}

async function main() {
  const argv = process.argv.slice(2);
  refuseUnknownFlags(["--max-mutants", "--budget", "--comment", "--summary"], {
    entry: import.meta.url, argv, command: "node packages/guards/src/mutate-diff.ts" });
  const [base, head] = argv.filter((a) => !a.startsWith("--"));
  if (!base || !head) {
    console.error("usage: node packages/guards/src/mutate-diff.ts <base> <head> [--max-mutants=<n>] [--budget=<seconds>] [--comment=<file>] [--summary=<file>]");
    process.exit(2);
  }
  const cwd = process.cwd();
  assertTreeIsHead(cwd, head);
  const scope = scopeOf({ base, head, cwd });
  const report = await mutateDiff({ cwd, scope, run: () => runChangedTests({ cwd, tests: scope.tests }),
    maxMutants: positive(flagValue(argv, "max-mutants"), DEFAULT_MAX_MUTANTS), budgetSeconds: positive(flagValue(argv, "budget"), DEFAULT_BUDGET_SECONDS) });
  const comment = flagValue(argv, "comment");
  const summary = flagValue(argv, "summary");
  if (comment) writeFileSync(comment, `${renderComment(report)}\n`);
  if (summary) writeFileSync(summary, renderSummary(report));
  console.log(renderSummary(report));
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  await main();
}
