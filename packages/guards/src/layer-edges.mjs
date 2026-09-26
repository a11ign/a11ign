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
// A path in a `const` is followed to where it flows (#2643): a string `const` handed to a sink, a list or object
// `const` (through `...spread`) walked by `for ... of` or by `.map`/`.filter`/`.forEach`/... into a sink, each judged
// on the binding innermost at the read, so a `const` shadowed in an inner block is the inner value there. A `const`
// only handed to a parser, an `includes` or a callback that reads nothing is data and is not an edge, and a
// destructured loop takes the property it names, never every string in the list. Such an edge carries the lines of
// its declaration and its read. WHAT IS STILL NOT SEEN, and so still a floor: a path handed to a function that reads it
// on the caller's behalf (`pathToDriver(WORKER_INDEX)`, an imported `writeSitesIn(files)`), a value returned and read
// elsewhere, and a path assembled by concatenation or across files. A file whose brackets do not balance is read
// with no scopes at all, which is the old file-wide reading and never a wrong scope.
// The baseline is a floor on the boundary, never a proof there is nothing under it.
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

/** @typedef {{ declaredLine: number, readLine: number }} Via */
/** @typedef {{ from: string, to: string, kind: string, direction: "in" | "out", via?: Via }} Edge */
/** @typedef {Edge & { disposition: string, reason: string }} BaselineEntry */
/** @typedef {{ has(path: string): boolean }} PathIndex */
/** @typedef {{ literal: string, kind: string, via?: Via }} Reach */

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
 * The alternatives each DIRECT argument of the call whose `(` is at `open` can hold, in order: a string literal is one, a
 * bare identifier is whatever the name is bound to AT THIS POSITION (`const WORKER_INDEX = "packages/..."`, or a loop
 * variable over a list of paths), and `name.prop` is that property of a list of objects. An identifier bound to nothing
 * known contributes nothing. A template's `${...}` is `PLACEHOLDER`. Nested calls are their own sinks and are not read here.
 * @param {string} src
 * @param {number} open
 * @param {Lookup} lookup
 * @returns {Argument[]}
 */
function argumentsOfCall(src, open, lookup) {
  /** @type {Argument[]} */
  const args = [];
  let depth = 0;
  const stop = Math.min(src.length, open + MAX_CALL_CHARS);
  for (let i = open; i < stop; i++) {
    const c = src[i];
    if (c === "(") depth++;
    else if (c === ")" && --depth === 0) break;
    else if (c === '"' || c === "'" || c === "`") {
      const { text, end } = readQuoted(src, i, stop);
      if (depth === 1) args.push({ options: [text] });
      i = end;
    } else if (startsIdentifier(src, i)) {
      const id = identifierAt(src, i);
      const binding = depth === 1 ? lookup(id, i) : undefined;
      const options = optionsOf(binding, propertyAfter(src, i + id.length));
      if (options.length > 0) args.push({ options, declaredAt: binding?.value.declaredAt });
      i += id.length - 1;
    }
  }
  return args;
}

/** @typedef {{ options: string[], declaredAt?: number }} Argument one direct argument: the paths it can hold, and where a `const` that supplied them was written */

/** @param {string} src @param {number} i */
const startsIdentifier = (src, i) =>
  /[A-Za-z_$]/.test(src[i]) && !/[\w$.]/.test(src[i - 1] ?? "");

/** @param {string} src @param {number} i */
const identifierAt = (src, i) =>
  /^[\w$]+/.exec(src.slice(i, i + MAX_IDENTIFIER_CHARS))?.[0] ?? src[i];

/** The `prop` of a `.prop` starting at `i`, or `undefined`. @param {string} src @param {number} i */
const propertyAfter = (src, i) => (src[i] === "." ? /^[\w$]+/.exec(src.slice(i + 1, i + 1 + MAX_IDENTIFIER_CHARS))?.[0] : undefined);

/**
 * What a binding hands a sink: all of it, or, for `name.prop` over a list of objects, only that property's strings.
 * @param {Binding | undefined} binding
 * @param {string | undefined} prop
 * @returns {string[]}
 */
function optionsOf(binding, prop) {
  if (binding === undefined) return [];
  return prop !== undefined && binding.value.container ? binding.value.byProp.get(prop) ?? [] : binding.value.values;
}

