#!/usr/bin/env node
// @ts-check
// command: install what is PUBLISHED (a11ign from the registry) into an empty directory and refuse what a consumer could not run
/**
 * THE REGISTRY GATE -- #2519, the child of #69 that `ceo` ruled comes first (2026-09-25).
 *
 * `consumer-gate.yml` and `action-smoke.yml` both run the Action from a commit of THIS repository, so every
 * package resolves through the workspace. `isolation-gate` packs tarballs and installs them, which proves the
 * tarball a publish WOULD make. Nothing installed what the registry actually SERVES. A published
 * `a11ign@0.1.0` that cannot resolve `@a11ign/evidence@0.1.0` in a directory with no monorepo beside it would
 * pass every gate this repository has, and that guarantee is exactly the one a split of the repository removes.
 *
 *   node scripts/registry-consumer-gate.mjs                        # a11ign@latest into a throwaway directory
 *   node scripts/registry-consumer-gate.mjs --spec=0.1.0           # a version or dist-tag
 *   node scripts/registry-consumer-gate.mjs --into=<dir>           # install there and LEAVE it (the Windows job runs a11ign from it)
 *   node scripts/registry-consumer-gate.mjs --existing=<dir>       # read an install that is already there; installs nothing
 *   node scripts/registry-consumer-gate.mjs --require-imports      # an entry point that fails at evaluation is REFUSED, not "unchecked"
 *   node scripts/registry-consumer-gate.mjs --offline              # do not ask the registry which layers are published (they read "could not ask")
 *   node scripts/registry-consumer-gate.mjs --self-check           # the decisions over the shipped fixtures, no network
 *
 * Exit 0: nothing refused (read the UNCHECKED lines: they are named, and they are not a pass). Exit 1: at least
 * one refusal, each naming the package. Exit 2: could not read an install at all, which is never a pass.
 *
 * ## The decisions are PURE, over an install tree read as data
 *
 * `decide` takes a `Reading` -- the installed packages (`node_modules` as a list of manifests), what
 * `npx a11ign --version` printed, what each entry point's `import()` did, and what the registry says about
 * each layer -- and returns what it refuses. The reading is the only impure part, so every refusal has a
 * fixture that trips it and a clean one that passes, and the tests need no network
 * (`packages/lab/src/packaging/registry-consumer-gate.test.ts`).
 *
 * ## Unchecked is never clean
 *
 * `@a11ign/lab` is a 404 on the registry: it is `private`, and never published. A layer that is not on the
 * registry cannot have been checked, so it is printed as UNCHECKED with the reason, and so is anything else this
 * run could not decide. Two are real today, and both are named rather than passed over:
 *
 *  - `a11ign@0.1.0` has no `--version` flag (it prints its usage and exits 1). A version that is printed and
 *    DISAGREES with the install is refused; a CLI that offers no version to compare is "could not tell".
 *  - `@a11ign/nvda-worker` throws when imported on a machine with no supported screen reader (Linux). Every
 *    specifier resolved and the package's own code then refused the platform, so it is unchecked there, and
 *    `--require-imports` on the Windows runner is what makes it a refusal if it fails where it should work.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { refuseUnknownFlags, flagValue } from "../packages/worker-fleet/src/cli-flags.mjs";
import { satisfies } from "../packages/guards/src/isolation-gate.mjs";
import { npmCliInvocation } from "./npm-cli-executable.mjs";

const REPO = fileURLToPath(new URL("../", import.meta.url));
export const FIXTURES_DIR = resolve(REPO, "packages/lab/src/packaging/fixtures/registry-consumer-gate");

/** The package a consumer types. Everything else this gate reads is what installing it brought. */
export const ENTRY_PACKAGE = "a11ign";

/** A package this project publishes: the entry package and every `@a11ign/*` layer. */
export const isOurs = (/** @type {string} */ name) => name === ENTRY_PACKAGE || name.startsWith("@a11ign/");

/**
 * Packages of which exactly ONE copy may be installed. Two copies of the evidence contract are two contracts:
 * a document identity or a verdict signed by one is not the other's.
 */
const SINGLE_COPY = ["@a11ign/evidence"];

