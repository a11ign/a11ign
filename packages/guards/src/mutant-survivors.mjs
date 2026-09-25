#!/usr/bin/env node
// @ts-check
// command: choose mutants on a diff's changed lines by machine, run the named tests against each, and list the survivors
// MACHINE-CHOSEN MUTANTS -- ADVISORY, BOUNDED, AND NEVER A REFUSAL (#2415, `ceo`'s ruling 1 on #928).
//
// RUN BY HAND, AND WIRED INTO NOTHING. The replay over the three refusals did not clear the ruling's bar
// (`docs/mutant-replay.md`: NULL RESULT), so `ceo` ruled that this file is not called from `pr-open.mjs` and is not an npm
// script. It stays so the record can be reproduced, not because the tool is adopted.
//
// AUTHOR-CHOSEN MUTANTS MEASURE DILIGENCE, NOT COVERAGE. On #2368 the author ran 13 mutants, every one red, and
// the reviewer still found the path no test exercised. `mutation-check.mjs` cannot help there: it applies the ONE
// mutation its caller supplies and has no operator table, no line targeting and no idea what changed. This file is
// the part it lacks -- WHO CHOOSES -- and nothing else: applying a mutant, proving the file came back byte for
// byte, and reading whether the test bit are all `mutation-check.mjs`'s, called as a subprocess per mutant and
// never restated (its exit codes are the contract: 0 bites, 1 survived, 2 refused, 3 restore failed).
//
// WHAT IT CHOOSES. Only lines the diff ADDED, in source files (never a test file: mutating the test proves
// nothing about the test). Each operator is a line-local text edit -- no parser and no mutation-tool
// dependency -- so a mutant can be a syntax error, and then the suite goes red for the wrong reason and the
// mutant is counted KILLED. That error runs one way: it can hide a survivor, never invent one.
//
// THE THREE RULINGS THIS BUILDS TO.
//   1. ADVISORY. `renderSurvivors` lists survivors; nothing here has an exit code that depends on one.
//      Equivalent mutants make the list noisy, so it is CAPPED and SAYS THE CAP and how many it cut.
//   2. BOUNDED. Only the tests it is given run, only on changed lines, under a wall-clock budget. Over budget
//      it says "DID NOT FINISH" and how many mutants never ran: it never silently lists fewer.
//   3. GATED ON A REPLAY (`docs/mutant-replay.md`), WHICH DID NOT PASS. The operators were written AFTER the three
//      refusals were read, so the replay is in-sample; the record says so and reads NULL RESULT.
//
// Usage:
//   node packages/guards/src/mutant-survivors.mjs run --base=<rev> --test='<shell>' [--budget=<seconds>] [--cap=<n>] [--json]
//   node packages/guards/src/mutant-survivors.mjs apply --file=<path> --line=<n> --operator=<id> --occurrence=<k>
//
// `apply` is what `mutation-check.mjs` is handed as its `--mutate` command; it exits 2 when the mutant does not exist.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, realpathSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import { sandboxGitEnv } from "./git-env.mjs";

export const DEFAULT_CAP = 10;
export const DEFAULT_BUDGET_SECONDS = 300;
const MS = 1000;
const MAX_DIFF_BYTES = 256 * 1024 * 1024;
const MUTATE = fileURLToPath(new URL("./mutation-check.mjs", import.meta.url));
const SELF = fileURLToPath(import.meta.url);
// `mutation-check.mjs`'s own exit codes, named because every branch below reads them.
const EXIT = { KILLED: 0, SURVIVED: 1, REFUSED: 2, RESTORE_FAILED: 3 };

/** @typedef {{ start: number, end: number, replacement: string }} Site */
/** @typedef {{ id: string, why: string, sites: (line: string) => Site[] }} Operator */
/** @typedef {{ file: string, line: number, operator: string, occurrence: number, before: string, after: string }} Mutant */