// ---- WHERE A NAME'S VALUE COMES FROM (#2643). A path assigned to a `const` and read three lines later is an edge, and
// so is one in a list that a loop or an array method walks into a read. Each name is bound over the SPAN in which it is
// visible, and a read is judged on the binding that is innermost at the read -- a `const` shadowed by a different value in
// an inner block is the inner value there and the outer one after the block ends.
/** @typedef {{ values: string[], byProp: Map<string, string[]>, container: boolean, declaredAt?: number }} Bound `declaredAt`: the offset of the declaration (or list literal) the strings were written in */
/** @typedef {{ name: string, from: number, to: number, value: Bound }} Binding */
/** The 1-based line of offset `at`; comments are blanked in place, so it is the line in the file. @param {string} src @param {number} at */
const lineAt = (src, at) => src.slice(0, at).split("\n").length;

/** @typedef {{ close: Map<number, number>, open: Map<number, number> }} Pairs */
/** @typedef {(name: string, at: number) => Binding | undefined} Lookup */
/** @typedef {{ src: string, pairs: Pairs, lookup: Lookup }} Scope */
/** @typedef {{ names: { name: string, key: string | null }[], from: number, to: number, over: Bound }} Iteration */

const NOTHING = /** @type {Bound} */ ({ values: [], byProp: new Map(), container: false });
const ARRAY_METHODS = "map|forEach|filter|flatMap|some|every|find|findIndex";

/**
 * Matching brackets, both ways. A file whose brackets do not balance (a regex literal holding a quote is enough) gets
 * NO pairs, and every span then reaches the end of the file: the old file-wide reading, never a wrong scope.
 * @param {string} src
 * @returns {Pairs}
 */
function bracketPairs(src) {
  /** @type {Pairs} */
  const pairs = { close: new Map(), open: new Map() };
  /** @type {number[]} */
  const stack = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") i = readQuoted(src, i, src.length).end;
    else if ("([{".includes(c)) stack.push(i);
    else if (")]}".includes(c)) {
      const opened = stack.pop();
      if (opened === undefined) return { close: new Map(), open: new Map() };
      pairs.close.set(opened, i);
      pairs.open.set(i, opened);
    }
  }
  return stack.length === 0 ? pairs : { close: new Map(), open: new Map() };
}

/** Every string literal between `from` and `to`, however deep. @param {string} src @param {number} from @param {number} to */
function stringsBetween(src, from, to) {
  /** @type {string[]} */
  const found = [];
  for (let i = from; i < to; i++) {
    if (src[i] !== '"' && src[i] !== "'" && src[i] !== "`") continue;
    const { text, end } = readQuoted(src, i, to);
    found.push(text);
    i = end;
  }
  return found;
}

/**
 * A list or object literal spanning `from`..`to`: every string in it, the strings each `key:` holds, and whatever a
 * `...NAME` spread brings in.
 * @param {Scope} scope
 * @param {number} from
 * @param {number} to
 * @returns {Bound}
 */