/** Every rule this gate can refuse under. `--self-check` refuses to pass unless a fixture trips each. */
export const RULES = [
  "nothing-installed", "workspace-protocol", "zero-pin", "duplicate-copy", "unsatisfied-range",
  "version-mismatch", "cli-unrunnable", "import-failed",
];

const DEPENDENCY_FIELDS = /** @type {const} */ (["dependencies", "optionalDependencies", "peerDependencies"]);

/**
 * `npm install` resolves a `0.0.0` pin from the registry or not at all: it is the placeholder a source manifest
 * carries before `changeset version`, and reaching a published manifest means the version bump did not run.
 */
const ZERO_PIN = /^(\^|~|>=)?0\.0\.0$/;

/**
 * Did NODE'S LOADER refuse this import, as opposed to the package's own code throwing? Node's loader failures all
 * carry an `ERR_*` code (`ERR_MODULE_NOT_FOUND`, `ERR_PACKAGE_PATH_NOT_EXPORTED`, `ERR_PACKAGE_IMPORT_NOT_DEFINED`
 * for an undefined `#alias`, ...) or CommonJS's `MODULE_NOT_FOUND`, and a syntax error is the loader's too. This was
 * a list of seven codes and the reviewer of #2519 found the eighth (`ERR_PACKAGE_IMPORT_NOT_DEFINED`) passing as
 * UNCHECKED, so it is now the SHAPE of the code rather than a list a new Node release can outgrow. Anything without
 * one ran the package's own code: see `importFindings`.
 * @param {{ code: string | null, errorName: string }} failure
 * @returns {boolean}
 */
export function isLoaderFailure({ code, errorName }) {
  return (code !== null && (code === "MODULE_NOT_FOUND" || code.startsWith("ERR_"))) || errorName === "SyntaxError";
}

/**
 * @typedef {{
 *   name: string, version: string, path: string, entry: boolean,
 *   dependencies?: Record<string, string>, optionalDependencies?: Record<string, string>,
 *   peerDependencies?: Record<string, string>,
 * }} InstalledPackage
 *   `path` is relative to the install root, `/`-separated (`node_modules/@a11ign/judge`), so a NESTED copy
 *   (`node_modules/x/node_modules/@a11ign/evidence`) is distinguishable from the hoisted one. `entry` is whether
 *   the manifest declares something to import (`exports["."]` or `main`).
 * @typedef {{ exitCode: number | null, stdout: string, stderr: string }} CliOutput
 * @typedef {{ name: string, ok: true } | { name: string, ok: false, code: string | null, errorName: string, message: string }} ImportOutcome
 * @typedef {{ name: string, registry: { published: true, version: string } | { published: false } | { published: null, why: string } }} Layer
 * @typedef {{ packages: InstalledPackage[], version: CliOutput, imports: ImportOutcome[], layers: Layer[] }} Reading
 * @typedef {{ rule: string, package: string, detail: string }} Refusal
 * @typedef {{ what: string, reason: string }} Unchecked
 * @typedef {{ refused: Refusal[], unchecked: Unchecked[], checked: string[] }} Decision
 */

/**
 * The internal dependencies a package declares, across the three fields npm resolves, as `[field, name, range]`.
 * @param {InstalledPackage} pkg
 * @returns {Array<[string, string, string]>}
 */
function declaredDependencies(pkg) {
  return DEPENDENCY_FIELDS.flatMap((field) => Object.entries(pkg[field] ?? {}).map(
    /** @returns {[string, string, string]} */ ([name, range]) => [field, name, range]));
}

/**
 * A `workspace:` protocol reaches the registry when a packer forgets to rewrite it, and installs for nobody. A
 * `0.0.0` pin on a sibling is the placeholder a source manifest carries before `changeset version`.
 * @param {InstalledPackage[]} packages
 * @returns {Refusal[]}
 */
export function protocolFindings(packages) {
  return packages.filter((pkg) => isOurs(pkg.name)).flatMap((pkg) => declaredDependencies(pkg).flatMap(([field, name, range]) => {
    const where = `${pkg.path}: ${field}["${name}"] is "${range}"`;
    if (range.startsWith("workspace:")) {
      return [{ rule: "workspace-protocol", package: pkg.name, detail: `${where} -- the workspace: protocol reached the registry` }];
    }
    return isOurs(name) && ZERO_PIN.test(range)
      ? [{ rule: "zero-pin", package: pkg.name, detail: `${where} -- the pre-release placeholder, not a published version` }]
      : [];
  }));
}

