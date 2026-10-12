/**
 * #2612, child 1 of #69: `packages/guards/src/layer-edges.ts`, the guard that makes the boundary of `nvda-worker` and
 * `nvda-speech` a thing a machine can read, and refuses a reach across it. Since ADR 0045 cut 9 (#5087) there is no baseline to name one in.
 *
 * EVERY FIXTURE IS A REPOSITORY OF ITS OWN under `fixtures/layer-edges/<case>/`, holding a real `packages/other/src/x.ts`.
 * That file is the CONFOUND control: a fixture that names it in a comment or as data passes because of the comment or the
 * data, and never because the target was missing (`a-negative-fixture-needs-the-confound-in-it`). Each such case asserts the
 * target exists and that the mention is really there, so a fixture emptied by accident is not read as a pass.
 *
 * THE POSITIVE CONTROLS ARE IN THIS FILE, by name, because `assert.deepEqual(edges, [])` passes over an empty population:
 *   - the clean fixture is asserted to hold scanned files, so "no edges" is a scan that looked and found none;
 *   - the declared layer list is asserted to hold all six packages, and the real tree is asserted to have thousands of scanned
 *     files and a function that SEES a planted reach, so a guard that discovers nothing is not read as a tree with no edges;
 *   - a committed baseline file that names the edge is asserted NOT to excuse it, so a list the subject can join has no reading
 *     in which it passes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

import { declareTreeWideGuard } from "@a11ign/toolchain/lib/tree-wide-guard";
import {
  LAYER_PACKAGES, describeRefusals, findEdges, isScanned, packageOf, trackedFiles,
} from "./layer-edges.ts";

// #3610: "the real tree holds no reach" walks `trackedFiles()`, so this file's population is the whole
// tracked tree and no import graph from a changed file reaches it -- the edge a new file adds is in the new file.
// Declared so `--changed` does not pretend to select it and CI's `guardSweep` carries it once per pull request.
declareTreeWideGuard();

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const GUARD = join(ROOT, "packages/guards/src/layer-edges.ts");
const FIXTURES = join(ROOT, "packages/guards/src/fixtures/layer-edges");

const fixture = (name: string) => join(FIXTURES, name);
const edgesOf = (name: string) => findEdges({ root: fixture(name), tracked: trackedFiles(fixture(name)) });
const textOf = (name: string, path: string) => readFileSync(join(fixture(name), path), "utf8");
// #4273: the guard is TypeScript. The loader is handed explicitly so the spawn does not depend on the interpreter stripping types itself
// (Node 24 does, #4389; ADR 0043 Decision 8 predates it).
const TSX = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
const cli = (...args: string[]) => spawnSync(process.execPath, ["--import", TSX, GUARD, ...args], { encoding: "utf8" });

const TARGET = "packages/other/src/x.ts";
/** The worker layer's directory, built from its name (ADR 0045 cut 6, #5084): the guard under test still knows `nvda-worker` as a layer until `layers.json` goes. The fixtures use `nvda-speech`, the other layer that left first, so no tracked file spells the worker's path. */
const WORKER_LAYER = "nvda-worker";
const WORKER_DIR = `packages/${WORKER_LAYER}`;
const LAYER_FILE = "packages/nvda-speech/src/x.ts";
/** The lab layer's directory, built from the layer's name as `lab-delete.test.ts` builds it: the guard under test still knows `lab` as a layer until `layers.json` goes. */
const LAB_LAYER = "lab";
const LAB_DIR = `packages/${LAB_LAYER}`;
/** The fleet's directory, built the same way and for the same reason (ADR 0045 cut 4, #5082): the guard under test still knows `worker-fleet` as a layer until `layers.json` goes. */
const FLEET_LAYER = "worker-fleet";
const FLEET_DIR = `packages/${FLEET_LAYER}`;
/** The layers that left, or are leaving, first (#2612, #2976): the ones whose every `out` edge a named row owns. */
const FIRST_LAYERS = ["nvda-worker", "nvda-speech", "agent-org"];
/** The three the fence of #3501 adds, for moves 2-4 of #69. */
const SPLIT_LAYERS = ["worker-fleet", "lab", "control"];
/** Control's directory, built the same way and for the same reason (ADR 0045 cut 8, #5086): the guard under test still knows `control` as a layer until `layers.json` goes. */
const CONTROL_LAYER = "control";
const CONTROL_DIR = `packages/${CONTROL_LAYER}`;
/** One x.ts and one own.ts per layer, and the other package's x.ts. */
const THREE_LAYERS_CLEAN_FILES = 7;
/** A floor under the files the real-tree scan reads, so "no reach" is not a scan that read nothing. */
const SCANNED_AT_LEAST = 400;

