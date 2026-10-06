/**
 * #3504 (move 2 of #69, the delete step): THE DELETE'S OWN TEST. `packages/worker-fleet` left the workspace for `a11ign/screenreader-fleet`
 * (ADR 0040, M2), and this repository consumes `@a11ign/screenreader-fleet` from the registry. It lives in `packages/guards`, not in the directory
 * it proves gone: that directory cannot hold the test that says it is not there.
 *
 * What is left to prove is that the delete is COMPLETE, in five claims, each with a fixture beside it:
 *
 *   1. No tracked file is under `packages/worker-fleet/`, and `pnpm-workspace.yaml`'s globs match no directory of that name or manifest
 *      carrying the package's name. A LAYER CHECKOUT may sit at that path (`scripts/lay-layer.mjs`, untracked, `src/` only): the workspace
 *      EXCLUDES it, and that exclusion is what the second half of the claim reads, so a laid copy is not a member.
 *   2. `pnpm-lock.yaml` holds no `link:` to the old path and no importer under it.
 *   3. The `@a11ign/screenreader-fleet` entry is a REGISTRY entry: one version under every importer that declares it, and a `packages:` entry
 *      whose `resolution` carries an `integrity`. A version with no integrity is a version nobody verified.
 *   4. No pending changeset names the package, under either name it has had. `.changeset/README.md` is prose and may name them; an entry's
 *      frontmatter may not, because `changeset version` would then try to version a package this workspace does not have.
 *   5. Who reaches it, and how. Code in `lab`, `guards`, `cli` and `scripts/` never imports it by a relative path into `packages/worker-fleet`:
 *      it names it BY PACKAGE NAME, or (the root's scripts and the guards that run before `node_modules` exists, which cannot import a package
 *      at all) reads `scripts/cli-flags.mjs`, the one file of the fleet those need, kept as a copy in this repository. `control` CANNOT (ADR 0012, `control-has-no-dependencies.test.ts`: it runs from a raw checkout with no `node_modules`),
 *      so it reaches the fleet by relative path through the layer `packages/control/layers.json` declares at that very path, which is the only
 *      place a relative path into the directory is allowed to land.
 *
 * THE POSITIVE CONTROL is each function over a fixture: a lockfile with a `link:../worker-fleet` entry is REFUSED naming it, and so is a
 * workspace that still matches the directory, a registry entry with no integrity, a changeset that names the package, and a relative import.
 * A reader that found nothing in the real tree would otherwise be indistinguishable from one that cannot see.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { sandboxGitEnv } from "./git-env.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const DEPARTED_DIRECTORY = "worker-fleet";
const CONSUMED = "@a11ign/screenreader-fleet";
const CONSUMED_VERSION = "0.5.1";
/** Both names the package has carried; a changeset may name neither. BUILT, NOT WRITTEN: a rename test refuses a file that spells the old name whole. */
const NAMES = [CONSUMED, ["@a11ign", "worker-fleet"].join("/")] as const;
/** What a pnpm integrity looks like: an algorithm, a dash and base64. Not a hash of anything: a SHAPE, so a placeholder is refused. */
const INTEGRITY_SHAPE = /^sha512-[A-Za-z0-9+/]{86}==$/;

