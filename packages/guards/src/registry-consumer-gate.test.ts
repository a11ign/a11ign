/**
 * `scripts/registry-consumer-gate.mjs` decides, over an install read as DATA, what a consumer of the PUBLISHED a11ign could not run.
 *
 * What is pinned here, and why each is a way the gate could answer wrongly:
 *   1. EVERY REFUSAL HAS A TRIGGER AND A CLEAN COUNTERPART. `protocolFindings`, `duplicateFindings`, `rangeFindings`, `versionFindings`
 *      and `importFindings` each refuse on their own input and stay silent on the neighbouring one. An emptiness assertion is always
 *      paired with a positive control that the same function is non-empty on other input.
 *   2. UNCHECKED IS NEVER CLEAN. A CLI with no `--version`, a layer that is unpublished, a registry that could not be asked and a
 *      package whose own code threw are named as UNCHECKED, not dropped and not passed.
 *   3. THE SHIPPED FIXTURES AGREE WITH THE GATE (`selfCheckProblems`), and the self-check itself refuses when its own controls are
 *      missing (no passing fixture, a rule no fixture trips).
 *   4. THE READER sees the install the way Node would: nested copies keep their `node_modules/...` path, scoped names are joined,
 *      dot-directories and files are skipped, and a manifest that does not parse is an exit 2, never a pass.
 *
 * Nothing here touches the network or the registry: `installFromRegistry` is exercised only on its refusal for a non-empty directory
 * (it throws before it spawns `npm`), and `readInstall` runs with `offline` against a throwaway tree.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const gate = await import(pathToFileURL(join(REPO_ROOT, "scripts/registry-consumer-gate.mjs")).href);
const {
  ENTRY_PACKAGE, RULES, FIXTURES_DIR, isOurs, isLoaderFailure, protocolFindings, duplicateFindings, lookupPaths, rangeFindings,
  versionFindings, importFindings, layerFindings, decide, formatDecision, readInstalledTree, repositoryLayers, readInstall,
  installFromRegistry, loadFixtures, selfCheckProblems, main,
} = gate;

const EXIT_REFUSED = 1;
const EXIT_UNREADABLE = 2;
/** `rangeFindings` over the first three of the four packages: everything but the nested copy. */
const THREE_OF_FOUR = 3;
const EXIT_COMMAND_NOT_FOUND = 127;
const EXIT_OTHER_FAILURE = 3;
/** How much of a failing tool's output the gate quotes (`PREVIEW_CHARS` in the source), and a line well past it. */
const PREVIEW_CHARS = 200;
const LONG_LINE_CHARS = 500;
const EXECUTABLE = 0o755;

interface Pkg { name: string; version: string; path: string; entry: boolean; dependencies?: Record<string, string>; optionalDependencies?: Record<string, string>; peerDependencies?: Record<string, string> }

/** A hoisted package of ours, as `readInstalledTree` would report it. */
const pkg = (name: string, version: string, extra: Partial<Pkg> = {}): Pkg => ({ name, version, path: `node_modules/${name}`, entry: true, ...extra });
/** The same, nested under another package's own `node_modules`. */
const nested = (under: string, name: string, version: string, extra: Partial<Pkg> = {}): Pkg =>
  ({ name, version, path: `node_modules/${under}/node_modules/${name}`, entry: true, ...extra });
const printed = (stdout: string, exitCode: number | null = 0, stderr = "") => ({ exitCode, stdout, stderr });
const rulesOf = (refusals: Array<{ rule: string }>) => refusals.map((r) => r.rule);

/** A reading that passes: the entry package, its one dependency, a printed version, an import that worked, and nothing else asked. */
const cleanReading = () => ({
  packages: [pkg("a11ign", "1.2.3", { dependencies: { "@a11ign/evidence": "^1.2.0" } }), pkg("@a11ign/evidence", "1.2.5")],
  version: printed("1.2.3\n"),
  imports: [{ name: "a11ign", ok: true as const }],
  layers: [],
});

/** Silences and records `console.log`/`console.error` for the duration of `run`. */
function captureConsole<T>(run: () => T): { value: T; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  const original = { log: console.log, error: console.error };
  console.log = (...args: unknown[]) => { out.push(args.join(" ")); };
  console.error = (...args: unknown[]) => { err.push(args.join(" ")); };
  try {
    return { value: run(), out, err };
  } finally {
    console.log = original.log;
    console.error = original.error;
  }
}