/**
 * @param {InstalledPackage[]} packages
 * @returns {Refusal[]}
 */
export function duplicateFindings(packages) {
  return SINGLE_COPY.flatMap((name) => {
    const copies = packages.filter((pkg) => pkg.name === name);
    return copies.length > 1
      ? [{ rule: "duplicate-copy", package: name,
        detail: `${copies.length} copies installed (${copies.map((c) => `${c.version} at ${c.path}`).join("; ")}) -- two copies is two contracts` }]
      : [];
  });
}

/**
 * The paths Node would look at, nearest first, for `dependency` required from the package at `dependantPath`.
 * @param {string} dependantPath
 * @param {string} dependency
 * @returns {string[]}
 */
export function lookupPaths(dependantPath, dependency) {
  const paths = [`${dependantPath}/node_modules/${dependency}`];
  let dir = dependantPath;
  for (let at = dir.lastIndexOf("node_modules/"); at !== -1; at = dir.lastIndexOf("node_modules/")) {
    paths.push(`${dir.slice(0, at)}node_modules/${dependency}`);
    dir = dir.slice(0, at).replace(/\/$/, "");
  }
  return paths;
}

/**
 * An `@a11ign/*` dependency must resolve, from its dependant, to an installed copy that satisfies the range the
 * dependant declares. A range it does not satisfy is the case npm reports least loudly. A range this gate cannot
 * read is refused too: "could not tell" is never a pass.
 * @param {InstalledPackage[]} packages
 * @returns {Refusal[]}
 */
export function rangeFindings(packages) {
  const byPath = new Map(packages.map((pkg) => [pkg.path, pkg]));
  return packages.filter((pkg) => isOurs(pkg.name)).flatMap((pkg) => declaredDependencies(pkg)
    .filter(([, name, range]) => isOurs(name) && !range.startsWith("workspace:") && !ZERO_PIN.test(range))
    .flatMap(([field, name, range]) => {
      const found = lookupPaths(pkg.path, name).map((path) => byPath.get(path)).find((hit) => hit !== undefined);
      const where = `${pkg.path}: ${field}["${name}"] is "${range}"`;
      if (found === undefined) {
        return field === "optionalDependencies" ? []
          : [{ rule: "unsatisfied-range", package: pkg.name, detail: `${where} -- nothing installed resolves it` }];
      }
      const verdict = satisfies(found.version, range);
      if (verdict === true) return [];
      const why = verdict === null ? "a range this gate cannot read" : `installed ${found.version} at ${found.path} does not satisfy it`;
      return [{ rule: "unsatisfied-range", package: pkg.name, detail: `${where} -- ${why}` }];
    }));
}

/** How much of a failing tool's output a refusal carries: enough to recognise it, not a log. */
const PREVIEW_CHARS = 200;
/** How many trailing lines of a failed `npm install` are worth quoting. */
const INSTALL_TAIL_LINES = 15;