/** Writes `files` (path -> text) under a fresh directory, runs `body` on it, and removes it however `body` ends. */
function withFixture<T>(files: Record<string, string>, body: (root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), "worker-fleet-delete-"));
  try {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(root, posix.dirname(path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    return body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const read = (root: string, path: string): string => readFileSync(join(root, path), "utf8");
const tracked = (root: string, ...paths: string[]): string[] => execFileSync("git", ["ls-files", "-z", "--", ...paths], { cwd: root, encoding: "utf8", env: sandboxGitEnv() })
  .split("\0").filter(Boolean);

// ---- 1. the directory is not tracked and the workspace does not match it ---------------------------------------------

/** The directories `pnpm-workspace.yaml`'s `packages:` globs match, less its `!` exclusions. Only the `dir/*` and `!dir/name` shapes are read, which are the only two it holds. */
function workspaceDirectories(root: string): string[] {
  const { packages } = parse(read(root, "pnpm-workspace.yaml")) as { packages?: string[] };
  assert.ok(Array.isArray(packages) && packages.length > 0, "pnpm-workspace.yaml names no packages: the reader is looking at the wrong file");
  const excluded = new Set(packages.filter((glob) => glob.startsWith("!")).map((glob) => glob.slice(1)));
  return packages.filter((glob) => !glob.startsWith("!")).flatMap((glob) => {
    assert.match(glob, /^[\w./-]+\/\*$/, `${glob} is a glob shape this reader does not expand: widen it before trusting a pass`);
    const parent = glob.slice(0, -2);
    return readdirSync(join(root, parent), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => posix.join(parent, entry.name));
  }).filter((directory) => !excluded.has(directory));
}

function manifestName(root: string, directory: string): string | null {
  try {
    return (JSON.parse(read(root, join(directory, "package.json"))) as { name?: string }).name ?? null;
  } catch (cause) {
    // A workspace directory with no manifest (a build output, a cache, a laid layer's `src/`) is not a member; any other failure is a real defect.
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error(`cannot read ${directory}/package.json`, { cause });
  }
}

/** Every way the workspace still holds the departed package, as a sentence naming it. */
function workspaceRefusals(root: string): string[] {
  const directories = workspaceDirectories(root);
  const byDirectory = directories.filter((directory) => posix.basename(directory) === DEPARTED_DIRECTORY).map((directory) => `${directory} is still a workspace directory`);
  const byName = directories.flatMap((directory) => {
    const name = manifestName(root, directory);
    return name !== null && (NAMES as readonly string[]).includes(name) ? [`${directory} still carries the name ${name}`] : [];
  });
  return [...byDirectory, ...byName];
}

test("no file under packages/worker-fleet is tracked", () => {
  const files = tracked(REPO_ROOT, "packages/worker-fleet");
  assert.deepEqual(files, [], `${files.length} tracked file(s) remain under the directory that left`);
});

test("the workspace matches no worker-fleet directory and no manifest carries the package's name", () => {
  assert.ok(workspaceDirectories(REPO_ROOT).length >= 5, "the workspace expanded to almost nothing: the reader is not looking at the tree");
  assert.deepEqual(workspaceRefusals(REPO_ROOT), []);
});

test("POSITIVE CONTROL: a workspace holding the directory, or the name under another directory, is refused naming it; the exclusion lets a laid checkout stand", () => {
  const files = {
    "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n',
    "packages/worker-fleet/package.json": `{ "name": "${CONSUMED}" }`,
    "packages/renamed/package.json": `{ "name": "${CONSUMED}" }`,
    "packages/fine/package.json": '{ "name": "@a11ign/evidence" }',
  };
  withFixture(files, (root) => {
    assert.deepEqual(workspaceRefusals(root), [
      "packages/worker-fleet is still a workspace directory",
      `packages/renamed still carries the name ${CONSUMED}`,
      `packages/worker-fleet still carries the name ${CONSUMED}`,
    ]);
  });
  withFixture({ ...files, "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n  - "!packages/worker-fleet"\n' }, (root) => {
    assert.deepEqual(workspaceRefusals(root), [`packages/renamed still carries the name ${CONSUMED}`], "the exclusion removes the directory and nothing else");
  });
  withFixture({ ...files, "packages/renamed/package.json": "{}" }, (root) => {
    assert.deepEqual(workspaceRefusals(root), ["packages/worker-fleet is still a workspace directory", `packages/worker-fleet still carries the name ${CONSUMED}`]);
  });
});

// ---- 2. no link: to the old path, and 3. the consumed entry is a registry entry -----------------------------------

type Lockfile = {
  importers?: Record<string, Record<string, Record<string, { specifier: string; version: string }> | undefined>>;
  packages?: Record<string, { resolution?: { integrity?: string } } | undefined>;
};
const DEPENDENCY_SECTIONS = ["dependencies", "devDependencies", "optionalDependencies"];

/** Lines of `lockfile` that point a dependency at the departed directory with `link:`, or keep an importer under its old path. */
function linkRefusals(lockfile: string): string[] {
  const links = lockfile.split("\n").filter((line) => new RegExp(`link:[^\\s'"]*\\b${DEPARTED_DIRECTORY}\\b`).test(line)).map((line) => `a link to the departed package: ${line.trim()}`);
  const importers = Object.keys((parse(lockfile) as Lockfile).importers ?? {}).filter((importer) => importer.endsWith(`/${DEPARTED_DIRECTORY}`))
    .map((importer) => `an importer under the departed path: ${importer}`);
  return [...links, ...importers];
}

/** pnpm writes the peers it resolved after the version: `0.3.0(@a11ign/scorer@...)`. The registry's version is what precedes them. */
const versionOf = (resolved: string): string => resolved.replace(/\(.*$/, "");

/** The importers that declare the consumed package, with what each resolved it to. */
function declarations(parsed: Lockfile): { importer: string; version: string }[] {
  return Object.entries(parsed.importers ?? {}).flatMap(([importer, sections]) => DEPENDENCY_SECTIONS.flatMap((section) => {
    const entry = sections[section]?.[CONSUMED];
    return entry === undefined ? [] : [{ importer, version: entry.version }];
  }));
}

/** What is wrong with how `lockfile` holds the consumed package: nothing found, a wrong version, or a version with no integrity. */
function registryEntryRefusals(lockfile: string): string[] {
  const parsed = parse(lockfile) as Lockfile;
  const declared = declarations(parsed);
  if (declared.length === 0) return [`no importer declares ${CONSUMED}`];
  const wrongVersion = declared.filter(({ version }) => versionOf(version) !== CONSUMED_VERSION)
    .map(({ importer, version }) => `${importer} resolves ${CONSUMED} to ${version}, not the registry's ${CONSUMED_VERSION}`);
  const integrity = parsed.packages?.[`${CONSUMED}@${CONSUMED_VERSION}`]?.resolution?.integrity;
  const unverified = integrity !== undefined && INTEGRITY_SHAPE.test(integrity) ? [] : [`${CONSUMED}@${CONSUMED_VERSION} has no sha512 integrity in packages:`];
  return [...wrongVersion, ...unverified];
}

const REAL_INTEGRITY = `sha512-${"A".repeat(86)}==`;
/** A minimal lockfile: the root declares the package at `version`, with `integrity` (or none) in `packages:`. */
function lockfileWith({ version, integrity, extra = "" }: { version: string; integrity?: string; extra?: string }): string {
  const resolution = integrity === undefined ? "" : `    resolution: {integrity: ${integrity}}\n`;
  return `lockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    dependencies:\n      '${CONSUMED}':\n        specifier: ^0.5.1\n        version: ${version}\n${extra}\n`
    + `packages:\n\n  '${CONSUMED}@${CONSUMED_VERSION}':\n${resolution}    engines: {node: '>=20'}\n`;
}

test("pnpm-lock.yaml holds no link: to the departed directory and no importer under its old path", () => {
  assert.deepEqual(linkRefusals(read(REPO_ROOT, "pnpm-lock.yaml")), []);
});

test("pnpm-lock.yaml holds @a11ign/screenreader-fleet at the registry's version with an integrity, under every importer that declares it", () => {
  const lockfile = read(REPO_ROOT, "pnpm-lock.yaml");
  assert.deepEqual(registryEntryRefusals(lockfile), []);
  // Derived a second way: the manifests that declare it are the importers the lockfile must resolve, so a lockfile that lost one is not "enough".
  const fromLockfile = declarations(parse(lockfile) as Lockfile).map(({ importer }) => importer).sort();
  const fromManifests = [".", ...readdirSync(join(REPO_ROOT, "packages")).map((name) => join("packages", name))]
    .filter((directory) => { try { return CONSUMED in { ...JSON.parse(read(REPO_ROOT, join(directory, "package.json"))).dependencies, ...JSON.parse(read(REPO_ROOT, join(directory, "package.json"))).devDependencies }; } catch { return false; } })
    .sort();
  assert.deepEqual(fromLockfile, fromManifests);
  assert.deepEqual(fromLockfile, [".", "packages/cli", "packages/guards", "packages/lab"]);
});

test("POSITIVE CONTROL: a lockfile with a link:../worker-fleet entry is REFUSED, naming it", () => {
  const linked = lockfileWith({ version: "link:../worker-fleet", integrity: REAL_INTEGRITY });
  assert.deepEqual(linkRefusals(linked), ["a link to the departed package: version: link:../worker-fleet"]);
  assert.deepEqual(registryEntryRefusals(linked), [`. resolves ${CONSUMED} to link:../worker-fleet, not the registry's ${CONSUMED_VERSION}`]);
  const importer = lockfileWith({ version: CONSUMED_VERSION, integrity: REAL_INTEGRITY, extra: "\n  packages/worker-fleet:\n    dependencies: {}\n" });
  assert.deepEqual(linkRefusals(importer), ["an importer under the departed path: packages/worker-fleet"]);
});

test("POSITIVE CONTROL: a registry entry passes, with the peers pnpm resolved after the version; no integrity, or a placeholder, does not", () => {
  assert.deepEqual(registryEntryRefusals(lockfileWith({ version: `${CONSUMED_VERSION}(@a11ign/scorer@packages+scorer)`, integrity: REAL_INTEGRITY })), []);
  const missing = `${CONSUMED}@${CONSUMED_VERSION} has no sha512 integrity in packages:`;
  assert.deepEqual(registryEntryRefusals(lockfileWith({ version: CONSUMED_VERSION })), [missing]);
  assert.deepEqual(registryEntryRefusals(lockfileWith({ version: CONSUMED_VERSION, integrity: "sha512-placeholder" })), [missing]);
  assert.deepEqual(registryEntryRefusals(lockfileWith({ version: "0.2.0", integrity: REAL_INTEGRITY })), [`. resolves ${CONSUMED} to 0.2.0, not the registry's ${CONSUMED_VERSION}`]);
  assert.deepEqual(registryEntryRefusals("lockfileVersion: '9.0'\nimporters:\n  .: {}\n"), [`no importer declares ${CONSUMED}`]);
});

// ---- 4. no changeset names the package ------------------------------------------------------------------------------

/** The names an entry's frontmatter versions: `"name": bump` lines between the `---` fences. */
function changesetNames(text: string): string[] {
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  return [...frontmatter.matchAll(/^["']?([^"':\s]+)["']?\s*:/gm)].map((match) => match[1]);
}

/** Every pending changeset that versions the package under either name, as a sentence naming the file and the name. */
function changesetRefusals(root: string): string[] {
  return readdirSync(join(root, ".changeset")).filter((file) => file.endsWith(".md") && file !== "README.md")
    .flatMap((file) => changesetNames(read(root, join(".changeset", file))).filter((name) => (NAMES as readonly string[]).includes(name)).map((name) => `.changeset/${file} names ${name}`));
}

test("no pending changeset names the package, under either name", () => {
  assert.deepEqual(changesetRefusals(REPO_ROOT), []);
});

test("POSITIVE CONTROL: an entry naming the package is REFUSED, and prose naming it is not", () => {
  const entry = (name: string) => `---\n"${name}": minor\n"a11ign": patch\n---\n\nbody\n`;
  withFixture({
    ".changeset/new-name.md": entry(CONSUMED),
    ".changeset/old-name.md": entry(NAMES[1]),
    ".changeset/other.md": entry("@a11ign/evidence"),
    ".changeset/README.md": `# Changesets\n\nthe ${CONSUMED} package is released from its own repository\n`,
  }, (root) => {
    assert.deepEqual(changesetRefusals(root), [`.changeset/new-name.md names ${CONSUMED}`, `.changeset/old-name.md names ${NAMES[1]}`]);
  });
});

// ---- 5. who reaches the fleet, and how ------------------------------------------------------------------------------

/** Source in the packages and scripts that CAN import by name, which still imports the departed directory by a relative path. */
const BY_NAME_SOURCES = /^(?:packages\/(?:lab|guards|cli|judge|evidence|scorer)\/|scripts\/).*\.(?:mjs|ts|js)$/;
const RELATIVE_INTO_FLEET = /(?:from\s*|import\s*\(\s*|import\s+)["'](?:\.\.?\/)+(?:packages\/)?worker-fleet\//;
/** Tests read the layer's files on purpose (they are baselined as `moves-with:worker-fleet`); this is about code that RUNS. */
const NOT_A_TEST = (path: string) => !/\.test\.(?:ts|mjs)$/.test(path) && !path.includes("/fixtures/");

function relativeImportRefusals(files: Record<string, string>): string[] {
  return Object.entries(files).filter(([path]) => BY_NAME_SOURCES.test(path) && NOT_A_TEST(path))
    .filter(([, text]) => RELATIVE_INTO_FLEET.test(text)).map(([path]) => `${path} imports packages/worker-fleet by a relative path: name ${CONSUMED}`);
}

const trackedText = (root: string): Record<string, string> => Object.fromEntries(tracked(root, "packages", "scripts")
  .filter((path) => /\.(?:mjs|ts|js)$/.test(path)).map((path) => [path, read(root, path)]));

test("lab, guards, cli and the root scripts import the fleet by package name, never by a relative path", () => {
  const files = trackedText(REPO_ROOT);
  assert.ok(Object.keys(files).filter((path) => BY_NAME_SOURCES.test(path)).length > 100, "the scan saw almost no source: it is not looking at the tree");
  assert.deepEqual(relativeImportRefusals(files), []);
  // THE POSITIVE CONTROL'S OWN PRECONDITION: the by-name form is in use, so "no relative import" is not "no import at all".
  assert.ok(Object.values(files).some((text) => text.includes(`from "${CONSUMED}/`)), "no source imports the package by name at all");
});

test("POSITIVE CONTROL: a relative import of the fleet is REFUSED naming the file; the by-name form, a test and a control import are not", () => {
  assert.deepEqual(relativeImportRefusals({
    "packages/lab/src/training/a.mjs": 'import { x } from "../../../worker-fleet/src/worker-http.mjs";\n',
    "packages/guards/src/b.mjs": 'import { y } from "../../worker-fleet/src/cli-flags.mjs";\n',
    "scripts/c.mjs": 'import { z } from "../packages/worker-fleet/src/cli-flags.mjs";\n',
    "packages/lab/src/d.mjs": `import { w } from "${CONSUMED}/cli-flags";\n`,
    "packages/lab/src/e.test.ts": 'import { v } from "../../worker-fleet/src/doctor.mjs";\n',
    "packages/control/src/f.mjs": 'import { u } from "../../worker-fleet/src/cli-flags.mjs";\n',
  }), [
    `packages/lab/src/training/a.mjs imports packages/worker-fleet by a relative path: name ${CONSUMED}`,
    `packages/guards/src/b.mjs imports packages/worker-fleet by a relative path: name ${CONSUMED}`,
    `scripts/c.mjs imports packages/worker-fleet by a relative path: name ${CONSUMED}`,
  ]);
});

/** Where a relative import into the fleet may land: the path the layer manifest declares for it. Control's modules sit one level below `packages/control`, so `../../worker-fleet/` IS `packages/worker-fleet/`. */
function controlRefusals({ manifest, files }: { manifest: { layers: Record<string, { path: string; remote?: string }> }; files: Record<string, string> }): string[] {
  const layer = manifest.layers["screenreader-fleet"];
  if (layer?.remote === undefined) return ["packages/control/layers.json declares no screenreader-fleet layer with a remote"];
  if (layer.path === `packages/${DEPARTED_DIRECTORY}`) return [];
  return Object.entries(files).filter(([path]) => path.startsWith("packages/control/") && /\.mjs$/.test(path)).filter(([, text]) => /["'](?:\.\.\/)+worker-fleet\//.test(text))
    .map(([path]) => `${path} reaches the fleet from a place the declared layer path ${layer.path} does not resolve`);
}

test("control reaches the fleet only through the layer layers.json declares at packages/worker-fleet", () => {
  const manifest = JSON.parse(read(REPO_ROOT, "packages/control/layers.json"));
  assert.equal(manifest.layers["screenreader-fleet"]?.path, "packages/worker-fleet");
  assert.match(manifest.layers["screenreader-fleet"]?.remote ?? "", /^https:\/\/github\.com\/a11ign\/screenreader-fleet\.git$/);
  const files = Object.fromEntries(Object.entries(trackedText(REPO_ROOT)).filter(([path]) => path.startsWith("packages/control/src/") && !path.includes("/fleet-layer/")));
  const reaching = Object.values(files).filter((text) => /["'](?:\.\.\/)+worker-fleet\//.test(text)).length;
  assert.ok(reaching >= 10, `only ${reaching} control module(s) reach the fleet by path: the scan is looking at nothing`);
  assert.deepEqual(controlRefusals({ manifest, files }), []);
});

test("POSITIVE CONTROL: control with no declared layer, or one with no remote, is REFUSED", () => {
  const files = { "packages/control/src/a.mjs": 'import { x } from "../../worker-fleet/src/cli-flags.mjs";\n' };
  assert.deepEqual(controlRefusals({ manifest: { layers: {} }, files }), ["packages/control/layers.json declares no screenreader-fleet layer with a remote"]);
  assert.deepEqual(controlRefusals({ manifest: { layers: { "screenreader-fleet": { path: "packages/worker-fleet" } } }, files }),
    ["packages/control/layers.json declares no screenreader-fleet layer with a remote"]);
  assert.deepEqual(controlRefusals({ manifest: { layers: { "screenreader-fleet": { path: "packages/worker-fleet", remote: "https://x/y.git" } } }, files }), []);
  assert.deepEqual(controlRefusals({ manifest: { layers: { "screenreader-fleet": { path: "packages/elsewhere", remote: "https://x/y.git" } } }, files }),
    ["packages/control/src/a.mjs reaches the fleet from a place the declared layer path packages/elsewhere does not resolve"]);
});