// ------------------------------------------------------------------ the declared layers

test("the layer packages are DECLARED, all six, and packageOf reads the directory under packages/", () => {
  assert.deepEqual([...LAYER_PACKAGES], [...FIRST_LAYERS, ...SPLIT_LAYERS]);
  assert.equal(packageOf(`${WORKER_DIR}/src/server.ts`), WORKER_LAYER);
  assert.equal(packageOf("packages/nvda-speech"), "nvda-speech");
  assert.equal(packageOf("scripts/x.ts"), null, "the repository root and scripts/ are in no package");
});

// ------------------------------------------------------------------ the clean fixture PASSES

test("a clean layer package PASSES: its own imports, a bare package import, and another package reaching it by NAME", () => {
  const scanned = trackedFiles(fixture("clean")).filter((path) => isScanned(path));
  assert.deepEqual(scanned.sort(), [
    "packages/nvda-speech/src/own.ts", "packages/nvda-speech/src/x.ts", "packages/other/src/x.ts", "packages/other/src/y.ts",
  ], "POSITIVE CONTROL: the clean fixture is scanned, so no edges is a scan that found none");
  assert.deepEqual(edgesOf("clean"), []);
});

// ------------------------------------------------------------------ the refusals, one fixture each

test("an import that leaves the layer is REFUSED, naming both ends", () => {
  const edges = edgesOf("imports-across");
  assert.deepEqual(edges, [{ from: LAYER_FILE, to: TARGET, kind: "import", direction: "out" }]);
  const message = describeRefusals(edges).join("\n");
  assert.match(message, /REACH out: packages\/nvda-speech\/src\/x\.ts -> packages\/other\/src\/x\.ts/);
});

test("a `new URL(..., import.meta.url)` read that leaves the layer is REFUSED", () => {
  assert.deepEqual(edgesOf("url-read"), [{ from: LAYER_FILE, to: TARGET, kind: "path-literal", direction: "out" }]);
});

test("a `.cmd` launcher naming another package's path is REFUSED", () => {
  assert.deepEqual(edgesOf("launcher"), [
    { from: "packages/nvda-speech/src/run.cmd", to: TARGET, kind: "launcher", direction: "out" },
  ]);
});

test("a path named once in a constant and read through the variable is REFUSED", () => {
  assert.deepEqual(edgesOf("bound-literal"), [{ from: LAYER_FILE, to: TARGET, kind: "path-literal", direction: "out", via: { declaredLine: 2, readLine: 3 } }]);
});

test("a `<rev>:<path>` argument (the shape of `git show`) naming another package is REFUSED", () => {
  assert.deepEqual(edgesOf("git-show"), [{ from: LAYER_FILE, to: TARGET, kind: "path-literal", direction: "out" }]);
});

// ------------------------------------------------------------------ a path carried through a `const` (#2643)
//
// THE REFUSALS AND THE PASSES GO THROUGH ONE ENTRY POINT, `edgesOf`, which is `findEdges` over the fixture's own files: a
// guard that refuses everything would satisfy the refusals and fail the passes, and one that refuses nothing the reverse.

const viaOf = (name: string) => edgesOf(name).map((e) => ({ file: e.from.split("/").pop(), via: e.via }));

test("a path assigned to a `const` and read a few lines later is REFUSED, naming the declaration and the read", () => {
  assert.match(textOf("const-read", LAYER_FILE), /^const SIBLING = "packages\/other\/src\/x\.ts";$/m, "CONTROL: the const is really there");
  const edges = edgesOf("const-read");
  assert.deepEqual(edges, [{ from: LAYER_FILE, to: TARGET, kind: "path-literal", direction: "out", via: { declaredLine: 4, readLine: 7 } }]);
  const message = describeRefusals(edges).join("\n");
  assert.match(message, /through a const declared at line 4 and read at line 7/);
  assert.equal(cli("--check", `--root=${fixture("const-read")}`).status, 1, "and the command refuses it too");
});

