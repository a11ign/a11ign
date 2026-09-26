#!/usr/bin/env node
// @ts-check
// command: `node packages/guards/src/layer-edges.mjs --check` -- every reach across a LAYER package's boundary, by path, against a baseline (#2612)
//
// THE BOUNDARY OF A LAYER WAS NOT A THING A MACHINE COULD READ (#69, child 1). The workspace resolves
// `../../<pkg>/src/x.mjs` without any declaration, so `nvda-worker`'s package.json says "no in-repo runtime
// dependency" and is TRUE of the manifest and misleading about the code: nine files inside it reached out by
// path, and `#2519`'s registry gate, which installs only the PUBLISHED packages, cannot see a reach that a
// published tarball does not carry. A layer that is to leave for its own repository has to know, in a file
// that is checked, every place it still leans on the tree it is leaving.
//
// WHAT COUNTS AS AN EDGE, AND WHAT DOES NOT. A path literal is an edge only where it FLOWS: into an
// `import`/`require`, or as an argument of a call that reads, resolves, walks or launches a path
// (`SINKS`), or, in a launcher or workflow, as a `packages/<pkg>` path token. A path that is DATA -- a Region
// body handed to a parser, a fixture list a test checks a function against -- names a path without reading
// it, and `region-paths.test.ts` and `owned-path-signoff.test.ts` are full of them. Comments do not count.
// The cost of that rule is a LOWER BOUND: a path assigned to a `const` and read three lines later through
// the variable is not seen. The baseline is a floor on the boundary, never a proof there is nothing under it.
//
// `stripComments` is `local-import-closure.mjs`'s, not a second one: two comment strippers over the same
// tree is what drifts, and this one preserves offsets, which the message line numbers need.
//
// THE LAYER PACKAGES ARE DECLARED HERE, never discovered by a glob: a glob that matched nothing would read
// as a tree with no edges. `layer-edges.test.ts` asserts both names are present and the real baseline is
// not empty.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { pathToFileURL } from "node:url";
import { sandboxGitEnv } from "./git-env.mjs";
import { stripComments } from "./local-import-closure.mjs";
// RELATIVE, for the reason `changed-files.mjs` records above its own identical import.
import { flagValue, refuseUnknownFlags } from "../../worker-fleet/src/cli-flags.mjs";

/** The packages that are to leave, by directory name under `packages/`. Two today; a third is a one-word edit here. */
export const LAYER_PACKAGES = Object.freeze(["nvda-worker", "nvda-speech"]);

export const BASELINE_PATH = "packages/guards/layer-edges.baseline.json";

/**
 * This guard's own files, EXCLUDED IN CODE and not by an entry in the baseline it maintains. The baseline
 * names paths by design and the test names fixtures that import across on purpose; a file that matched its
 * own scan and listed itself would be the guard writing its own exemption. A pattern and not a list of
 * paths: `spawned-paths.test.ts` reads a quoted repo-relative program path in a file that spawns as a spawn.
 */
const SELF = /(?:^|\/)layer-edges(?:\.test\.ts|\.mjs|\.baseline\.json)$/;

/** Calls whose ARGUMENT is a path being read, resolved, walked or launched -- the flows of "A path is an edge only where it flows". */
const SINKS = [
  "require", "resolve", "join", "URL", "readFileSync", "readFile", "existsSync", "statSync", "lstatSync",
  "readdirSync", "readdir", "fileURLToPath", "pathToFileURL", "filesUnder", "sourceFiles",
  "spawn", "spawnSync", "execFile", "execFileSync", "exec", "execSync", "fork", "import",
];
// `read*`/`load*` too: a test's own `read("packages/x/y.mjs")` helper is a file read one call removed, and
// listing every such helper by name is how a hand-kept list falls behind.
const SINK_CALL = new RegExp(`\\b(?:${SINKS.join("|")}|(?:read|load)\\w*)\\s*\\(`, "g");