/** Runs `body` with a fresh directory under the OS temp dir, removed afterwards even when `body` throws. */
function withTempDir<T>(body: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "registry-consumer-gate-test-"));
  try {
    return body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeManifest(root: string, relative: string, manifest: Record<string, unknown>): void {
  const dir = join(root, relative);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify(manifest));
}

test("isOurs: the entry package and every @a11ign/ scope, nothing that merely resembles them", () => {
  assert.equal(isOurs("a11ign"), true);
  assert.equal(isOurs("@a11ign/judge"), true);
  assert.equal(isOurs("a11ign-extras"), false);
  assert.equal(isOurs("@a11ignore/judge"), false);
  assert.equal(isOurs("@anthropic-ai/sdk"), false);
  assert.equal(ENTRY_PACKAGE, "a11ign");
});

test("isLoaderFailure: Node's ERR_* codes, CommonJS's MODULE_NOT_FOUND and SyntaxError are the loader's; a plain throw is the package's", () => {
  assert.equal(isLoaderFailure({ code: "ERR_MODULE_NOT_FOUND", errorName: "Error" }), true);
  assert.equal(isLoaderFailure({ code: "ERR_PACKAGE_IMPORT_NOT_DEFINED", errorName: "TypeError" }), true);
  assert.equal(isLoaderFailure({ code: "MODULE_NOT_FOUND", errorName: "Error" }), true);
  assert.equal(isLoaderFailure({ code: null, errorName: "SyntaxError" }), true);
  assert.equal(isLoaderFailure({ code: null, errorName: "Error" }), false);
  assert.equal(isLoaderFailure({ code: "EACCES", errorName: "Error" }), false);
});

test("protocolFindings: workspace: and a 0.0.0 pin on a sibling are refused, with the field and range in the detail", () => {
  const found = protocolFindings([
    pkg("@a11ign/judge", "1.0.0", { dependencies: { "@a11ign/evidence": "workspace:*" }, peerDependencies: { "@a11ign/scorer": "^0.0.0" } }),
    pkg("a11ign", "1.0.0", { optionalDependencies: { "@a11ign/lab": "0.0.0" } }),
  ]);
  assert.deepEqual(rulesOf(found), ["workspace-protocol", "zero-pin", "zero-pin"]);
  assert.equal(found[0].package, "@a11ign/judge");
  assert.match(found[0].detail, /node_modules\/@a11ign\/judge: dependencies\["@a11ign\/evidence"\] is "workspace:\*" -- the workspace: protocol/);
  assert.match(found[1].detail, /peerDependencies\["@a11ign\/scorer"\] is "\^0\.0\.0"/);
  assert.equal(found[2].package, "a11ign");
});

test("protocolFindings: a 0.0.0 range on a package that is NOT ours, a package of someone else's, and real pins are left alone", () => {
  const clean = protocolFindings([
    pkg("a11ign", "1.0.0", { dependencies: { "@a11ign/judge": "^1.0.0", "left-pad": "0.0.0" } }),
    pkg("left-pad", "1.0.0", { dependencies: { "@a11ign/judge": "workspace:*" } }),
  ]);
  assert.deepEqual(clean, []);
  // Positive control: the same function does refuse once a dependant of ours carries the placeholder.
  assert.equal(protocolFindings([pkg("a11ign", "1.0.0", { dependencies: { "@a11ign/judge": "~0.0.0" } })]).length, 1);
  assert.equal(protocolFindings([pkg("a11ign", "1.0.0", { dependencies: { "@a11ign/judge": ">=0.0.0" } })]).length, 1);
});

test("duplicateFindings: a second copy of @a11ign/evidence is refused, naming both versions and paths; other duplicates are not its business", () => {
  const found = duplicateFindings([
    pkg("@a11ign/evidence", "1.0.0"),
    nested("@a11ign/judge", "@a11ign/evidence", "0.9.0"),
    pkg("left-pad", "1.0.0"),
    nested("x", "left-pad", "2.0.0"),
  ]);
  assert.equal(found.length, 1);
  assert.equal(found[0].rule, "duplicate-copy");
  assert.equal(found[0].package, "@a11ign/evidence");
  assert.match(found[0].detail, /^2 copies installed \(1\.0\.0 at node_modules\/@a11ign\/evidence; 0\.9\.0 at node_modules\/@a11ign\/judge\/node_modules\/@a11ign\/evidence\)/);
  assert.deepEqual(duplicateFindings([pkg("@a11ign/evidence", "1.0.0"), pkg("left-pad", "1.0.0"), nested("x", "left-pad", "2.0.0")]), []);
});