const SEMVER_TOKEN = /\b(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\b/;
const USAGE_TEXT = /^Usage:/m;

/**
 * `npx a11ign --version` must print the version that was installed. Three outcomes, and they do not share a value:
 * it printed the installed version (checked), it printed a DIFFERENT one or crashed (refused), or the CLI has no
 * such flag and printed its usage instead (unchecked: nothing was offered to compare).
 * @param {CliOutput} output
 * @param {string} installed
 * @returns {{ refused: Refusal[], unchecked: Unchecked[], checked: string[] }}
 */
export function versionFindings(output, installed) {
  const printed = SEMVER_TOKEN.exec(output.stdout)?.[1];
  const refuse = (/** @type {string} */ detail) => ({
    refused: [{ rule: "version-mismatch", package: ENTRY_PACKAGE, detail }], unchecked: [], checked: [] });
  if (printed !== undefined) {
    return printed === installed
      ? { refused: [], unchecked: [], checked: [`npx ${ENTRY_PACKAGE} --version printed ${printed}, the installed version`] }
      : refuse(`npx ${ENTRY_PACKAGE} --version printed ${printed}, but ${installed} is what was installed`);
  }
  if (output.exitCode !== 0 && USAGE_TEXT.test(`${output.stdout}\n${output.stderr}`)) {
    return { refused: [], checked: [], unchecked: [{
      what: `npx ${ENTRY_PACKAGE} --version`,
      reason: `${ENTRY_PACKAGE}@${installed} has no --version flag (it printed its usage and exited ${output.exitCode}), so there was no printed version to compare with the installed one`,
    }] };
  }
  if (output.exitCode === 0) return refuse(`npx ${ENTRY_PACKAGE} --version exited 0 and printed no version`);
  const preview = (output.stderr || output.stdout).trim().split("\n")[0].slice(0, PREVIEW_CHARS);
  return { refused: [{ rule: "cli-unrunnable", package: ENTRY_PACKAGE,
    detail: `npx ${ENTRY_PACKAGE} --version exited ${output.exitCode}: ${preview}` }], unchecked: [], checked: [] };
}

/**
 * Every published layer's entry point must import. A failure to RESOLVE (a missing file, an `exports` map that
 * names nothing, a syntax error) is a packaging defect and is refused. Anything else was thrown by the package's
 * own code after every specifier resolved -- `@a11ign/nvda-worker` refuses a machine with no screen reader -- so it
 * is UNCHECKED here, and REFUSED only where the caller says the platform is one that must import
 * (`requireImports`).
 * @param {ImportOutcome[]} imports
 * @param {{ requireImports: boolean }} options
 * @returns {{ refused: Refusal[], unchecked: Unchecked[], checked: string[] }}
 */
export function importFindings(imports, { requireImports }) {
  /** @type {{ refused: Refusal[], unchecked: Unchecked[], checked: string[] }} */
  const out = { refused: [], unchecked: [], checked: [] };
  for (const outcome of imports) {
    if (outcome.ok) { out.checked.push(`import("${outcome.name}") succeeded`); continue; }
    const failure = `${outcome.errorName}${outcome.code ? ` ${outcome.code}` : ""}: ${outcome.message}`;
    const resolution = isLoaderFailure(outcome);
    if (resolution || requireImports) {
      out.refused.push({ rule: "import-failed", package: outcome.name, detail: `import("${outcome.name}") failed -- ${failure}` });
    } else {
      out.unchecked.push({ what: `import("${outcome.name}")`,
        reason: `every specifier resolved and the package's own code then threw (${failure}); this platform may be one it refuses -- run with --require-imports where it must work` });
    }
  }
  return out;
}

/**
 * A layer that is not installed was not checked, and the reason is the registry's word for it.
 * @param {Layer[]} layers
 * @param {InstalledPackage[]} packages
 * @returns {Unchecked[]}
 */
export function layerFindings(layers, packages) {
  const installed = new Set(packages.map((pkg) => pkg.name));
  return layers.filter((layer) => !installed.has(layer.name)).map((layer) => {
    const { registry } = layer;
    const reason = registry.published === true
      ? `published (${registry.version}) but ${ENTRY_PACKAGE} does not install it, so no install of ${ENTRY_PACKAGE} exercised it`
      : registry.published === false
        ? "not on the registry (E404): unpublished, so there is nothing to install"
        : `the registry could not be asked (${registry.why}), which is not an answer`;
    return { what: layer.name, reason };
  });
}

/**
 * THE DECISION. Pure: a reading in, what is refused, unchecked and checked out.
 * @param {Reading} reading
 * @param {{ requireImports?: boolean }} [options]
 * @returns {Decision}
 */
export function decide(reading, { requireImports = false } = {}) {
  const root = reading.packages.find((pkg) => pkg.name === ENTRY_PACKAGE && pkg.path === `node_modules/${ENTRY_PACKAGE}`);
  if (root === undefined) {
    return { checked: [], unchecked: [], refused: [{ rule: "nothing-installed", package: ENTRY_PACKAGE,
      detail: `${reading.packages.length} package(s) read and none is node_modules/${ENTRY_PACKAGE}: an empty reading proves nothing` }] };
  }
  const ours = reading.packages.filter((pkg) => isOurs(pkg.name));
  const version = versionFindings(reading.version, root.version);
  const imports = importFindings(reading.imports, { requireImports });
  const refused = [
    ...protocolFindings(reading.packages), ...duplicateFindings(reading.packages), ...rangeFindings(reading.packages),
    ...version.refused, ...imports.refused,
  ];
  const internalRanges = ours.flatMap(declaredDependencies).filter(([, name]) => isOurs(name)).length;
  return {
    refused,
    unchecked: [...version.unchecked, ...imports.unchecked, ...layerFindings(reading.layers, reading.packages)],
    checked: [
      `${ours.length} installed package(s) of ours read: ${ours.map((pkg) => `${pkg.name}@${pkg.version}`).join(", ")}`,
      `${internalRanges} internal dependency range(s) read`,
      ...version.checked, ...imports.checked,
    ],
  };
}

/**
 * The report a person reads, one line per finding.
 * @param {Decision} decision
 * @returns {string}
 */
export function formatDecision(decision) {
  return [
    ...decision.checked.map((line) => `checked:   ${line}`),
    ...decision.unchecked.map((u) => `UNCHECKED: ${u.what} -- ${u.reason}`),
    ...decision.refused.map((r) => `REFUSED:   [${r.rule}] ${r.package}: ${r.detail}`),
    decision.refused.length === 0
      ? `registry-consumer-gate: nothing refused (${decision.unchecked.length} thing(s) UNCHECKED above, which is not the same as clean)`
      : `registry-consumer-gate: ${decision.refused.length} REFUSED`,
  ].join("\n");
}

// ---------------------------------------------------------------------------------------------------------
// The impure half: read an install as data.
// ---------------------------------------------------------------------------------------------------------

/** @param {unknown} exportsField @param {unknown} main @returns {boolean} */
function declaresEntry(exportsField, main) {
  if (typeof main === "string") return true;
  if (typeof exportsField === "string") return true;
  return typeof exportsField === "object" && exportsField !== null && "." in exportsField;
}

/**
 * Every package under `<dir>/node_modules`, nested copies included, as data. Symlinks are not followed: a registry
 * install makes none, and one here would be a workspace leaking in.
 * @param {string} dir
 * @returns {InstalledPackage[]}
 */
export function readInstalledTree(dir) {
  /** @type {InstalledPackage[]} */
  const found = [];
  /** @param {string} nodeModules @param {string} relative */
  const walk = (nodeModules, relative) => {
    if (!existsSync(nodeModules)) return;
    for (const entry of readdirSync(nodeModules, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || !entry.isDirectory()) continue;
      const names = entry.name.startsWith("@")
        ? readdirSync(join(nodeModules, entry.name), { withFileTypes: true })
          .filter((inner) => inner.isDirectory()).map((inner) => `${entry.name}/${inner.name}`)
        : [entry.name];
      for (const name of names) readPackage(join(nodeModules, name), `${relative}/${name}`);
    }
  };
  /** @param {string} packageDir @param {string} path */
  const readPackage = (packageDir, path) => {
    const manifestPath = join(packageDir, "package.json");
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      found.push({
        name: manifest.name, version: manifest.version, path, entry: declaresEntry(manifest.exports, manifest.main),
        dependencies: manifest.dependencies, optionalDependencies: manifest.optionalDependencies,
        peerDependencies: manifest.peerDependencies,
      });
    }
    walk(join(packageDir, "node_modules"), `${path}/node_modules`);
  };
  walk(join(dir, "node_modules"), "node_modules");
  return found;
}