/**
 * The end of the `(` at `open`, and the top-level pieces between them. Quotes are skipped so a `,` or `)` inside
 * a string does not split or close; `null` when the parenthesis is not closed on this line.
 * @param {string} text
 * @param {number} open
 * @returns {{ close: number, args: { start: number, end: number }[] } | null}
 */
function balanced(text, open) {
  const args = [];
  let depth = 0;
  let quote = "";
  let start = open + 1;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === "\\") i++; else if (c === quote) quote = ""; continue; }
    if (c === "'" || c === '"' || c === "`") quote = c;
    else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === "," && depth === 1) { args.push({ start, end: i }); start = i + 1; }
    if (depth === 0) { args.push({ start, end: i }); return { close: i, args }; }
  }
  return null;
}

// Words that sit before a `(` without being a call, and so must not have their "arguments" replaced.
const NOT_A_CALL = new Set(["if", "for", "while", "switch", "catch", "function", "async", "return", "typeof",
  "await", "new", "import", "export", "constructor", "super"]);
const CALLEE = /(?<![\w$.])([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\(/g;
const BARE_NAME = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;
const A_LITERAL = new Set(["undefined", "null", "true", "false", "this"]);

/**
 * Every call argument that is a bare name or member path, as a site to replace with `[]`. The reviewer's own
 * mutant on #2384 (`rejectedAsTruncated(rejected)` -> `rejectedAsTruncated([])`): a value that a test never makes
 * non-empty, or never reads back, survives it. A definition (`function f(a, b)`, `f(a) {`) is not a call.
 * @param {string} line
 * @returns {Site[]}
 */
function argumentSites(line) {
  /** @type {Site[]} */
  const sites = [];
  for (const m of line.matchAll(CALLEE)) {
    const open = m.index + m[0].length - 1;
    const parsed = balanced(line, open);
    const isDefinition = /\bfunction\s*\*?\s*$/.test(line.slice(0, m.index))
      || (parsed !== null && /^\s*\{/.test(line.slice(parsed.close + 1)));
    if (NOT_A_CALL.has(m[1]) || !parsed || isDefinition) continue;
    for (const { start, end } of parsed.args) {
      const text = line.slice(start, end);
      const lead = text.length - text.trimStart().length;
      const name = text.trim();
      if (BARE_NAME.test(name) && !A_LITERAL.has(name)) {
        sites.push({ start: start + lead, end: start + lead + name.length, replacement: "[]" });
      }
    }
  }
  return sites;
}

/**
 * A condition forced false: an `if (...)` condition, and the test of a `cond ? a : b`. What the ternary form
 * finds is the reviewer's second mutant on #2392 (`statusPageField` forced to return `""`).
 * @param {string} line
 * @returns {Site[]}
 */
function conditionSites(line) {
  /** @type {Site[]} */
  const sites = [];
  for (const m of line.matchAll(/\bif\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    const parsed = balanced(line, open);
    if (parsed) sites.push({ start: open + 1, end: parsed.close, replacement: "false" });
  }
  for (const m of line.matchAll(/([A-Za-z_$][\w$.]*(?:\([^()]*\))?)\s\?\s/g)) {
    sites.push({ start: m.index, end: m.index + m[1].length, replacement: "false" });
  }
  return sites;
}

/**
 * `return <expr>;` on one line, the expression replaced by `null`: the function's result is never used by any
 * test that still passes.
 * @param {string} line
 * @returns {Site[]}
 */
function returnSites(line) {
  const m = /^(\s*return\s+)(.+?);\s*$/.exec(line);
  if (!m || /^(null|undefined)$/.test(m[2])) return [];
  return [{ start: m[1].length, end: m[1].length + m[2].length, replacement: "null" }];
}

const FLIPS = [["===", "!=="], ["!==", "==="], ["&&", "||"], ["||", "&&"], ["??", "||"],
  [" >= ", " > "], [" <= ", " < "], [" > ", " >= "], [" < ", " <= "]];

/**
 * A comparison or logical operator reversed or shifted by one. Never `<`/`>` without spaces, which are also
 * generics, arrows and markup.
 * @param {string} line
 * @returns {Site[]}
 */
function flipSites(line) {
  /** @type {Site[]} */
  const sites = [];
  for (const [from, to] of FLIPS) {
    for (let at = line.indexOf(from); at !== -1; at = line.indexOf(from, at + from.length)) {
      sites.push({ start: at, end: at + from.length, replacement: to });
    }
  }
  return sites.sort((a, b) => a.start - b.start);
}

/**
 * A `.sort(...)` removed: the reviewer's first mutant on #2384 ("URL sort removed"), and the only one of hers
 * that did bite -- kept because an ordering nobody pins is a real survivor class.
 * @param {string} line
 * @returns {Site[]}
 */
function sortSites(line) {
  const sites = [];
  for (const m of line.matchAll(/\.sort\(/g)) {
    const parsed = balanced(line, m.index + m[0].length - 1);
    if (parsed) sites.push({ start: m.index, end: parsed.close + 1, replacement: "" });
  }
  return sites;
}

/**
 * `...expr` -> `...[]`, valid in an object, an array and an argument list alike, so what a spread contributed is
 * gone and the line still parses.
 * @param {string} line
 * @returns {Site[]}
 */
function spreadSites(line) {
  const sites = [];
  for (const m of line.matchAll(/\.\.\.(\(|[A-Za-z_$][\w$.]*\(?)/g)) {
    const from = m.index + 3;
    const open = m[1].endsWith("(") ? from + m[1].length - 1 : -1;
    const parsed = open === -1 ? null : balanced(line, open);
    const end = parsed ? parsed.close + 1 : from + m[1].length;
    if (!m[1].endsWith("(") || parsed) sites.push({ start: from, end, replacement: "[]" });
  }
  return sites;
}

/**
 * THE OPERATOR TABLE, IN PRIORITY ORDER: when the budget cannot cover everything, the operators that find
 * "this value never reaches anything a test reads" run first and the arithmetic-style ones last.
 * @type {Operator[]}
 */
export const OPERATORS = [
  { id: "arg-empty", why: "an argument replaced with [] -- a value no test makes non-empty", sites: argumentSites },
  { id: "cond-false", why: "a condition forced false -- a branch no test takes", sites: conditionSites },
  { id: "return-null", why: "a returned value replaced with null -- a result no test reads", sites: returnSites },
  { id: "sort-removed", why: "a .sort() removed -- an ordering no test pins", sites: sortSites },
  { id: "spread-emptied", why: "a spread replaced with [] -- a contribution no test reads", sites: spreadSites },
  { id: "flip", why: "a comparison or logical operator reversed -- a boundary no test crosses", sites: flipSites },
];

const SOURCE_FILE = /\.(mjs|cjs|js|mts|ts)$/;
const NOT_SOURCE = /(\.test\.|\.d\.ts$|(^|\/)(node_modules|dist|docs|\.changeset)\/)/;
const NOT_CODE = /^\s*(\/\/|\*|\/\*|import\s|export\s+\{)/;

/**
 * The lines a unified diff ADDED, by file and new line number. `git diff -U0` is what this reads; a deleted
 * file and a pure deletion contribute nothing, because there is nothing new to break.
 * @param {string} diff
 * @returns {Map<string, Set<number>>}
 */
export function changedLines(diff) {
  /** @type {Map<string, Set<number>>} */
  const changed = new Map();
  let file = null;
  for (const row of diff.split("\n")) {
    const header = /^\+\+\+ b\/(.+)$/.exec(row);
    if (header) { file = header[1]; continue; }
    const hunk = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/.exec(row);
    if (!hunk || file === null) continue;
    const first = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    if (!changed.has(file)) changed.set(file, new Set());
    for (let n = first; n < first + count; n++) /** @type {Set<number>} */ (changed.get(file)).add(n);
  }
  return changed;
}

/**
 * Every mutant on a changed line of one source file, in priority order (operator, then line, then site).
 * @param {string} file
 * @param {string} text
 * @param {Set<number>} lines
 * @returns {Mutant[]}
 */
function mutantsOfFile(file, text, lines) {
  const source = text.split("\n");
  /** @type {Mutant[]} */
  const found = [];
  for (const operator of OPERATORS) {
    for (const n of [...lines].sort((a, b) => a - b)) {
      const line = source[n - 1];
      if (line === undefined || NOT_CODE.test(line)) continue;
      operator.sites(line).forEach((site, occurrence) => {
        const after = line.slice(0, site.start) + site.replacement + line.slice(site.end);
        found.push({ file, line: n, operator: operator.id, occurrence, before: line.trim(), after: after.trim() });
      });
    }
  }
  return found;
}

/**
 * The mutants of a diff, ROUND-ROBIN ACROSS FILES: a 125-line data block in one file must not spend the whole
 * budget before a second file is looked at.
 * @param {Map<string, Set<number>>} changed
 * @param {(file: string) => string | null} read the file's current text, or null when it is not there
 * @returns {Mutant[]}
 */
export function chooseMutants(changed, read) {
  const perFile = [...changed.keys()].sort()
    .filter((file) => SOURCE_FILE.test(file) && !NOT_SOURCE.test(file))
    .map((file) => ({ file, text: read(file) }))
    .filter((f) => f.text !== null)
    .map((f) => mutantsOfFile(f.file, /** @type {string} */ (f.text), /** @type {Set<number>} */ (changed.get(f.file))));
  /** @type {Mutant[]} */
  const ordered = [];
  for (let round = 0; perFile.some((list) => round < list.length); round++) {
    for (const list of perFile) if (round < list.length) ordered.push(list[round]);
  }
  return ordered;
}

/**
 * The source text with one mutant applied, or null when no such mutant exists at that line (the file changed
 * under it, or the operator has fewer sites than `occurrence`).
 * @param {string} text
 * @param {{ line: number, operator: string, occurrence: number }} at
 * @returns {string | null}
 */
export function applyMutant(text, { line, operator, occurrence }) {
  const source = text.split("\n");
  const original = source[line - 1];
  const site = OPERATORS.find((o) => o.id === operator)?.sites(original ?? "")[occurrence];
  if (original === undefined || !site) return null;
  source[line - 1] = original.slice(0, site.start) + site.replacement + original.slice(site.end);
  return source.join("\n");
}

/**
 * @typedef {{ total: number, ran: number, killed: number, unknown: number, budgetSeconds: number,
 *   survivors: Mutant[], finished: boolean, restoreFailed: Mutant | null }} Hunt
 */

/**
 * Run the mutants one at a time until they are done or the budget is spent.
 *
 * THE BUDGET GATES STARTING A MUTANT, NEVER KILLS ONE: a mutant killed mid-run leaves its file mutated, which is
 * the exit-3 state `mutation-check.mjs` exists to report. The last mutant may therefore run past the budget by
 * its own duration. A restore that fails (exit 3) STOPS the hunt at once: every later result would be read off
 * a tree that is not what it was.
 * @param {{ mutants: Mutant[], runMutant: (mutant: Mutant) => number, budgetSeconds: number,
 *   now?: () => number }} args
 * @returns {Hunt}
 */
export function hunt({ mutants, runMutant, budgetSeconds, now = Date.now }) {
  const started = now();
  /** @type {Hunt} */
  const result = { total: mutants.length, ran: 0, killed: 0, unknown: 0, budgetSeconds, survivors: [],
    finished: true, restoreFailed: null };
  for (const mutant of mutants) {
    if (now() - started >= budgetSeconds * MS) { result.finished = false; break; }
    const code = runMutant(mutant);
    result.ran++;
    if (code === EXIT.KILLED) result.killed++;
    else if (code === EXIT.SURVIVED) result.survivors.push(mutant);
    else result.unknown++;
    if (code === EXIT.RESTORE_FAILED) { result.restoreFailed = mutant; result.finished = false; break; }
  }
  return result;
}

/**
 * The `Survivors:` section a PR body carries. It says its cap and how many it cut, says "DID NOT FINISH" when
 * the budget ran out (naming how many mutants never ran), and says in its first line that it refuses nothing.
 * @param {Hunt} result
 * @param {{ cap?: number }} [options]
 * @returns {string[]}
 */
export function renderSurvivors(result, { cap = DEFAULT_CAP } = {}) {
  const shown = result.survivors.slice(0, cap);
  const cut = result.survivors.length - shown.length;
  const lines = [`Survivors: ${result.survivors.length} of ${result.ran} mutants run survived the named tests `
    + "(machine-chosen, ADVISORY: nothing here refuses this PR)."];
  for (const m of shown) lines.push(`- \`${m.file}:${m.line}\` ${m.operator}: \`${m.before}\` -> \`${m.after}\``);
  lines.push(`Cap: ${cap}. ${cut > 0 ? `${cut} more survivors were CUT from this list.` : "Nothing was cut."}`);
  if (result.restoreFailed) {
    const at = `${result.restoreFailed.file}:${result.restoreFailed.line}`;
    lines.push(`DID NOT FINISH: the restore of \`${at}\` FAILED, so the hunt stopped. Check that file by hand.`);
  } else if (!result.finished) {
    lines.push(`DID NOT FINISH: ran ${result.ran} of ${result.total} mutants in the ${result.budgetSeconds}s budget; `
      + `${result.total - result.ran} were never run, so this list may be missing survivors.`);
  }
  if (result.unknown > 0) lines.push(`${result.unknown} mutants were refused by \`npm run mutate\` and say nothing either way.`);
  return lines;
}

/**
 * The real runner: one `mutation-check.mjs` per mutant, applied through this file's own `apply`. The file is
 * copied aside first and compared after, so a check that was itself killed cannot leave a mutated file behind
 * unnoticed; a difference is put back from the copy and reported as exit 3.
 * @param {{ cwd: string, test: string, spawn?: typeof spawnSync }} where `spawn` is the seam a test replaces
 * @returns {(mutant: Mutant) => number}
 */
export function mutateRunner({ cwd, test, spawn = spawnSync }) {
  return (mutant) => {
    const target = path.join(cwd, mutant.file);
    const aside = readFileSync(target);
    const apply = `node ${SELF} apply --file=${mutant.file} --line=${mutant.line} `
      + `--operator=${mutant.operator} --occurrence=${mutant.occurrence}`;
    const done = spawn(process.execPath, [MUTATE, `--file=${mutant.file}`, `--mutate=${apply}`,
      `--test=${test}`], { cwd, encoding: "utf8", env: sandboxGitEnv(), stdio: "pipe" });
    if (Buffer.compare(aside, readFileSync(target)) !== 0) { writeFileSync(target, aside); return EXIT.RESTORE_FAILED; }
    return verdictOf(done);
  };
}

/**
 * The exit code, believed only when the tool's own sentence agrees with it. A Node process that CRASHES exits 1
 * -- the code for "the guard did not bite" -- so a `mutation-check.mjs` that could not even start (no build, a
 * missing module) would read as a survivor on every mutant. Its verdict lines are printed only by its own
 * paths, so a code without its line is REFUSED (exit 2: says nothing either way).
 * @param {{ status: number | null, stdout?: string | null, stderr?: string | null }} done
 * @returns {number}
 */
function verdictOf({ status, stdout, stderr }) {
  const said = `${stdout ?? ""}${stderr ?? ""}`;
  if (status === EXIT.KILLED) return said.includes("THE GUARD BITES.") ? EXIT.KILLED : EXIT.REFUSED;
  if (status === EXIT.SURVIVED) return said.includes("THE GUARD DID NOT BITE.") ? EXIT.SURVIVED : EXIT.REFUSED;
  return status ?? EXIT.REFUSED;
}

/**
 * The whole pipeline over injected seams: the diff, the file reads and the mutant runner are all arguments, so
 * nothing here needs git, a file or a test run to be driven. `exitCode` is 0 WHATEVER SURVIVED -- advisory is
 * a property of this return value, not of a caller's discipline -- and 3 only when a restore failed.
 * @param {{ diff: string, read: (file: string) => string | null, runMutant: (mutant: Mutant) => number,
 *   budgetSeconds?: number, cap?: number, now?: () => number }} args
 * @returns {{ lines: string[], hunt: Hunt, exitCode: number }}
 */
export function survivorsFor({ diff, read, runMutant, budgetSeconds = DEFAULT_BUDGET_SECONDS, cap = DEFAULT_CAP, now }) {
  const mutants = chooseMutants(changedLines(diff), read);
  const result = hunt({ mutants, runMutant, budgetSeconds, now });
  return { lines: renderSurvivors(result, { cap }), hunt: result,
    exitCode: result.restoreFailed ? EXIT.RESTORE_FAILED : 0 };
}

/** @param {string[]} argv @param {string} name */
const flag = (argv, name) => argv.find((a) => a.startsWith(`${name}=`))?.split("=").slice(1).join("=");

/** @param {string[]} argv */
function applyCommand(argv) {
  const file = flag(argv, "--file");
  const at = { line: Number(flag(argv, "--line")), operator: flag(argv, "--operator") ?? "",
    occurrence: Number(flag(argv, "--occurrence") ?? 0) };
  const mutated = file && existsSync(file) ? applyMutant(readFileSync(file, "utf8"), at) : null;
  if (mutated === null) { console.error("mutant-survivors apply: no such mutant."); return EXIT.REFUSED; }
  writeFileSync(/** @type {string} */ (file), mutated);
  return 0;
}

/** @param {string[]} argv */
function runCommand(argv) {
  const base = flag(argv, "--base");
  const test = flag(argv, "--test");
  if (!base || !test) { console.error("mutant-survivors run: needs --base=<rev> and --test='<shell>'."); return EXIT.REFUSED; }
  const diff = spawnSync("git", ["diff", "-U0", base, "--"], { encoding: "utf8", env: sandboxGitEnv(),
    maxBuffer: MAX_DIFF_BYTES }).stdout;
  const { lines, hunt: result, exitCode } = survivorsFor({ diff,
    read: (file) => (existsSync(file) ? readFileSync(file, "utf8") : null),
    runMutant: mutateRunner({ cwd: process.cwd(), test }),
    budgetSeconds: Number(flag(argv, "--budget") ?? DEFAULT_BUDGET_SECONDS), cap: Number(flag(argv, "--cap") ?? DEFAULT_CAP) });
  console.log(argv.includes("--json") ? JSON.stringify(result, null, 2) : lines.join("\n"));
  return exitCode;
}

async function main() {
  // Imported here and not at the top: only the command line needs the flag guard, and only it needs `dist`, so a
  // checkout with no build can still import this file's functions.
  const { refuseUnknownFlags } = await import("@a11ign/worker-fleet/cli-flags");
  refuseUnknownFlags(["--file", "--line", "--operator", "--occurrence", "--base", "--test", "--budget", "--cap", "--json"],
    { entry: import.meta.url, command: "node packages/guards/src/mutant-survivors.mjs" });
  const [verb, ...rest] = process.argv.slice(2);
  process.exit(verb === "apply" ? applyCommand(rest) : verb === "run" ? runCommand(rest) : EXIT.REFUSED);
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) await main();