test("lookupPaths: nearest first, walking out through every enclosing node_modules", () => {
  assert.deepEqual(lookupPaths("node_modules/a11ign", "@a11ign/evidence"), [
    "node_modules/a11ign/node_modules/@a11ign/evidence",
    "node_modules/@a11ign/evidence",
  ]);
  assert.deepEqual(lookupPaths("node_modules/x/node_modules/y", "dep"), [
    "node_modules/x/node_modules/y/node_modules/dep",
    "node_modules/x/node_modules/dep",
    "node_modules/dep",
  ]);
});

test("rangeFindings: a satisfied range is silent; an unsatisfied, unreadable or unresolvable one is refused", () => {
  assert.deepEqual(rangeFindings(cleanReading().packages), []);

  const unsatisfied = rangeFindings([pkg("a11ign", "1.0.0", { dependencies: { "@a11ign/evidence": "^2.0.0" } }), pkg("@a11ign/evidence", "1.2.5")]);
  assert.deepEqual(rulesOf(unsatisfied), ["unsatisfied-range"]);
  assert.match(unsatisfied[0].detail, /installed 1\.2\.5 at node_modules\/@a11ign\/evidence does not satisfy it/);

  const unreadable = rangeFindings([pkg("a11ign", "1.0.0", { dependencies: { "@a11ign/evidence": "latest" } }), pkg("@a11ign/evidence", "1.2.5")]);
  assert.deepEqual(rulesOf(unreadable), ["unsatisfied-range"]);
  assert.match(unreadable[0].detail, /a range this gate cannot read/);

  const missing = rangeFindings([pkg("a11ign", "1.0.0", { dependencies: { "@a11ign/evidence": "^1.0.0" } })]);
  assert.match(missing[0].detail, /nothing installed resolves it/);
});

test("rangeFindings: an optional dependency that is absent is allowed, a present one must still satisfy; workspace: and 0.0.0 belong to protocolFindings", () => {
  assert.deepEqual(rangeFindings([pkg("a11ign", "1.0.0", { optionalDependencies: { "@a11ign/lab": "^1.0.0" } })]), []);
  const present = rangeFindings([pkg("a11ign", "1.0.0", { optionalDependencies: { "@a11ign/lab": "^2.0.0" } }), pkg("@a11ign/lab", "1.0.0")]);
  assert.deepEqual(rulesOf(present), ["unsatisfied-range"]);
  assert.deepEqual(rangeFindings([pkg("a11ign", "1.0.0", { dependencies: { "@a11ign/a": "workspace:*", "@a11ign/b": "0.0.0" } })]), []);
  assert.deepEqual(rangeFindings([pkg("a11ign", "1.0.0", { dependencies: { "left-pad": "^9.0.0" } })]), []);
});

test("rangeFindings: a NESTED copy shadows the hoisted one for its dependant, as Node resolves it", () => {
  const packages = [
    pkg("a11ign", "1.0.0", { dependencies: { "@a11ign/judge": "^1.0.0" } }),
    pkg("@a11ign/judge", "1.0.0", { dependencies: { "@a11ign/evidence": "^2.0.0" } }),
    pkg("@a11ign/evidence", "1.0.0"),
    nested("@a11ign/judge", "@a11ign/evidence", "2.1.0"),
  ];
  assert.deepEqual(rangeFindings(packages), []);
  // Positive control: without the nested copy the hoisted 1.0.0 is what resolves, and it does not satisfy ^2.
  assert.deepEqual(rulesOf(rangeFindings(packages.slice(0, THREE_OF_FOUR))), ["unsatisfied-range"]);
});

test("versionFindings: the printed version equal to the installed one is checked; a different one is a mismatch", () => {
  const ok = versionFindings(printed("a11ign 1.2.3\n"), "1.2.3");
  assert.deepEqual(ok.refused, []);
  assert.deepEqual(ok.checked, ["npx a11ign --version printed 1.2.3, the installed version"]);

  const mismatch = versionFindings(printed("1.2.4-beta.1\n"), "1.2.3");
  assert.deepEqual(rulesOf(mismatch.refused), ["version-mismatch"]);
  assert.equal(mismatch.refused[0].detail, "npx a11ign --version printed 1.2.4-beta.1, but 1.2.3 is what was installed");
  assert.deepEqual(mismatch.checked, []);
});