/**
 * Run an `npm`/`npx` invocation from `npmCliInvocation`, which never spawns a `.cmd` (see `npm-cli-executable.mjs`).
 * @param {{ command: string, args: string[] }} invocation @param {string} cwd
 * @returns {CliOutput}
 */
function runInvocation({ command, args }, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", timeout: 600_000, env: { ...process.env, CI: "1" } });
  return { exitCode: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? (result.error ? String(result.error) : "") };
}

/** Prints `{code, errorName, message}` for a failed import, from the install directory as cwd. */
const IMPORT_PROBE = "import(process.argv[1]).then(() => process.exit(0), (e) => { "
  + "console.log(JSON.stringify({ code: e.code ?? null, errorName: e.name, message: String(e.message).split(\"\\n\")[0] })); process.exit(1); });";

/**
 * `import("<name>")` from INSIDE the install, in a child process, so this repository's own `node_modules` is
 * nowhere on the resolution path.
 * @param {string} dir @param {string} name
 * @returns {ImportOutcome}
 */
function probeImport(dir, name) {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", IMPORT_PROBE, name],
    { cwd: dir, encoding: "utf8", timeout: 60_000 });
  if (result.status === 0) return { name, ok: true };
  try {
    return { name, ok: false, ...JSON.parse(result.stdout.trim().split("\n").pop() ?? "") };
  } catch {
    return { name, ok: false, code: null, errorName: "Error", message: (result.stderr || String(result.error)).trim().split("\n")[0] };
  }
}