test("a `const` that is only handed to a function that does not read PASSES: a parser, an `includes`, a `.map` over strings", () => {
  assert.ok(existsSync(join(fixture("const-parsed"), TARGET)), "CONTROL: the target exists, so this passes because the const is not read");
  const source = textOf("const-parsed", LAYER_FILE);
  assert.match(source, /^const PATH = "packages\/other\/src\/x\.ts";$/m);
  assert.match(source, /mentions\("see packages\/other\/src\/x\.ts", PATH\)/, "and the const is passed to a call");
  assert.match(source, /LIST\.map\(\(entry\) => entry\.toUpperCase\(\)\)/, "and a list of paths is walked by a callback that reads nothing");
  const scanned = trackedFiles(fixture("const-parsed")).filter((path) => isScanned(path));
  assert.ok(scanned.includes(LAYER_FILE) && scanned.includes("packages/nvda-speech/src/y.ts"), "POSITIVE CONTROL: both files are scanned");
  assert.deepEqual(edgesOf("const-parsed"), []);
  assert.equal(cli("--check", `--root=${fixture("const-parsed")}`).status, 0);
});

test("the property a read takes is the property that is read: `expect` holds another package's path as DATA and `file` is the layer's own", () => {
  const source = textOf("const-parsed", "packages/nvda-speech/src/y.ts");
  assert.match(source, /file: "packages\/nvda-speech\/src\/own\.ts", expect: "packages\/other\/src\/x\.ts"/);
  assert.match(source, /readFileSync\(join\(ROOT, file\)/);
  assert.deepEqual(edgesOf("const-parsed").filter((e) => e.from.endsWith("y.ts")), [], "the destructured `file` is judged, not every string in the list");
  const swapped = viaOf("const-array").filter((e) => e.file === "z.ts");
  assert.deepEqual(swapped, [{ file: "z.ts", via: { declaredLine: 4, readLine: 7 } }], "CONTROL: with the paths the other way round the same loop IS refused");
});

test("a path in a list `const` that is walked into a read is REFUSED: for-of into existsSync, a spread list mapped into join, a destructured loop", () => {
  assert.deepEqual(viaOf("const-array"), [
    { file: "x.ts", via: { declaredLine: 4, readLine: 8 } },
    { file: "y.ts", via: { declaredLine: 3, readLine: 7 } },
    { file: "z.ts", via: { declaredLine: 4, readLine: 7 } },
  ]);
  assert.match(textOf("const-array", "packages/nvda-speech/src/y.ts"), /const ALL = \[\.\.\.A, \.\.\.B\];/, "CONTROL: the list is built by spreading two");
  assert.ok(edgesOf("const-array").every((e) => e.to === TARGET), "the layer's own path in B is not a reach");
});

test("a `const` shadowed in an inner scope is judged on the value that reaches the read, on both sides of the block", () => {
  for (const file of ["x.ts", "y.ts"]) {
    assert.match(textOf("const-shadowed", `packages/nvda-speech/src/${file}`), /const P = "\.\/own\.ts"|const P = "\.\.\/\.\.\/other\/src\/x\.ts"/);
  }
  assert.ok(existsSync(join(fixture("const-shadowed"), "packages/nvda-speech/src/own.ts")), "CONTROL: `./own.ts` exists, so an unresolved read is not why one read is clean");
  assert.deepEqual(viaOf("const-shadowed"), [
    // the INNER const names the other package and is declared BEFORE a file-level const that names the layer's own file
    { file: "x.ts", via: { declaredLine: 3, readLine: 4 } },
    // the FILE-LEVEL const names the other package, an inner block shadows it with the layer's own file, and the read AFTER the block is the outer one
    { file: "y.ts", via: { declaredLine: 2, readLine: 7 } },
  ]);
});

// ------------------------------------------------------------------ worker-fleet, lab and control are layers too (#3501)

test("a declared layer of moves 2-4 that reaches across by path is REFUSED, naming both ends, for each of the three", () => {
  const edges = edgesOf("three-layers");
  assert.deepEqual(edges, [
    { from: "packages/other/src/y.ts", to: `${CONTROL_DIR}/src/own.ts`, kind: "import", direction: "in" },
    { from: `${LAB_DIR}/src/x.ts`, to: `${FLEET_DIR}/src/own.ts`, kind: "import", direction: "out" },
    { from: `${FLEET_DIR}/src/x.ts`, to: "packages/other/src/x.ts", kind: "import", direction: "out" },
    { from: `${CONTROL_DIR}/src/x.ts`, to: `${LAB_DIR}/src/own.ts`, kind: "path-literal", direction: "out" },
  ]);
  const message = describeRefusals(edges).join("\n");
  assert.match(message, new RegExp(`REACH out: ${FLEET_DIR}/src/x\\.ts -> packages/other/src/x\\.ts`));
  assert.match(message, new RegExp(`REACH out: ${LAB_DIR}/src/x\\.ts -> ${FLEET_DIR}/src/own\\.ts`), "an edge between two layers is named by both");
  assert.match(message, new RegExp(`REACH out: ${CONTROL_DIR}/src/x\\.ts -> ${LAB_DIR}/src/own\\.ts`));
  assert.equal(cli("--check", `--root=${fixture("three-layers")}`).status, 1, "and the command refuses it too");
});

test("the same three layers importing only themselves and a package by NAME PASS, with every file scanned", () => {
  const scanned = trackedFiles(fixture("three-layers-clean")).filter((path) => isScanned(path));
  assert.equal(scanned.length, THREE_LAYERS_CLEAN_FILES, "POSITIVE CONTROL: the clean fixture holds one x.ts and one own.ts per layer and one other package");
  assert.ok(SPLIT_LAYERS.every((layer) => scanned.includes(`packages/${layer}/src/x.ts`)), "and each of the three is among them");
  assert.deepEqual(edgesOf("three-layers-clean"), []);
  assert.equal(cli("--check", `--root=${fixture("three-layers-clean")}`).status, 0);
});

test("a `packages/<name>` token in a launcher whose <name> is no package is not a reach: a URL's path PASSES, the real token beside it is REFUSED", () => {
  assert.match(textOf("token-not-a-package", `${FLEET_DIR}/src/bootstrap.sh`), /cli\.github\.com\/packages\/githubcli-archive-keyring\.gpg/, "CONTROL: the URL is really there");
  assert.deepEqual(edgesOf("token-not-a-package"), [
    { from: `${FLEET_DIR}/src/bootstrap.sh`, to: TARGET, kind: "launcher", direction: "out" },
  ]);
});

test("the OTHER direction: a package that imports into the layer by path is REFUSED", () => {
  assert.deepEqual(edgesOf("reach-in"), [
    { from: "packages/other/src/y.ts", to: "packages/nvda-speech/src/own.ts", kind: "import", direction: "in" },
  ]);
});

test("a workflow and a config file naming a layer path are REFUSED, as `in` edges of their own kinds", () => {
  const kinds = edgesOf("workflow-config").map((e) => `${e.direction} ${e.kind} ${e.from}`).sort();
  assert.deepEqual([...new Set(kinds)], [
    "in config .c8rc.json",
    "in workflow .github/workflows/w.yml",
  ]);
});

// ------------------------------------------------------------------ the passes that must stay passes

test("a path mentioned ONLY in a comment PASSES, with the real target and the comment both present", () => {
  assert.ok(existsSync(join(fixture("comment-only"), TARGET)), "CONTROL: the target exists, so this passes because it is a comment");
  assert.match(textOf("comment-only", "packages/nvda-speech/src/x.ts"), /\/\/ import \{ X \} from "\.\.\/\.\.\/other\/src\/x\.ts"/);
  assert.match(textOf("comment-only", "packages/nvda-speech/src/run.cmd"), /^rem node "packages\\other\\src\\x\.ts"/m);
  assert.deepEqual(edgesOf("comment-only"), []);
});

test("a path handed to a parser as DATA PASSES: a region body and a fixture list are named, never read", () => {
  assert.ok(existsSync(join(fixture("data-only"), TARGET)), "CONTROL: the target exists, so this passes because it is data");
  assert.match(textOf("data-only", LAYER_FILE), /REGION_BODY = "packages\/other\/src\/x\.ts/);
  assert.match(textOf("data-only", LAYER_FILE), /parseRegion\("packages\/other\/src\/x\.ts"\)/, "and a path literal is handed to a call");
  assert.deepEqual(edgesOf("data-only"), []);
});

test("`${name}/package.json` is not the repository's package.json: a template that begins with an interpolation PASSES", () => {
  assert.ok(existsSync(join(fixture("dynamic-template"), "package.json")), "CONTROL: a root package.json exists to be falsely read");
  assert.match(textOf("dynamic-template", LAYER_FILE), /require\.resolve\(`\$\{name\}\/package\.json`\)/);
  assert.deepEqual(edgesOf("dynamic-template"), []);
});

// ------------------------------------------------------------------ there is NO baseline (ADR 0045 cut 9, #5087)

test("a baseline file that NAMES the edge does not excuse it: the file is not read, so no list exists to join", () => {
  const baseline = JSON.parse(readFileSync(join(fixture("baseline-ignored"), "packages/guards/layer-edges.baseline.json"), "utf8"));
  assert.equal(baseline.length, 1, "POSITIVE CONTROL: the fixture carries a baseline that names the edge");
  const edges = edgesOf("baseline-ignored");
  // The list is no longer exempt from its own scan either (it was, by name, in `SELF`): a file that names a layer's path is a reach like any other.
  assert.deepEqual(edges.map((e) => `${e.from} -> ${e.to}`), ["packages/guards/layer-edges.baseline.json -> packages/nvda-speech/src/x.ts", `${LAYER_FILE} -> ${TARGET}`],
    "and the tree really holds that edge, and the file that names it is one too");
  const refused = cli("--check", `--root=${fixture("baseline-ignored")}`);
  assert.equal(refused.status, 1, "the edge the baseline names is still refused");
  assert.match(refused.stderr, /REACH out: packages\/nvda-speech\/src\/x\.ts -> packages\/other\/src\/x\.ts/);
});

test("the module offers no way to record an edge: no baseline path, no reader and no verdict that takes a list", async () => {
  const exported = Object.keys(await import("./layer-edges.ts")).sort();
  assert.ok(exported.includes("findEdges") && exported.includes("describeRefusals"), "POSITIVE CONTROL: the reader of the exports sees the guard's own functions");
  assert.deepEqual(exported.filter((name) => /baseline|judge|disposition/i.test(name)), []);
});

test("a layer that has LEFT is still read: a host declaration naming agent-org's old directory is a reach, not a tree without one", () => {
  const edges = edgesOf("layer-left");
  assert.deepEqual(edges.map((e) => `${e.direction} ${e.kind} ${e.from} -> ${e.to}`), ["in config host.json -> packages/agent-org"]);
  assert.ok(!edgesOf("clean").some((e) => e.to.includes("githubcli-archive-keyring")), "and a URL's `/packages/` is read as no package");
});

test("the real tree holds NO reach into or out of a layer, and the scan that says so looked at files", () => {
  const tracked = trackedFiles(ROOT);
  // Measured at this change: 540 of 1,187 tracked files are scanned. The floor sits under that, so a scan that went blind is a failure here.
  assert.ok(tracked.filter((path) => isScanned(path)).length > SCANNED_AT_LEAST, "POSITIVE CONTROL: the scan read almost nothing, so an empty answer proves nothing");
  assert.equal(edgesOf("imports-across").length, 1, "and the same function SEES a planted reach");
  assert.deepEqual(describeRefusals(findEdges({ root: ROOT, tracked })), []);
});

// ------------------------------------------------------------------ the command

test("`--check` exits 0 over the real tree, and non-zero, naming both ends, over a tree with a new edge", () => {
  const real = cli("--check");
  assert.equal(real.status, 0, real.stderr);
  assert.match(real.stdout, /no reach/);
  assert.equal(cli("--check", `--root=${fixture("clean")}`).status, 0, "CONTROL: a clean tree is not refused");
  const crossing = cli("--check", `--root=${fixture("imports-across")}`);
  assert.equal(crossing.status, 1);
  assert.match(crossing.stderr, /REACH out: packages\/nvda-speech\/src\/x\.ts -> packages\/other\/src\/x\.ts/);
});

test("a mistyped flag is refused rather than run as the default, and no mode is a usage error", () => {
  assert.notEqual(cli("--chek").status, 0, "an unknown flag must not run the default and report success");
  assert.equal(cli().status, 2, "no mode is a usage error, not a pass");
});