test("versionFindings: usage text with a non-zero exit is UNCHECKED, not refused and not checked", () => {
  const result = versionFindings(printed("Usage: a11ign <url>\n", 1), "0.1.0");
  assert.deepEqual(result.refused, []);
  assert.deepEqual(result.checked, []);
  assert.equal(result.unchecked.length, 1);
  assert.equal(result.unchecked[0].what, "npx a11ign --version");
  assert.match(result.unchecked[0].reason, /a11ign@0\.1\.0 has no --version flag \(it printed its usage and exited 1\)/);
  // Usage on stderr counts too.
  assert.equal(versionFindings(printed("", 2, "Usage: a11ign"), "0.1.0").unchecked.length, 1);
});

test("versionFindings: exit 0 with no version is refused, a crash is cli-unrunnable with the first line of its output", () => {
  const silent = versionFindings(printed("hello\n", 0), "1.0.0");
  assert.deepEqual(rulesOf(silent.refused), ["version-mismatch"]);
  assert.match(silent.refused[0].detail, /exited 0 and printed no version/);

  const crash = versionFindings(printed("", EXIT_COMMAND_NOT_FOUND, "  sh: a11ign: not found\nsecond line\n"), "1.0.0");
  assert.deepEqual(rulesOf(crash.refused), ["cli-unrunnable"]);
  assert.equal(crash.refused[0].detail, `npx a11ign --version exited ${EXIT_COMMAND_NOT_FOUND}: sh: a11ign: not found`);

  const fromStdout = versionFindings(printed("boom\n", EXIT_OTHER_FAILURE, ""), "1.0.0");
  assert.equal(fromStdout.refused[0].detail, `npx a11ign --version exited ${EXIT_OTHER_FAILURE}: boom`);

  const longLine = "x".repeat(LONG_LINE_CHARS);
  const truncated = versionFindings(printed("", 1, longLine), "1.0.0").refused[0].detail;
  assert.equal(truncated, `npx a11ign --version exited 1: ${"x".repeat(PREVIEW_CHARS)}`);
});

test("versionFindings: a null exit code (killed or never spawned) is a crash, not a pass", () => {
  const result = versionFindings(printed("", null, "Error: spawn ENOENT"), "1.0.0");
  assert.deepEqual(rulesOf(result.refused), ["cli-unrunnable"]);
  assert.match(result.refused[0].detail, /exited null: Error: spawn ENOENT/);
});