/**
 * What the registry says about a layer: published, E404, or "could not ask" -- three values, because a network
 * failure is not a 404.
 * @param {string} name @param {string} cwd
 * @returns {Layer}
 */
function askRegistry(name, cwd) {
  const out = runInvocation(npmCliInvocation("npm", ["view", name, "version", "--json"]), cwd);
  if (out.exitCode === 0) return { name, registry: { published: true, version: String(JSON.parse(out.stdout)) } };
  if (/E404/.test(out.stderr + out.stdout)) return { name, registry: { published: false } };
  return { name, registry: { published: null, why: (out.stderr || out.stdout).trim().split("\n")[0].slice(0, PREVIEW_CHARS) } };
}

/**
 * The `@a11ign/*` packages this repository holds, by name: the population of layers, read from the checkout.
 * @param {string} repoRoot
 * @returns {string[]}
 */
export function repositoryLayers(repoRoot) {
  const packagesDir = join(repoRoot, "packages");
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(packagesDir, entry.name, "package.json")))
    .map((entry) => JSON.parse(readFileSync(join(packagesDir, entry.name, "package.json"), "utf8")).name)
    .filter((name) => typeof name === "string" && name.startsWith("@a11ign/"))
    .sort();
}

/**
 * Read an install that is already on disk. `offline` skips the registry question about layers, and each layer
 * then reads "could not ask": absence of an answer, never "published".
 * @param {string} dir
 * @param {{ offline?: boolean }} [options]
 * @returns {Reading}
 */
export function readInstall(dir, { offline = false } = {}) {
  const packages = readInstalledTree(dir);
  const top = packages.filter((pkg) => isOurs(pkg.name) && pkg.path === `node_modules/${pkg.name}` && pkg.entry);
  const installed = new Set(packages.map((pkg) => pkg.name));
  return {
    packages,
    version: runInvocation(npmCliInvocation("npx", ["--no-install", ENTRY_PACKAGE, "--version"]), dir),
    imports: top.map((pkg) => probeImport(dir, pkg.name)),
    layers: repositoryLayers(REPO).filter((name) => !installed.has(name)).map((name) => offline
      ? { name, registry: { published: null, why: "--offline" } }
      : askRegistry(name, dir)),
  };
}

/**
 * Install `spec` of the entry package into `dir` with NO cache from before and no manifest above it: what a stranger
 * gets from the registry today, not what this host happens to hold.
 * @param {string} dir @param {string} spec
 * @returns {void}
 */
export function installFromRegistry(dir, spec) {
  mkdirSync(dir, { recursive: true });
  if (readdirSync(dir).length > 0) throw new Error(`${dir} is not empty: the point of this gate is a directory with nothing beside the install`);
  writeFileSync(join(dir, "package.json"), `${JSON.stringify({ name: "registry-consumer-gate-probe", private: true })}\n`);
  const out = runInvocation(npmCliInvocation("npm",
    ["install", `${ENTRY_PACKAGE}@${spec}`, "--no-audit", "--no-fund", "--cache", join(dir, ".npm-cache")]), dir);
  if (out.exitCode !== 0) {
    throw new Error(`npm install ${ENTRY_PACKAGE}@${spec} exited ${out.exitCode}:\n${out.stderr.trim().split("\n").slice(-INSTALL_TAIL_LINES).join("\n")}`);
  }
}