function containerBetween({ src, pairs, lookup }, from, to) {
  const values = stringsBetween(src, from, to);
  /** @type {Map<string, string[]>} */
  const byProp = new Map();
  const text = src.slice(from, to);
  /** @type {number | undefined} */
  let spreadDeclaredAt;
  for (const m of text.matchAll(/([\w$]+)\s*:\s*(?=["'`[])/g)) {
    const at = from + m.index + m[0].length;
    const held = src[at] === "[" ? stringsBetween(src, at, pairs.close.get(at) ?? to) : [readQuoted(src, at, to).text];
    byProp.set(m[1], [...(byProp.get(m[1]) ?? []), ...held]);
  }
  for (const m of text.matchAll(/\.\.\.\s*([\w$]+)/g)) {
    const spread = lookup(m[1], from)?.value;
    if (spread === undefined) continue;
    spreadDeclaredAt ??= spread.declaredAt;
    values.push(...spread.values);
    for (const [key, held] of spread.byProp) byProp.set(key, [...(byProp.get(key) ?? []), ...held]);
  }
  return { values, byProp, container: true, declaredAt: spreadDeclaredAt };
}

/** What follows `=`: a literal, a list or object literal (behind `Object.freeze(`/`new Set(`), or something opaque. */
function valueAt(/** @type {Scope} */ scope, /** @type {number} */ from) {
  const wrapped = /^(?:Object\.freeze|new\s+(?:Set|Map))\s*\(\s*/.exec(scope.src.slice(from, from + MAX_IDENTIFIER_CHARS));
  const at = from + (wrapped?.[0].length ?? 0);
  const c = scope.src[at];
  if (c === '"' || c === "'" || c === "`") {
    return /** @type {Bound} */ ({ values: [readQuoted(scope.src, at, Math.min(scope.src.length, at + MAX_CALL_CHARS)).text], byProp: new Map(), container: false });
  }
  const end = scope.pairs.close.get(at);
  return (c === "[" || c === "{") && end !== undefined ? containerBetween(scope, at, end) : NOTHING;
}

/**
 * The end of the expression starting at `from`: its first `,` `;` or unmatched closer at depth zero.
 * @param {string} src
 * @param {number} from
 * @param {Pairs} pairs
 */
function expressionEnd(src, from, pairs) {
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") i = readQuoted(src, i, src.length).end;
    else if ("([{".includes(c)) i = pairs.close.get(i) ?? src.length;
    else if (",;)]}".includes(c)) return i;
  }
  return src.length;
}

/** The span of a block or single statement whose body starts at the first non-space at or after `from`. */
function bodyEnd(/** @type {string} */ src, /** @type {number} */ from, /** @type {Pairs} */ pairs) {
  const at = from + (/^\s*/.exec(src.slice(from, from + MAX_CALL_CHARS))?.[0].length ?? 0);
  return src[at] === "{" ? pairs.close.get(at) ?? src.length : expressionEnd(src, at, pairs);
}

/** `text` split at the commas that are not inside a bracket or a generic. @param {string} text */
function splitTopLevel(text) {
  /** @type {string[]} */
  const parts = [];
  let depth = 0;
  let last = 0;
  for (let i = 0; i < text.length; i++) {
    if ("([{<".includes(text[i])) depth++;
    else if (")]}>".includes(text[i]) && text[i - 1] !== "=") depth--;
    else if (text[i] === "," && depth === 0) { parts.push(text.slice(last, i)); last = i + 1; }
  }
  return [...parts, text.slice(last)];
}

/**
 * The names a parameter or loop pattern binds, each with the property of the iterated objects it takes: `{ file, expect: e }`
 * gives file/file and e/expect, `rel` and `[a, b]` take the whole element (`key` null).
 * @param {string} pattern
 * @returns {{ name: string, key: string | null }[]}
 */
function namesOfPattern(pattern) {
  const first = splitTopLevel(pattern.trim())[0].trim();
  if (first.startsWith("{")) {
    return first.slice(1).replace(/\}.*$/s, "").split(",").map((p) => p.split("=")[0].trim()).filter(Boolean)
      .map((p) => { const [key, alias] = p.split(":").map((x) => x.trim()); return { name: alias ?? key, key }; });
  }
  if (first.startsWith("[")) return [...first.matchAll(/[\w$]+/g)].map((m) => ({ name: m[0], key: null }));
  const ident = /^[\w$]+/.exec(first)?.[0];
  return ident === undefined ? [] : [{ name: ident, key: null }];
}

/** Every parameter name of a parameter list, for the shadowing they do and none of the value. @param {string} params */
const parameterNames = (params) => splitTopLevel(params).flatMap((p) => {
  const declared = p.trim().replace(/^\.\.\./, "").split(/[=:](?![^{[]*[}\]])/)[0];
  return /^[{[]/.test(declared) ? [...declared.matchAll(/[\w$]+/g)].map((m) => m[0]) : declared.replace(/\?$/, "").trim().match(/^[\w$]+$/) ?? [];
});

/** @returns {{ from: number, params: string, body: number }[]} the functions of a file: where their parameters start and where their bodies end */
function functionSpans(/** @type {string} */ src, /** @type {Pairs} */ pairs) {
  /** @type {{ from: number, params: string, body: number }[]} */
  const spans = [];
  for (const m of src.matchAll(/\bfunction\s*[\w$]*\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    const close = pairs.close.get(open);
    if (close !== undefined) spans.push({ from: open, params: src.slice(open + 1, close), body: bodyEnd(src, close + 1, pairs) });
  }
  for (const m of src.matchAll(/\)\s*(?::\s*[^=>{}()]+)?=>\s*/g)) {
    const open = pairs.open.get(m.index);
    if (open !== undefined) spans.push({ from: open, params: src.slice(open + 1, m.index), body: bodyEnd(src, m.index + m[0].length, pairs) });
  }
  for (const m of src.matchAll(/(?<![\w$.)])([\w$]+)\s*=>\s*/g)) {
    spans.push({ from: m.index, params: m[1], body: bodyEnd(src, m.index + m[0].length, pairs) });
  }
  return spans;
}

/**
 * The bindings of a file, and the lookup that answers "what does this name hold HERE". Declarations first, in order, so
 * a spread finds what it spreads; then every function's parameters as opaque names (a parameter that shadows a path
 * `const` is not that path); then the iteration variables, which take the strings of the list they walk.
 * @param {string} src comment-stripped
 * @returns {Lookup}
 */
function makeLookup(src) {
  const pairs = bracketPairs(src);
  /** @type {Map<string, Binding[]>} */
  const byName = new Map();
  /** @type {Lookup} */
  const lookup = (name, at) => (byName.get(name) ?? []).filter((b) => b.from <= at && at <= b.to).at(-1);
  const scope = { src, pairs, lookup };
  /** @type {(binding: Binding) => void} */
  const add = (binding) => {
    const list = byName.get(binding.name) ?? [];
    list.push(binding);
    list.sort((a, b) => a.from - b.from);
    byName.set(binding.name, list);
  };
  addDeclarations(scope, add);
  for (const { from, params, body } of functionSpans(src, pairs)) {
    for (const name of parameterNames(params)) add({ name, from, to: body, value: NOTHING });
  }
  for (const it of iterationsOf(scope)) {
    for (const { name, key } of it.names) add({ name, from: it.from, to: it.to, value: valueFor(it.over, key) });
  }
  return lookup;
}

/** A value keeps the origin of the list it was spread from, and is otherwise written where it is. @param {Bound} value @param {number} at */
const withOrigin = (value, at) => ({ ...value, declaredAt: value.declaredAt ?? at });

/** @param {Bound} over @param {string | null} key */
const valueFor = (over, key) => (key === null ? over : { values: over.byProp.get(key) ?? [], byProp: new Map(), container: false, declaredAt: over.declaredAt });

/**
 * `const|let|var NAME = ...` over the whole file, each visible to the end of the block it is written in.
 * @param {Scope} scope
 * @param {(binding: Binding) => void} add
 */
function addDeclarations(scope, add) {
  const { src, pairs } = scope;
  const blocks = [...pairs.close].filter(([open]) => src[open] === "{");
  for (const m of src.matchAll(/\b(?:const|let|var)\s+([\w$]+)\s*(?::[^=\n]+)?=(?![=>])\s*/g)) {
    const from = m.index + m[0].length;
    const to = blocks.filter(([open, close]) => open < m.index && m.index < close).map(([, close]) => close).sort((a, b) => a - b)[0] ?? src.length;
    add({ name: m[1], from: m.index, to, value: withOrigin(valueAt(scope, from), m.index) });
  }
}

/**
 * The loops and array-method callbacks in a file that walk a list: the names each binds, the span they are visible over,
 * and what they walk. `for (const { file } of SITES) { ... }` and `[...A, ...B].map((rel) => ...)` are both this.
 * @param {Scope} scope
 * @returns {Iteration[]}
 */
function iterationsOf(scope) {
  const { src, pairs } = scope;
  /** @type {Iteration[]} */
  const found = [];
  for (const m of src.matchAll(/\bfor\s*\(\s*(?:const|let|var)\s+(\{[^}]*\}|\[[^\]]*\]|[\w$]+)\s+of\s+/g)) {
    const open = m.index + m[0].indexOf("(");
    const close = pairs.close.get(open);
    if (close === undefined) continue;
    found.push({ names: namesOfPattern(m[1]), from: open, to: bodyEnd(src, close + 1, pairs), over: walkedBy(scope, m.index + m[0].length, close) });
  }
  for (const m of src.matchAll(new RegExp(`\\.(?:${ARRAY_METHODS})\\s*\\(\\s*`, "g"))) {
    const call = m.index + m[0].indexOf("(");
    const callback = /^(?:\(([^()]*)\)|([\w$]+))\s*(?::[^=]+)?=>|^function\s*[\w$]*\s*\(([^()]*)\)/.exec(src.slice(m.index + m[0].length, m.index + m[0].length + MAX_CALL_CHARS));
    const close = pairs.close.get(call);
    if (callback && close !== undefined) {
      found.push({ names: namesOfPattern(callback[1] ?? callback[2] ?? callback[3] ?? ""), from: m.index + m[0].length, to: close, over: receiverBefore(scope, m.index) });
    }
  }
  return found.sort((a, b) => a.from - b.from);
}

/** What a `for ... of <expr>` walks: a list literal, or the first name in the expression (through `Object.entries(`/`.filter(`). */
function walkedBy(/** @type {Scope} */ scope, /** @type {number} */ from, /** @type {number} */ close) {
  const { src, pairs, lookup } = scope;
  if (src[from] === "[") return withOrigin(containerBetween(scope, from, pairs.close.get(from) ?? close), from);
  const named = /^(?:Object\.(?:entries|values)\(\s*)?([\w$]+)/.exec(src.slice(from, close));
  return (named ? lookup(named[1], from)?.value : undefined) ?? NOTHING;
}

/** What an array method's receiver is: a list literal ending at the `.`, or a name. */
function receiverBefore(/** @type {Scope} */ scope, /** @type {number} */ dot) {
  const { src, pairs, lookup } = scope;
  const end = src.slice(0, dot).trimEnd().length; // a chain may break the line before its `.map(`
  const open = src[end - 1] === "]" ? pairs.open.get(end - 1) : undefined;
  if (open !== undefined) return withOrigin(containerBetween(scope, open, end - 1), open);
  const named = /(?<![\w$.])([\w$]+)$/.exec(src.slice(Math.max(0, end - MAX_IDENTIFIER_CHARS), end));
  return (named ? lookup(named[1], end)?.value : undefined) ?? NOTHING;
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

/** The most joined paths one call is expanded into: a list of forty paths joined with one more is forty candidates, never a thousand. */
const MAX_CANDIDATES = 256;

/**
 * The candidate paths one sink call makes: joined for `join`/`resolve` (its arguments ARE the segments, and an argument
 * that can hold several paths makes one candidate each), one per alternative otherwise. Each keeps the offset of the
 * `const` it came through, when it came through one.
 * @param {string} name
 * @param {Argument[]} args
 * @returns {{ literal: string, declaredAt?: number }[]}
 */
function candidatesOfCall(name, args) {
  if (name !== "join" && name !== "resolve") return args.flatMap(({ options, declaredAt }) => options.map((literal) => ({ literal, declaredAt })));
  const declaredAt = args.find((a) => a.declaredAt !== undefined)?.declaredAt;
  const joined = args.reduce((/** @type {string[]} */ paths, { options }) =>
    (paths.length === 0 ? options : paths.flatMap((p) => options.map((o) => `${p}/${o}`))).slice(0, MAX_CANDIDATES), []);
  return joined.map((literal) => ({ literal, declaredAt }));
}

/**
 * Every path a piece of code hands to a sink, as `{ literal, kind }`.
 * @param {string} src comment-stripped
 * @returns {Reach[]}
 */
function flowingLiterals(src) {
  /** @type {Reach[]} */
  const flows = relativeSpecifiers(src).map((literal) => ({ literal, kind: "import" }));
  const lookup = makeLookup(src);
  for (const m of src.matchAll(SINK_CALL)) {
    const open = m.index + m[0].length - 1;
    const name = /^\w+/.exec(m[0])?.[0] ?? "";
    for (const { literal, declaredAt } of candidatesOfCall(name, argumentsOfCall(src, open, lookup))) {
      const via = declaredAt === undefined ? undefined : { declaredLine: lineAt(src, declaredAt), readLine: lineAt(src, open) };
      flows.push(via === undefined ? { literal, kind: "path-literal" } : { literal, kind: "path-literal", via });
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
  for (const { literal, kind, via } of reachesOf(path, text)) {
    const to = targetOf({ literal, kind }, path, index);
    if (to === null) continue;
    const toPkg = packageOf(to);
    if (toPkg === fromPkg || !(layers.includes(fromPkg ?? "") || layers.includes(toPkg ?? ""))) continue;
    const direction = layers.includes(fromPkg ?? "") ? "out" : "in";
    edges.push(via === undefined ? { from: path, to, kind, direction } : { from: path, to, kind, direction, via });
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
      if (!byKey.has(keyOf(edge))) byKey.set(keyOf(edge), edge);
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
    ...unlisted.map((e) => `NEW EDGE ${e.direction}: ${e.from} -> ${e.to} (${e.kind}${carriedBy(e)}). Cut it, or add it to ${BASELINE_PATH} with a disposition and a reason.`),
    ...stale.map((e) => `STALE ENTRY: ${e.from} -> ${e.to} (${e.kind}, ${e.direction}) no longer exists. Remove it from ${BASELINE_PATH}.`),
    ...malformed.map((m) => `MALFORMED: ${m}`),
  ];
}

/** Where a `const`-carried path was written and where it is read, as the words a person needs to find both. @param {Edge} edge */
const carriedBy = ({ via }) => (via === undefined ? "" : `, through a const declared at line ${via.declaredLine} and read at line ${via.readLine}`);

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