test("importFindings: a success is checked, a loader failure is refused, the package's own throw is UNCHECKED unless requireImports", () => {
  const imports = [
    { name: "@a11ign/evidence", ok: true as const },
    { name: "@a11ign/judge", ok: false as const, code: "ERR_MODULE_NOT_FOUND", errorName: "Error", message: "Cannot find module x" },
    { name: "@a11ign/screenreader-worker", ok: false as const, code: null, errorName: "Error", message: "no screen reader" },
  ];
  const lenient = importFindings(imports, { requireImports: false });
  assert.deepEqual(lenient.checked, ['import("@a11ign/evidence") succeeded']);
  assert.equal(lenient.refused.length, 1);
  assert.deepEqual({ rule: lenient.refused[0].rule, package: lenient.refused[0].package }, { rule: "import-failed", package: "@a11ign/judge" });
  assert.equal(lenient.refused[0].detail, 'import("@a11ign/judge") failed -- Error ERR_MODULE_NOT_FOUND: Cannot find module x');
  assert.equal(lenient.unchecked.length, 1);
  assert.equal(lenient.unchecked[0].what, 'import("@a11ign/screenreader-worker")');
  assert.match(lenient.unchecked[0].reason, /every specifier resolved and the package's own code then threw \(Error: no screen reader\)/);

  const strict = importFindings(imports, { requireImports: true });
  assert.deepEqual(strict.refused.map((r: { package: string }) => r.package), ["@a11ign/judge", "@a11ign/screenreader-worker"]);
  assert.equal(strict.refused[1].detail, 'import("@a11ign/screenreader-worker") failed -- Error: no screen reader');
  assert.deepEqual(strict.unchecked, []);
});

test("importFindings: no imports at all yields nothing in every list", () => {
  assert.deepEqual(importFindings([], { requireImports: true }), { refused: [], unchecked: [], checked: [] });
});

test("layerFindings: only layers that are NOT installed are reported, each with the registry's word for it", () => {
  const layers = [
    { name: "@a11ign/judge", registry: { published: true as const, version: "1.0.0" } },
    { name: "@a11ign/lab", registry: { published: false as const } },
    { name: "@a11ign/control", registry: { published: null, why: "ENOTFOUND" } },
    { name: "@a11ign/evidence", registry: { published: true as const, version: "1.2.5" } },
  ];
  const found = layerFindings(layers, [pkg("@a11ign/evidence", "1.2.5")]);
  assert.deepEqual(found.map((u: { what: string }) => u.what), ["@a11ign/judge", "@a11ign/lab", "@a11ign/control"]);
  assert.match(found[0].reason, /^published \(1\.0\.0\) but a11ign does not install it/);
  assert.match(found[1].reason, /^not on the registry \(E404\)/);
  assert.equal(found[2].reason, "the registry could not be asked (ENOTFOUND), which is not an answer");
  assert.deepEqual(layerFindings([], []), []);
});

test("decide: an empty reading, or one without node_modules/a11ign, is refused as nothing-installed", () => {
  const empty = decide({ packages: [], version: printed(""), imports: [], layers: [] });
  assert.deepEqual(empty.refused, [{ rule: "nothing-installed", package: "a11ign",
    detail: "0 package(s) read and none is node_modules/a11ign: an empty reading proves nothing" }]);
  assert.deepEqual([empty.checked, empty.unchecked], [[], []]);

  // A NESTED a11ign is not the one the consumer typed.
  const wrongPath = decide({ ...cleanReading(), packages: [nested("x", "a11ign", "1.2.3"), pkg("@a11ign/evidence", "1.2.5")] });
  assert.deepEqual(rulesOf(wrongPath.refused), ["nothing-installed"]);
  assert.match(wrongPath.refused[0].detail, /^2 package\(s\) read/);
});

test("decide: a clean reading refuses nothing and reports what it read; a broken one carries every rule's refusals together", () => {
  const clean = decide(cleanReading());
  assert.deepEqual(clean.refused, []);
  assert.deepEqual(clean.unchecked, []);
  assert.deepEqual(clean.checked, [
    "2 installed package(s) of ours read: a11ign@1.2.3, @a11ign/evidence@1.2.5",
    "1 internal dependency range(s) read",
    "npx a11ign --version printed 1.2.3, the installed version",
    'import("a11ign") succeeded',
  ]);

  const broken = decide({
    packages: [
      pkg("a11ign", "1.2.3", { dependencies: { "@a11ign/evidence": "workspace:^", "@a11ign/judge": "^9.0.0" } }),
      pkg("@a11ign/evidence", "1.0.0"), nested("a11ign", "@a11ign/evidence", "1.1.0"), pkg("@a11ign/judge", "1.0.0"),
    ],
    version: printed("", 1, "kaput"),
    imports: [{ name: "a11ign", ok: false, code: "ERR_PACKAGE_PATH_NOT_EXPORTED", errorName: "Error", message: "nope" }],
    layers: [{ name: "@a11ign/lab", registry: { published: false } }],
  });
  assert.deepEqual(rulesOf(broken.refused), ["workspace-protocol", "duplicate-copy", "unsatisfied-range", "cli-unrunnable", "import-failed"]);
  assert.deepEqual(broken.unchecked.map((u: { what: string }) => u.what), ["@a11ign/lab"]);
});

test("decide: requireImports turns a package's own throw from UNCHECKED into a refusal", () => {
  const reading = { ...cleanReading(), imports: [{ name: "a11ign", ok: false as const, code: null, errorName: "Error", message: "needs a screen reader" }] };
  assert.deepEqual(decide(reading).refused, []);
  assert.equal(decide(reading).unchecked.length, 1);
  assert.deepEqual(rulesOf(decide(reading, { requireImports: true }).refused), ["import-failed"]);
});

test("formatDecision: one prefixed line per finding and a verdict line that does not call unchecked clean", () => {
  const passing = formatDecision({
    checked: ["did a thing"], unchecked: [{ what: "import(\"x\")", reason: "unknown" }], refused: [],
  });
  assert.equal(passing, [
    "checked:   did a thing",
    'UNCHECKED: import("x") -- unknown',
    "registry-consumer-gate: nothing refused (1 thing(s) UNCHECKED above, which is not the same as clean)",
  ].join("\n"));

  const failing = formatDecision({
    checked: [], unchecked: [], refused: [{ rule: "zero-pin", package: "a11ign", detail: "d" }, { rule: "duplicate-copy", package: "e", detail: "f" }],
  });
  assert.equal(failing, ["REFUSED:   [zero-pin] a11ign: d", "REFUSED:   [duplicate-copy] e: f", "registry-consumer-gate: 2 REFUSED"].join("\n"));
});

test("selfCheckProblems over the shipped fixtures: the gate agrees with every one, and every rule is tripped", () => {
  const fixtures = loadFixtures();
  assert.deepEqual(selfCheckProblems(fixtures), []);
  // Positive control for the emptiness above: the population is real, and the rules list is the one the fixtures exercise.
  assert.ok(fixtures.length >= RULES.length, `${fixtures.length} fixtures for ${RULES.length} rules`);
  assert.deepEqual(fixtures.map((f: { file: string }) => f.file), [...fixtures.map((f: { file: string }) => f.file)].sort());
  assert.ok(fixtures.every(({ file }: { file: string }) => file.endsWith(".json")));
  assert.ok(FIXTURES_DIR.endsWith("scripts/fixtures/registry-consumer-gate"));
});

test("selfCheckProblems: a fixture that expects the wrong refusals, a missing UNCHECKED, no passing fixture and an untripped rule are each reported", () => {
  const fixtures = loadFixtures();
  const clean = fixtures.find((f: { file: string }) => f.file === "clean.json");
  assert.ok(clean, "clean.json is the positive control");

  const wrongExpectation = [{ file: "x.json", fixture: { ...clean.fixture, expect: { refused: [{ rule: "zero-pin", package: "a11ign" }] } } }];
  const problems = selfCheckProblems(wrongExpectation);
  assert.ok(problems.includes("x.json: expected [zero-pin a11ign] refused, got []"), problems.join("\n"));
  assert.ok(problems.includes("no fixture expects a PASS: an always-refusing gate would satisfy every refusal (the positive control is missing)"));
  for (const rule of RULES) assert.ok(problems.includes(`no fixture trips the rule "${rule}"`), rule);

  const missingUnchecked = [{ file: "y.json", fixture: { ...clean.fixture, expect: { refused: [], unchecked: ["@a11ign/nowhere"] } } }];
  assert.ok(selfCheckProblems(missingUnchecked).includes("y.json: expected UNCHECKED @a11ign/nowhere, not reported"));

  assert.equal(selfCheckProblems([]).length, 1 + RULES.length, "no fixtures at all: the control is missing and every rule untripped");
});

test("selfCheckProblems: a fixture whose requireImports flag changes the outcome is honoured", () => {
  const throwing = { name: "a11ign", ok: false, code: null, errorName: "Error", message: "platform" };
  const reading = { ...cleanReading(), imports: [throwing] };
  const lenient = [{ file: "l.json", fixture: { description: "", expect: { refused: [] }, reading } }];
  const strict = [{ file: "s.json", fixture: { description: "", requireImports: true, expect: { refused: [{ rule: "import-failed", package: "a11ign" }] }, reading } }];
  const lenientProblems = selfCheckProblems(lenient).filter((p: string) => p.startsWith("l.json"));
  const strictProblems = selfCheckProblems(strict).filter((p: string) => p.startsWith("s.json"));
  assert.deepEqual([lenientProblems, strictProblems], [[], []]);
  // Positive control: the same strict expectation without the flag is a reported disagreement.
  const unflagged = [{ file: "u.json", fixture: { ...strict[0].fixture, requireImports: false } }];
  assert.deepEqual(selfCheckProblems(unflagged).filter((p: string) => p.startsWith("u.json")),
    ["u.json: expected [import-failed a11ign] refused, got []"]);
});

test("readInstalledTree: hoisted, scoped and nested packages keep their node_modules path; dot-dirs, files and manifest-less dirs are skipped", () => {
  withTempDir((dir) => {
    writeManifest(dir, "node_modules/a11ign", { name: "a11ign", version: "1.0.0", main: "index.js", dependencies: { "@a11ign/judge": "^1.0.0" } });
    writeManifest(dir, "node_modules/a11ign/node_modules/@a11ign/judge", { name: "@a11ign/judge", version: "1.0.1", exports: { ".": "./i.js" } });
    writeManifest(dir, "node_modules/left-pad", { name: "left-pad", version: "2.0.0", exports: { "./sub": "./s.js" }, peerDependencies: { x: "1" } });
    writeManifest(dir, "node_modules/stringy", { name: "stringy", version: "1.0.0", exports: "./i.js", optionalDependencies: { y: "2" } });
    writeManifest(dir, "node_modules/.bin-like", { name: "hidden", version: "1.0.0" });
    mkdirSync(join(dir, "node_modules/no-manifest"), { recursive: true });
    writeFileSync(join(dir, "node_modules/stray-file.txt"), "not a package");

    const read = readInstalledTree(dir) as Pkg[];
    const byPath = new Map(read.map((p) => [p.path, p]));
    assert.deepEqual([...byPath.keys()].sort(), [
      "node_modules/a11ign",
      "node_modules/a11ign/node_modules/@a11ign/judge",
      "node_modules/left-pad",
      "node_modules/stringy",
    ]);
    assert.deepEqual(byPath.get("node_modules/a11ign"), {
      name: "a11ign", version: "1.0.0", path: "node_modules/a11ign", entry: true,
      dependencies: { "@a11ign/judge": "^1.0.0" }, optionalDependencies: undefined, peerDependencies: undefined,
    });
    assert.equal(byPath.get("node_modules/a11ign/node_modules/@a11ign/judge")?.entry, true, "exports['.'] declares an entry");
    assert.equal(byPath.get("node_modules/left-pad")?.entry, false, "an exports map without '.' declares none");
    assert.deepEqual(byPath.get("node_modules/left-pad")?.peerDependencies, { x: "1" });
    assert.equal(byPath.get("node_modules/stringy")?.entry, true, "a string exports declares an entry");
  });
});

test("readInstalledTree: no node_modules is an empty tree, and a manifest that does not parse throws rather than being skipped", () => {
  withTempDir((dir) => {
    assert.deepEqual(readInstalledTree(dir), []);
    mkdirSync(join(dir, "node_modules/broken"), { recursive: true });
    writeFileSync(join(dir, "node_modules/broken/package.json"), "{ not json");
    assert.throws(() => readInstalledTree(dir), SyntaxError);
  });
});

test("repositoryLayers: the @a11ign/* names of the packages a checkout holds, sorted; directories without a manifest or scope are ignored", () => {
  withTempDir((root) => {
    writeManifest(root, "packages/zeta", { name: "@a11ign/zeta" });
    writeManifest(root, "packages/alpha", { name: "@a11ign/alpha" });
    writeManifest(root, "packages/outsider", { name: "left-pad" });
    writeManifest(root, "packages/nameless", { version: "1.0.0" });
    mkdirSync(join(root, "packages/empty-dir"), { recursive: true });
    writeFileSync(join(root, "packages/README.md"), "a file, not a package");
    assert.deepEqual(repositoryLayers(root), ["@a11ign/alpha", "@a11ign/zeta"]);
  });
  // Positive control: the real checkout has layers, so an empty answer above would not have been the function's default.
  const real = repositoryLayers(REPO_ROOT) as string[];
  assert.ok(real.length > 0 && real.every((name) => name.startsWith("@a11ign/")));
});

test("installFromRegistry: a directory that already holds anything is refused before npm is spawned, and nothing is written", () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, "stray.txt"), "x");
    assert.throws(() => installFromRegistry(dir, "latest"), /is not empty: the point of this gate is a directory with nothing beside the install/);
    assert.equal(readFileSync(join(dir, "stray.txt"), "utf8"), "x");
    assert.throws(() => readFileSync(join(dir, "package.json")), { code: "ENOENT" });
  });
});