// ---------------------------------------------------------------------------------------------------------
// --self-check: the same decisions over the shipped fixtures.
// ---------------------------------------------------------------------------------------------------------

/**
 * @typedef {{ description: string, requireImports?: boolean, expect: { refused: Array<{ rule: string, package: string }>, unchecked?: string[] }, reading: Reading }} Fixture
 */

/** @returns {Array<{ file: string, fixture: Fixture }>} */
export function loadFixtures() {
  return readdirSync(FIXTURES_DIR).filter((file) => file.endsWith(".json")).sort()
    .map((file) => ({ file, fixture: JSON.parse(readFileSync(join(FIXTURES_DIR, file), "utf8")) }));
}

/**
 * Does each fixture produce exactly the refusals it declares, does one of them PASS, and is every rule tripped?
 * @param {Array<{ file: string, fixture: Fixture }>} fixtures
 * @returns {string[]} the problems, empty when the gate agrees with its own fixtures
 */
export function selfCheckProblems(fixtures) {
  /** @type {string[]} */
  const problems = [];
  const tripped = new Set();
  for (const { file, fixture } of fixtures) {
    const decision = decide(fixture.reading, { requireImports: fixture.requireImports === true });
    const got = decision.refused.map((r) => `${r.rule} ${r.package}`).sort();
    const want = fixture.expect.refused.map((r) => `${r.rule} ${r.package}`).sort();
    decision.refused.forEach((r) => tripped.add(r.rule));
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      problems.push(`${file}: expected [${want.join("; ")}] refused, got [${got.join("; ")}]`);
    }
    const unchecked = fixture.expect.unchecked ?? [];
    const missing = unchecked.filter((what) => !decision.unchecked.some((u) => u.what === what));
    if (missing.length > 0) problems.push(`${file}: expected UNCHECKED ${missing.join(", ")}, not reported`);
  }
  if (!fixtures.some(({ fixture }) => fixture.expect.refused.length === 0)) {
    problems.push("no fixture expects a PASS: an always-refusing gate would satisfy every refusal (the positive control is missing)");
  }
  for (const rule of RULES.filter((r) => !tripped.has(r))) problems.push(`no fixture trips the rule "${rule}"`);
  return problems;
}

function selfCheck() {
  const fixtures = loadFixtures();
  const problems = selfCheckProblems(fixtures);
  for (const { file, fixture } of fixtures) console.log(`fixture ${file}: ${fixture.description}`);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`SELF-CHECK FAILED: ${problem}`);
    return 1;
  }
  console.log(`registry-consumer-gate --self-check: ${fixtures.length} fixture(s), every rule (${RULES.length}) tripped, the clean one passes.`);
  return 0;
}

/**
 * @param {string[]} argv
 * @returns {number} the exit code
 */
export function main(argv) {
  refuseUnknownFlags(["--spec=", "--into=", "--existing=", "--require-imports", "--offline", "--self-check"],
    { entry: import.meta.url, argv, command: "node scripts/registry-consumer-gate.mjs" });
  if (argv.includes("--self-check")) return selfCheck();
  const existing = flagValue(argv, "existing");
  const into = flagValue(argv, "into");
  const spec = flagValue(argv, "spec") ?? "latest";
  const dir = existing ?? into ?? mkdtempSync(join(tmpdir(), "registry-consumer-gate-"));
  try {
    if (existing === undefined) installFromRegistry(dir, spec);
    const decision = decide(readInstall(dir, { offline: argv.includes("--offline") }), { requireImports: argv.includes("--require-imports") });
    console.log(`registry-consumer-gate: read ${dir}${existing === undefined ? ` after installing ${ENTRY_PACKAGE}@${spec}` : ""}`);
    console.log(formatDecision(decision));
    return decision.refused.length === 0 ? 0 : 1;
  } catch (error) {
    console.error(`registry-consumer-gate: could not read an install, and that is never a pass: ${error instanceof Error ? error.message : error}`);
    return 2;
  } finally {
    if (existing === undefined && into === undefined) rmSync(dir, { recursive: true, force: true });
  }
}

// REALPATH'D, per `entry-points.test.ts` (#1086): reached through a symlink, the plain form skips main() and exits 0 silently.
if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) process.exitCode = main(process.argv.slice(2));