const CODE_FILE = /\.(?:mjs|cjs|js|mts|cts|ts|tsx)$/;
const LAUNCHER_FILE = /\.(?:cmd|bat|ps1|sh)$/;
const WORKFLOW_FILE = /\.ya?ml$/;
const CONFIG_FILE = /\.(?:json|toml|py)$/;
/** A file this large is a corpus or a lockfile, not a hand-written reach. */
const BYTES_PER_KIB = 1024;
const MAX_SCANNED_BYTES = 512 * BYTES_PER_KIB;
const MAX_CALL_CHARS = 2000;
const MAX_IDENTIFIER_CHARS = 64;
/** Stands for a template's `${...}` in a literal: something is there, and nothing here says what. */
const PLACEHOLDER = "\uE000";

export const EDGE_KINDS = Object.freeze(["import", "path-literal", "launcher", "workflow", "config"]);
const DISPOSITION = /^(?:by-name|travels|owned-by:#\d+)$/;

/** @typedef {{ from: string, to: string, kind: string, direction: "in" | "out" }} Edge */
/** @typedef {Edge & { disposition: string, reason: string }} BaselineEntry */
/** @typedef {{ has(path: string): boolean }} PathIndex */
/** @typedef {{ literal: string, kind: string }} Reach */

/**
 * `packages/<name>/...` -> `name`; anything else (root, scripts, docs, .github) is not in a package.
 * @param {string} path
 * @returns {string | null}
 */
export function packageOf(path) {
  const m = /^packages\/([^/]+)(?:\/|$)/.exec(path);
  return m ? m[1] : null;
}

/**
 * Whether a tracked path is read at all. Prose, generated records and the guard's own files are not scanned.
 * @param {string} path
 * @param {number} [size]
 */
export function isScanned(path, size = 0) {
  if (SELF.test(path) || size > MAX_SCANNED_BYTES) return false;
  if (/\.md$|(?:^|\/)(?:docs|\.changeset|runs|node_modules|dist)\/|\/fixtures\/|(?:pnpm|package)-lock\./.test(path)) return false;
  return [CODE_FILE, LAUNCHER_FILE, WORKFLOW_FILE, CONFIG_FILE].some((re) => re.test(path));
}

/**
 * What exists, as a question: a tracked file, or a directory holding one. Built from the tracked list and
 * not from the disk, so the answer is the same in a checkout that has built `dist` and one that has not.
 * @param {string[]} tracked
 */
function pathIndex(tracked) {
  const known = new Set(tracked);
  for (const file of tracked) {
    for (let dir = posix.dirname(file); dir !== "." && !known.has(dir); dir = posix.dirname(dir)) known.add(dir);
  }
  return { has: (/** @type {string} */ path) => known.has(path) };
}

/**
 * The part of a literal that is a path, forward-slashed: a git `<rev>:<path>` loses its revision, and a
 * template that BEGINS with an interpolation is kept only when what follows is a `packages/` path -- `${name}/package.json` names
 * whatever `name` is, and reading it as the repository's own `package.json` is a false edge.
 * @param {string} literal
 */
function knownPathOf(literal) {
  const slashed = literal.replaceAll("\\", "/").replace(/^[\w~^.-]+:(?=packages\/)/, "").replace(/\/+$/, "");
  if (!slashed.includes(PLACEHOLDER)) return slashed;
  const tail = slashed.startsWith(PLACEHOLDER) ? slashed.slice(PLACEHOLDER.length).replace(/^\/+/, "") : "";
  return tail.startsWith("packages/") && !tail.includes(PLACEHOLDER) ? tail : "";
}

/**
 * The tracked path a literal names, from the file that wrote it: relative to that file when it starts with
 * `.`, otherwise from the repository root first and the file's own directory second. `null` when it names
 * nothing that exists -- which is what stops the word "docs" in a `join` being read as the directory.
 * @param {string} literal
 * @param {string} fromFile
 * @param {PathIndex} index
 * @returns {string | null}
 */
function resolveLiteral(literal, fromFile, index) {
  const cleaned = knownPathOf(literal);
  if (cleaned === "" || /\s/.test(cleaned)) return null;
  const candidates = cleaned.startsWith(".")
    ? [posix.join(posix.dirname(fromFile), cleaned)]
    : [posix.normalize(cleaned.replace(/^\/+/, "")), posix.join(posix.dirname(fromFile), cleaned)];
  return candidates.find((c) => !c.startsWith("..") && c !== "." && index.has(c)) ?? null;
}

/**
 * `import`, `export ... from`, `require` and dynamic `import()` specifiers that are relative.
 * @param {string} src
 * @returns {string[]}
 */
function relativeSpecifiers(src) {
  return [...src.matchAll(/(?:\bfrom|\bimport|\brequire)\s*\(?\s*(['"])(\.[^'"\n]*)\1/g)].map((m) => m[2]);
}

/**
 * An import specifier's file: the literal's own extension, `.js` naming a `.ts`, or an index. Falls back to the raw
 * path, so a broken reach is still a reach.
 * @param {string} spec
 * @param {string} fromFile
 * @param {PathIndex} index
 */
function resolveSpecifier(spec, fromFile, index) {
  const raw = posix.join(posix.dirname(fromFile), spec);
  const swapped = raw.replace(/\.js$/, ".ts");
  const tries = [raw, swapped, `${raw}.ts`, `${raw}.mjs`, `${raw}.js`, `${raw}/index.ts`, `${raw}/index.mjs`];
  return tries.find((t) => index.has(t)) ?? raw;
}

/**
 * The string literals sitting DIRECTLY in the argument list of the call whose `(` is at `open`, in order,
 * with a template's `${...}` replaced by `PLACEHOLDER`. A bare identifier bound to a string literal counts
 * as that literal (`const WORKER_INDEX = "packages/..."; readFileSync(join(ROOT, WORKER_INDEX))`). Nested
 * calls are their own sinks and are not read here.
 * @param {string} src
 * @param {number} open
 * @param {Map<string, string>} bindings
 */
function literalsOfCall(src, open, bindings) {
  /** @type {string[]} */
  const literals = [];
  let depth = 0;
  const stop = Math.min(src.length, open + MAX_CALL_CHARS);
  for (let i = open; i < stop; i++) {
    const c = src[i];
    if (c === "(") depth++;
    else if (c === ")" && --depth === 0) break;
    else if (c === '"' || c === "'" || c === "`") {
      const { text, end } = readQuoted(src, i, stop);
      if (depth === 1) literals.push(text);
      i = end;
    } else if (startsIdentifier(src, i)) {
      const id = identifierAt(src, i);
      const bound = bindings.get(id);
      if (depth === 1 && bound !== undefined) literals.push(bound);
      i += id.length - 1;
    }
  }
  return literals;
}

/** @param {string} src @param {number} i */
const startsIdentifier = (src, i) =>
  /[A-Za-z_$]/.test(src[i]) && !/[\w$.]/.test(src[i - 1] ?? "");

/** @param {string} src @param {number} i */
const identifierAt = (src, i) =>
  /^[\w$]+/.exec(src.slice(i, i + MAX_IDENTIFIER_CHARS))?.[0] ?? src[i];

/**
 * `const NAME = "literal"` bindings in a file, so a path named once and read elsewhere is still seen at the read.
 * @param {string} src
 * @returns {Map<string, string>}
 */
function stringBindings(src) {
  /** @type {Map<string, string>} */
  const bindings = new Map();
  for (const m of src.matchAll(/\b(?:const|let|var)\s+([\w$]+)\s*(?::[^=\n]+)?=\s*(?=['"`])/g)) {
    const start = m.index + m[0].length;
    bindings.set(m[1], readQuoted(src, start, Math.min(src.length, start + MAX_CALL_CHARS)).text);
  }
  return bindings;
}

/**
 * One quoted literal starting at `start`; a `'`/`"` one ends at its line, so an unbalanced quote cannot run away.
 * @param {string} src
 * @param {number} start
 * @param {number} stop
 */
function readQuoted(src, start, stop) {
  const quote = src[start];
  let text = "";
  let i = start + 1;
  for (; i < stop && src[i] !== quote; i++) {
    if (quote !== "`" && src[i] === "\n") break;
    if (src[i] === "\\") { text += src[i + 1] ?? ""; i++; continue; }
    if (quote === "`" && src[i] === "$" && src[i + 1] === "{") { i = skipInterpolation(src, i + 1, stop); text += PLACEHOLDER; continue; }
    text += src[i];
  }
  return { text, end: i };
}

/**
 * The index of the `}` closing the `${` whose `{` is at `open`.
 * @param {string} src
 * @param {number} open
 * @param {number} stop
 */
function skipInterpolation(src, open, stop) {
  let depth = 0;
  for (let i = open; i < stop; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return i;
  }
  return stop;
}

/**
 * The candidate paths one sink call makes: joined for `join`/`resolve` (its arguments ARE the segments), one each otherwise.
 * @param {string} name
 * @param {string[]} literals
 */
function candidatesOfCall(name, literals) {
  if (name === "join" || name === "resolve") return literals.length > 0 ? [literals.join("/")] : [];
  return literals;
}

/**
 * Every path a piece of code hands to a sink, as `{ literal, kind }`.
 * @param {string} src comment-stripped
 * @returns {Reach[]}
 */
function flowingLiterals(src) {
  /** @type {Reach[]} */
  const flows = relativeSpecifiers(src).map((literal) => ({ literal, kind: "import" }));
  const bindings = stringBindings(src);
  for (const m of src.matchAll(SINK_CALL)) {
    const open = m.index + m[0].length - 1;
    const name = /^\w+/.exec(m[0])?.[0] ?? "";
    for (const literal of candidatesOfCall(name, literalsOfCall(src, open, bindings))) {
      flows.push({ literal, kind: "path-literal" });
    }
  }
  return flows;
}

/**
 * `packages/<pkg>/...` tokens in a launcher, workflow or config, either slash.
 * @param {string} text comment-stripped
 * @returns {string[]}
 */
function tokenReaches(text) {
  /** @type {string[]} */
  const reaches = [];
  for (const m of text.matchAll(/(?<![\w.@-])packages[\\/]+([\w-]+)((?:[\\/]+[\w.@-]+)*)/g)) {
    reaches.push(`packages/${m[1]}${m[2]}`.replace(/[\\/]+/g, "/"));
  }
  return reaches;
}

/**
 * A launcher, workflow or config with its comment lines and trailing `#` comments blanked; `.json` has no comments.
 * @param {string} path
 * @param {string} text
 */
function stripTextComments(path, text) {
  if (path.endsWith(".json")) return text;
  const line = /\.(?:cmd|bat)$/.test(path) ? /^\s*(?:@?rem\b|::).*$/gim : /(?:^|(?<=\s))#.*$/gm;
  return text.replace(line, (m) => " ".repeat(m.length));
}

const KIND_BY_FILE = /** @type {const} */ ([[LAUNCHER_FILE, "launcher"], [WORKFLOW_FILE, "workflow"], [CONFIG_FILE, "config"]]);

/**
 * The literals a file reaches by. Code is read by flow; everything else by token.
 * @param {string} path
 * @param {string} text
 * @returns {Reach[]}
 */
function reachesOf(path, text) {
  if (CODE_FILE.test(path)) return flowingLiterals(stripComments(text));
  const kind = KIND_BY_FILE.find(([re]) => re.test(path))?.[1] ?? "config";
  return tokenReaches(stripTextComments(path, text)).map((literal) => ({ literal, kind }));
}

/**
 * The longest existing prefix of a launcher/workflow token: `packages/lab/src/x.mjs` if it exists, else
 * the directory above, down to `packages/<pkg>` -- a path that has moved is still a reach.
 * @param {string} literal
 * @param {PathIndex} index
 */
function longestExisting(literal, index) {
  const parts = literal.split("/");
  while (parts.length > 2 && !index.has(parts.join("/"))) parts.pop();
  return parts.join("/");
}

/**
 * The path a reach lands on: an import resolves like a module, a code literal like a path, a token by its longest existing prefix.
 * @param {Reach} reach
 * @param {string} path
 * @param {PathIndex} index
 * @returns {string | null}
 */
function targetOf({ literal, kind }, path, index) {
  if (kind === "import") return resolveSpecifier(literal, path, index);
  return kind === "path-literal" ? resolveLiteral(literal, path, index) : longestExisting(literal, index);
}

/**
 * Every edge one file makes across a layer boundary.
 * @param {string} path repo-relative
 * @param {string} text
 * @param {PathIndex} index
 * @param {readonly string[]} layers
 * @returns {Edge[]}
 */
function edgesOfFile(path, text, index, layers) {
  const fromPkg = packageOf(path);
  /** @type {Edge[]} */
  const edges = [];
  for (const { literal, kind } of reachesOf(path, text)) {
    const to = targetOf({ literal, kind }, path, index);
    if (to === null) continue;
    const toPkg = packageOf(to);
    if (toPkg === fromPkg || !(layers.includes(fromPkg ?? "") || layers.includes(toPkg ?? ""))) continue;
    edges.push({ from: path, to, kind, direction: layers.includes(fromPkg ?? "") ? "out" : "in" });
  }
  return edges;
}

/** @param {Edge | undefined} e a baseline entry may be anything; `judgeEdges` reports it as malformed rather than throwing */
const keyOf = (e) => `${e?.direction} ${e?.kind} ${e?.from} -> ${e?.to}`;

/**
 * Every edge across a layer boundary in `tracked`, both directions, one per (from, to, kind, direction).
 * @param {{ root: string, tracked: string[], layers?: readonly string[] }} options
 * @returns {Edge[]}
 */
export function findEdges({ root, tracked, layers = LAYER_PACKAGES }) {
  const index = pathIndex(tracked);
  /** @type {Map<string, Edge>} */
  const byKey = new Map();
  for (const path of tracked) {
    const abs = join(root, path);
    if (!existsSync(abs)) continue;
    if (!isScanned(path, statSync(abs).size)) continue;
    for (const edge of edgesOfFile(path, readFileSync(abs, "utf8"), index, layers)) {
      byKey.set(keyOf(edge), edge);
    }
  }
  return [...byKey.values()].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
}

/**
 * The verdict on a set of edges against a baseline: what is new, what no longer exists, and what is malformed.
 * A stale entry is refused for the reason an allowlist the subject can join is: a list that outlives what it
 * lists reads as a boundary that is still there.
 * @param {Edge[]} edges
 * @param {unknown} baseline
 * @returns {{ unlisted: Edge[], stale: BaselineEntry[], malformed: string[] }}
 */
export function judgeEdges(edges, baseline) {
  if (!Array.isArray(baseline)) return { unlisted: edges, stale: [], malformed: ["the baseline is not a JSON array"] };
  const malformed = baseline.flatMap((entry, i) => malformedReasons(entry).map((why) => `entry ${i} (${entry?.from ?? "?"}): ${why}`));
  const listed = new Set(baseline.map((e) => keyOf(e)));
  const present = new Set(edges.map(keyOf));
  return {
    unlisted: edges.filter((e) => !listed.has(keyOf(e))),
    stale: baseline.filter((e) => !present.has(keyOf(e))),
    malformed,
  };
}

/**
 * What is wrong with one baseline entry, as sentences; empty when it is well-formed.
 * @param {any} entry
 * @returns {string[]}
 */
function malformedReasons(entry) {
  const missing = ["from", "to", "kind", "direction", "disposition", "reason"]
    .filter((f) => typeof entry?.[f] !== "string" || entry[f].trim() === "");
  if (missing.length > 0) return [`missing ${missing.join(", ")}`];
  const reasons = [];
  if (!EDGE_KINDS.includes(entry.kind)) reasons.push(`kind "${entry.kind}" is not one of ${EDGE_KINDS.join(", ")}`);
  if (entry.direction !== "in" && entry.direction !== "out") reasons.push(`direction "${entry.direction}" is not "in" or "out"`);
  if (entry.disposition === "cut") reasons.push('disposition "cut" is an edge that still exists: cutting an edge REMOVES its entry');
  else if (!DISPOSITION.test(entry.disposition)) reasons.push(`disposition "${entry.disposition}" is not by-name, travels or owned-by:#<row>`);
  return reasons;
}

/**
 * The refusal, as the lines a person reads: what to do about each new edge and each stale entry.
 * @param {{ unlisted: Edge[], stale: BaselineEntry[], malformed: string[] }} verdict
 * @returns {string[]}
 */
export function describeVerdict({ unlisted, stale, malformed }) {
  return [
    ...unlisted.map((e) => `NEW EDGE ${e.direction}: ${e.from} -> ${e.to} (${e.kind}). Cut it, or add it to ${BASELINE_PATH} with a disposition and a reason.`),
    ...stale.map((e) => `STALE ENTRY: ${e.from} -> ${e.to} (${e.kind}, ${e.direction}) no longer exists. Remove it from ${BASELINE_PATH}.`),
    ...malformed.map((m) => `MALFORMED: ${m}`),
  ];
}

/** Counts by disposition, for the closing comment on the row that cuts edges: how many the move still has to cut. */
export function countByDisposition(/** @type {BaselineEntry[]} */ baseline) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const e of baseline) {
    const key = `${e.direction}:${e.disposition.replace(/:#\d+$/, "")}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/**
 * The files of the tree at `root`, repo-relative: tracked, plus untracked-but-not-ignored, so a new file
 * that reaches across is seen before it is committed and not on the pull request. Run from a subdirectory
 * of a repository, git lists only that subtree, which is how a committed fixture is a root of its own.
 * @param {string} root
 */
export function trackedFiles(root) {
  return execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, env: sandboxGitEnv(), encoding: "utf8", maxBuffer: 1 << 28 })
    .split("\0").filter(Boolean);
}

/**
 * The checked-in baseline, or `[]` when it is absent (the verdict then lists every edge as new).
 * @param {string} root
 * @returns {BaselineEntry[]}
 */
export function readBaseline(root) {
  const file = join(root, BASELINE_PATH);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
}

// The CLI half. `realpathSync` on argv[1]: through a symlink the guard below silently does not fire, and a
// mistyped flag is ignored (#237).
if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  const argv = process.argv.slice(2);
  refuseUnknownFlags(["--check", "--list", "--root"], { entry: import.meta.url, argv, command: "node packages/guards/src/layer-edges.mjs" });
  // `--root=<dir>` points the guard at another tree (a committed fixture is one); the default is this checkout.
  const root = flagValue(argv, "root") ?? join(dirname(new URL(import.meta.url).pathname), "..", "..", "..");
  const edges = findEdges({ root, tracked: trackedFiles(root) });
  if (argv.includes("--list")) {
    console.log(JSON.stringify(edges, null, 2));
  } else if (argv.includes("--check")) {
    const verdict = judgeEdges(edges, readBaseline(root));
    const lines = describeVerdict(verdict);
    for (const line of lines) console.error(line);
    console.log(`layer-edges: ${edges.length} edges across ${LAYER_PACKAGES.join(", ")}; ${lines.length === 0 ? "baseline agrees" : `${lines.length} problem(s)`}.`);
    process.exit(lines.length === 0 ? 0 : 1);
  } else {
    console.error("usage: node packages/guards/src/layer-edges.mjs --check | --list [--root=<dir>]");
    process.exit(2);
  }
}