/** An install holding `a11ign` whose bin prints `output`, and a second layer whose import throws at evaluation. */
function buildInstall(dir: string, output: string): void {
  writeManifest(dir, "node_modules/a11ign", { name: "a11ign", version: "1.2.3", main: "index.mjs", type: "module" });
  writeFileSync(join(dir, "node_modules/a11ign/index.mjs"), "export const ok = true;\n");
  writeManifest(dir, "node_modules/@a11ign/boom", { name: "@a11ign/boom", version: "1.0.0", main: "index.mjs", type: "module" });
  writeFileSync(join(dir, "node_modules/@a11ign/boom/index.mjs"), 'throw new Error("no screen reader here");\n');
  writeManifest(dir, "node_modules/@a11ign/lost", { name: "@a11ign/lost", version: "1.0.0", main: "missing.mjs", type: "module" });
  mkdirSync(join(dir, "node_modules/.bin"), { recursive: true });
  const bin = join(dir, "node_modules/.bin/a11ign");
  writeFileSync(bin, `#!/bin/sh\necho "${output}"\n`);
  chmodSync(bin, EXECUTABLE);
}

test("readInstall (offline): imports are probed in a child process, and every layer this checkout holds that is not installed reads 'could not ask'", () => {
  withTempDir((dir) => {
    buildInstall(dir, "1.2.3");
    const reading = readInstall(dir, { offline: true });
    assert.deepEqual((reading.packages as Pkg[]).map((p) => p.name).sort(), ["@a11ign/boom", "@a11ign/lost", "a11ign"]);

    const outcomes = new Map(reading.imports.map((i: { name: string }) => [i.name, i]));
    assert.deepEqual(outcomes.get("a11ign"), { name: "a11ign", ok: true });
    const boom = outcomes.get("@a11ign/boom") as { ok: boolean; code: unknown; message: string };
    assert.equal(boom.ok, false);
    assert.equal(boom.code, null, "the package's own throw carries no loader code");
    assert.equal(boom.message, "no screen reader here");
    const lost = outcomes.get("@a11ign/lost") as { ok: boolean; code: string };
    assert.equal(lost.ok, false);
    assert.equal(lost.code, "ERR_MODULE_NOT_FOUND");

    const real = repositoryLayers(REPO_ROOT) as string[];
    assert.deepEqual(reading.layers.map((l: { name: string }) => l.name), real.filter((n) => !["@a11ign/boom", "@a11ign/lost"].includes(n)));
    assert.ok(reading.layers.length > 0);
    assert.ok(reading.layers.every((l: { registry: unknown }) => JSON.stringify(l.registry) === '{"published":null,"why":"--offline"}'));

    // And the decision over it: the loader failure is refused, the package's own throw is only UNCHECKED.
    const decision = decide(reading);
    assert.deepEqual(decision.refused.map((r: { package: string }) => r.package), ["@a11ign/lost"]);
    assert.ok(decision.unchecked.some((u: { what: string }) => u.what === 'import("@a11ign/boom")'));
  });
});

test("main --existing --offline: exit 1 when something is refused, 0 when nothing is; the directory is left in place", () => {
  withTempDir((dir) => {
    buildInstall(dir, "1.2.3");
    const refused = captureConsole(() => main([`--existing=${dir}`, "--offline"]));
    assert.equal(refused.value, EXIT_REFUSED);
    assert.equal(refused.out[0], `registry-consumer-gate: read ${dir}`);
    assert.match(refused.out[1], /REFUSED: {3}\[import-failed\] @a11ign\/lost:/);
    assert.match(refused.out[1], /registry-consumer-gate: 1 REFUSED$/);

    rmSync(join(dir, "node_modules/@a11ign/lost"), { recursive: true });
    const passed = captureConsole(() => main([`--existing=${dir}`, "--offline"]));
    assert.equal(passed.value, 0);
    assert.match(passed.out[1], /registry-consumer-gate: nothing refused \(\d+ thing\(s\) UNCHECKED above, which is not the same as clean\)$/);
    assert.match(passed.out[1], /UNCHECKED: import\("@a11ign\/boom"\)/);

    // --require-imports turns the package's own throw into a refusal.
    const strict = captureConsole(() => main([`--existing=${dir}`, "--offline", "--require-imports"]));
    assert.equal(strict.value, EXIT_REFUSED);
    assert.match(strict.out[1], /\[import-failed\] @a11ign\/boom/);
  });
});

test("main --existing: an empty directory is nothing-installed (exit 1); an unreadable manifest is exit 2, never a pass", () => {
  withTempDir((dir) => {
    const empty = captureConsole(() => main([`--existing=${dir}`, "--offline"]));
    assert.equal(empty.value, EXIT_REFUSED);
    assert.match(empty.out[1], /\[nothing-installed\] a11ign: 0 package\(s\) read/);

    mkdirSync(join(dir, "node_modules/bad"), { recursive: true });
    writeFileSync(join(dir, "node_modules/bad/package.json"), "{ nope");
    const unreadable = captureConsole(() => main([`--existing=${dir}`, "--offline"]));
    assert.equal(unreadable.value, EXIT_UNREADABLE);
    assert.match(unreadable.err[0], /^registry-consumer-gate: could not read an install, and that is never a pass: /);
  });
});

test("main --into a non-empty directory: the install is refused as exit 2 and the directory is NOT removed", () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, "keep.txt"), "mine");
    const result = captureConsole(() => main([`--into=${dir}`, "--spec=0.1.0"]));
    assert.equal(result.value, EXIT_UNREADABLE);
    assert.match(result.err[0], /is not empty/);
    assert.equal(readFileSync(join(dir, "keep.txt"), "utf8"), "mine");
  });
});

test("main --self-check: exit 0 and a summary naming the fixtures and rules over the shipped fixtures", () => {
  const result = captureConsole(() => main(["--self-check"]));
  assert.equal(result.value, 0);
  const fixtureCount = (loadFixtures() as unknown[]).length;
  assert.equal(result.out.length, fixtureCount + 1);
  assert.ok(result.out.slice(0, fixtureCount).every((line) => /^fixture [a-z-]+\.json: /.test(line)));
  assert.equal(result.out.at(-1), `registry-consumer-gate --self-check: ${fixtureCount} fixture(s), every rule (${RULES.length}) tripped, the clean one passes.`);
  assert.deepEqual(result.err, []);
});
