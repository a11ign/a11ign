/**
 * #3505 (move 3 of #69, the delete step): THE DELETE'S OWN TEST. `packages/lab` left the workspace for `a11ign/lab` (ADR 0040, M3), and this repository
 * takes it as a PINNED TAG: `packages/control/layers.json` declares the tag, and `scripts/lay-layer.mjs` lays the lab's scripts, source, baselines and
 * rule table at `packages/lab` (untracked, never a workspace member) for the scripts, tests and workflows that read them by path. It lives in
 * `packages/guards`, not in the directory it proves gone: that directory cannot hold the test that says it is not there.
 *
 * WHY A PINNED TAG AND NOT A REGISTRY RELEASE, as the fleet and the worker are taken: `@a11ign/lab` is `private: true` and two of its dependencies
 * (`@a11ign/control`, `@a11ign/nvda-speech`) are not on any registry (#2703: no registry, no token), so there is no lockfile entry to read and the
 * declaration carries the pin itself. `lay-layer.test.ts` pins the mechanism; this file pins that the tree uses it and that nothing still treats the
 * directory as a package.
 *
 * Seven claims, each with a fixture beside it:
 *
 *   1. No tracked file is under `packages/lab/`, and `pnpm-workspace.yaml` matches no member of that name or carrying `@a11ign/lab`. The laid copy is
 *      EXCLUDED (`!packages/lab`), and that exclusion is what the second half reads.
 *   2. `pnpm-lock.yaml` holds no importer under `packages/lab`, no `link:` to it and no `@a11ign/lab` entry.
 *   3. No `test:*` script's glob names it: neither as a path nor as a member of a brace list (`packages/{a,lab,b}/src/**`). A glob that names a directory
 *      with no tracked file selects nothing and `assert-glob-not-empty` would blame the floor, so a stale name is refused HERE, by name.
 *   4. No pending changeset versions the package, and `.changeset/config.json` has no entry for it.
 *   5. The pin: `layers.json` declares `lab` with its own repository, a `tag` that is a `v<semver>` (never a branch), and the parts to lay; `build` and
 *      `prepare` both lay it, and `.gitignore` keeps the laid copy out of a commit.
 *   6. Every workflow, hook and script that RUNS a test file of the old directory by path names a file that is tracked. Those tests were relocated by NAME,
 *      below, and an unplaced one is a pin that silently stops running.
 *   7. The tree-wide guards the product keeps (ADR 0040 decision 4; #2703 stated 30 in all, 3 staying and 27 leaving) still run on the product's tree and select
 *      nothing that left: every one exists, none is under `packages/lab/`, and the three that stayed are still found.
 *
 * THE POSITIVE CONTROL is each function over a fixture: a guard glob that still names a deleted `packages/lab/` path is REFUSED naming it, and so is a
 * workspace holding the directory, a lockfile with an importer or a link, a changeset naming the package, a declaration with a branch for a tag, and a guard
 * selected from the departed directory. A reader that found nothing in the real tree would otherwise be indistinguishable from one that cannot see.
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
import { treeWideGuardFiles } from "./tree-wide-guards.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const DEPARTED_DIRECTORY = "lab";
const DEPARTED_PATH = `packages/${DEPARTED_DIRECTORY}`;
const PACKAGE_NAME = "@a11ign/lab";
/** Floors on what each reader SEES before an empty answer from it means anything (each is well under the reading, which is the point of a floor, not a pin). */
const MIN_WORKSPACE_DIRECTORIES = 5;
const MIN_LOCKFILE_IMPORTERS = 5;
const MIN_TEST_GLOBS = 4;
const MIN_WORKFLOWS = 10;
const MIN_RELOCATED = 15;
/** The tree-wide guards beyond the three that stayed: the leak scans and the fence, which declare themselves too. */
const RELOCATED_GUARDS = 3;
/** What a declared tag looks like: `v` and a semver. Spelled here as well as in `lay-layer.mjs`, so a loosening in one is a failure in the other. */
const SEMVER_TAG = /^v\d+\.\d+\.\d+$/;

/**
 * Where each test of the old directory that something still depends on went, by name (the row's done-when 4). The key is the file as it was named in
 * `packages/lab/src/packaging/` (or `nightly/`), the value is where it is tracked now. A name here with no tracked file at the new path fails, and so does
 * one still tracked at the old.
 */
const RELOCATED: Record<string, string> = {
  "packages/lab/src/packaging/layer-edges.test.ts": "packages/guards/src/layer-edges.test.ts", // #3501, with its fixtures at packages/guards/src/fixtures/layer-edges
  "packages/lab/src/packaging/screenreader-worker-extraction.test.ts": "packages/guards/src/screenreader-worker-extraction.test.ts", // #3447
  "packages/lab/src/packaging/pnpm-workspace.test.ts": "packages/guards/src/pnpm-workspace.test.ts", // #3447
  "packages/lab/src/packaging/dora-declaration.test.ts": "packages/guards/src/dora-declaration.test.ts", // #3138
  "packages/lab/src/packaging/control-extraction.test.ts": "packages/guards/src/control-extraction.test.ts", // #2704
  "packages/lab/src/packaging/lay-layer.test.ts": "packages/guards/src/lay-layer.test.ts", // #3504, the test of the script this row changes
  "packages/lab/src/packaging/nightly-only-path.test.ts": "packages/guards/src/nightly-only-path.test.ts", // #1135, #1149
  "packages/lab/nightly/tenants.mjs": "packages/guards/nightly/tenants.mjs", // the manifest nightly-only-path.test.ts pins both ways
  "packages/lab/nightly/bounded-window-reads.test.ts": "packages/guards/nightly/bounded-window-reads.test.ts", // a nightly tenant: a read of GitHub, not of the lab
  "packages/lab/nightly/isolation-gate-real-consumer.test.ts": "packages/guards/nightly/isolation-gate-real-consumer.test.ts", // a nightly tenant: the product's isolation gate
  // Run BY PATH from a product workflow or hook (claim 6), so they cannot stay in a directory the product does not hold:
  "packages/lab/src/packaging/one-package-manager.test.ts": "packages/guards/src/one-package-manager.test.ts", // dependency-pr-body.yml
  "packages/lab/src/packaging/branch-protection.test.ts": "packages/guards/src/branch-protection.test.ts", // nightly.yml
  "packages/lab/src/packaging/layer-repository-protection.test.ts": "packages/guards/src/layer-repository-protection.test.ts", // nightly.yml
  "packages/lab/src/packaging/release-publishes-only-what-stays.test.ts": "packages/guards/src/release-publishes-only-what-stays.test.ts", // release.yml
  "packages/lab/src/packaging/board-document-chrome-resolver.test.ts": "packages/guards/src/board-document-chrome-resolver.test.ts", // reusable-board.yml, ci.yml's agentOrg job, verify.mjs
  "packages/lab/src/packaging/tracked-source-leak-guard.test.ts": "packages/guards/src/tracked-source-leak-guard.test.ts", // the pre-push hook's leak scan
  "packages/lab/src/packaging/tracked-prose-leak-guard.test.ts": "packages/guards/src/tracked-prose-leak-guard.test.ts", // the pre-push hook's leak scan
  "packages/lab/src/packaging/leak-patterns.mjs": "packages/guards/src/leak-patterns.mjs", // the two leak guards' patterns
  "packages/lab/src/packaging/gh-api-read.mjs": "packages/guards/src/gh-api-read.mjs", // layer-repository-protection's reader
};

/** Writes `files` (path -> text) under a fresh directory, runs `body` on it, and removes it however `body` ends. */
function withFixture<T>(files: Record<string, string>, body: (root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), "lab-delete-"));
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
    const parent = glob.slice(0, -"/*".length);
    return readdirSync(join(root, parent), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => posix.join(parent, entry.name));
  }).filter((directory) => !excluded.has(directory));
}

function manifestName(root: string, directory: string): string | null {
  try {
    return (JSON.parse(read(root, join(directory, "package.json"))) as { name?: string }).name ?? null;
  } catch (cause) {
    // A workspace directory with no manifest (a build output, a cache, a laid layer) is not a member; any other failure is a real defect.
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error(`cannot read ${directory}/package.json`, { cause });
  }
}

/** Every way the workspace still holds the departed package, as a sentence naming it. */
function workspaceRefusals(root: string): string[] {
  const directories = workspaceDirectories(root);
  const byDirectory = directories.filter((directory) => posix.basename(directory) === DEPARTED_DIRECTORY).map((directory) => `${directory} is still a workspace directory`);
  const byName = directories.flatMap((directory) => (manifestName(root, directory) === PACKAGE_NAME ? [`${directory} still carries the name ${PACKAGE_NAME}`] : []));
  return [...byDirectory, ...byName];
}

test("no file under packages/lab is tracked", () => {
  const files = tracked(REPO_ROOT, DEPARTED_PATH);
  assert.deepEqual(files, [], `${files.length} tracked file(s) remain under the directory that left`);
});

test("the workspace matches no lab directory and no manifest carries the package's name", () => {
  assert.ok(workspaceDirectories(REPO_ROOT).length >= MIN_WORKSPACE_DIRECTORIES, "the workspace expanded to almost nothing: the reader is not looking at the tree");
  assert.deepEqual(workspaceRefusals(REPO_ROOT), []);
});

test("POSITIVE CONTROL: a workspace holding the directory, or the name under another directory, is refused naming it; the exclusion lets a laid copy stand", () => {
  const files = {
    "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n',
    "packages/lab/package.json": `{ "name": "${PACKAGE_NAME}" }`,
    "packages/renamed/package.json": `{ "name": "${PACKAGE_NAME}" }`,
    "packages/fine/package.json": '{ "name": "@a11ign/evidence" }',
  };
  withFixture(files, (root) => {
    assert.deepEqual(workspaceRefusals(root), [
      "packages/lab is still a workspace directory",
      `packages/lab still carries the name ${PACKAGE_NAME}`,
      `packages/renamed still carries the name ${PACKAGE_NAME}`,
    ]);
  });
  withFixture({ ...files, "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n  - "!packages/lab"\n' }, (root) => {
    assert.deepEqual(workspaceRefusals(root), [`packages/renamed still carries the name ${PACKAGE_NAME}`], "the exclusion removes the directory and nothing else");
  });
});

// ---- 2. the lockfile holds nothing of it ----------------------------------------------------------------------------

type Lockfile = { importers?: Record<string, unknown> };

/** Lines and importers of `lockfile` that still hold the departed package: an importer under its path, a `link:` to it, or its name. */
function lockfileRefusals(lockfile: string): string[] {
  const importers = Object.keys((parse(lockfile) as Lockfile).importers ?? {}).filter((importer) => importer === DEPARTED_PATH || importer.endsWith(`/${DEPARTED_DIRECTORY}`))
    .map((importer) => `an importer under the departed path: ${importer}`);
  const links = lockfile.split("\n").filter((line) => new RegExp(`link:[^\\s'"]*\\b${DEPARTED_DIRECTORY}\\b`).test(line)).map((line) => `a link to the departed package: ${line.trim()}`);
  const named = lockfile.split("\n").filter((line) => line.includes(`'${PACKAGE_NAME}'`) || line.includes(`${PACKAGE_NAME}@`)).map((line) => `the package's name: ${line.trim()}`);
  return [...importers, ...links, ...named];
}

test("pnpm-lock.yaml holds no importer under packages/lab, no link: to it and no @a11ign/lab entry", () => {
  const lockfile = read(REPO_ROOT, "pnpm-lock.yaml");
  assert.ok(Object.keys((parse(lockfile) as Lockfile).importers ?? {}).length >= MIN_LOCKFILE_IMPORTERS, "the lockfile has almost no importers: the reader is not looking at it");
  assert.deepEqual(lockfileRefusals(lockfile), []);
});

test("POSITIVE CONTROL: an importer, a link: and the package's own name are each REFUSED, naming it", () => {
  const lockfile = (body: string) => `lockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    dependencies: {}\n${body}`;
  assert.deepEqual(lockfileRefusals(lockfile("\n  packages/lab:\n    dependencies: {}\n")), ["an importer under the departed path: packages/lab"]);
  assert.deepEqual(lockfileRefusals(lockfile("\n  packages/cli:\n    dependencies:\n      x:\n        specifier: 0.0.0\n        version: link:../lab\n")),
    ["a link to the departed package: version: link:../lab"]);
  assert.deepEqual(lockfileRefusals(lockfile(`\n  packages/cli:\n    devDependencies:\n      '${PACKAGE_NAME}':\n        specifier: 0.1.0\n        version: 0.1.0\n`)),
    [`the package's name: '${PACKAGE_NAME}':`]);
  assert.deepEqual(lockfileRefusals(lockfile("\n  packages/cli:\n    dependencies: {}\n")), [], "a lockfile with none of them passes");
});

// ---- 3. no test glob names the directory ----------------------------------------------------------------------------

/** `packages/{a,lab,b}/...` and `packages/lab/...`: a glob token that selects the departed directory. */
const NAMES_DEPARTED_DIRECTORY = new RegExp(`packages/(?:lab\\b|\\{[^}]*\\b${DEPARTED_DIRECTORY}\\b[^}]*\\})`);

/** The scripts of the root manifest that run tests and hand a glob to the runner, and the quoted globs each one names. */
function testScriptGlobs(manifest: { scripts: Record<string, string> }): { script: string; glob: string }[] {
  return Object.entries(manifest.scripts).filter(([name]) => name.startsWith("test") || name === "coverage")
    .flatMap(([script, command]) => [...command.matchAll(/(?:\\"|")([^"\\]*\*[^"\\]*)(?:\\"|")/g)].map((match) => ({ script, glob: match[1] })));
}

/** Every test glob in `manifest` that selects the departed directory, as a sentence naming the script and the glob. */
function globRefusals(manifest: { scripts: Record<string, string> }): string[] {
  return testScriptGlobs(manifest).filter(({ glob }) => NAMES_DEPARTED_DIRECTORY.test(glob)).map(({ script, glob }) => `${script} still names the departed directory: ${glob}`);
}

test("no test:* script's glob names packages/lab, as a path or in a brace list", () => {
  const manifest = JSON.parse(read(REPO_ROOT, "package.json"));
  const globs = testScriptGlobs(manifest);
  // The reader's own precondition: it SEES the globs, or "none names lab" is a statement about an empty list.
  assert.ok(globs.length >= MIN_TEST_GLOBS && globs.some(({ script }) => script === "test:ts") && globs.some(({ script }) => script === "test:org"), `the reader found ${globs.length} test glob(s)`);
  assert.deepEqual(globRefusals(manifest), []);
});

test("POSITIVE CONTROL: a guard glob that still names a deleted packages/lab path is REFUSED, naming the script and the glob", () => {
  const manifest = (script: string) => ({ scripts: { "test:org": script, "test:ts": 'node x.mjs \\"packages/{evidence,judge}/src/**/*.test.ts\\" --min=1' } });
  assert.deepEqual(globRefusals(manifest('node x.mjs \\"packages/{agent-org,guards,lab,control}/src/**/*.test.ts\\" --min=300')),
    ["test:org still names the departed directory: packages/{agent-org,guards,lab,control}/src/**/*.test.ts"], "a brace list that holds lab");
  assert.deepEqual(globRefusals(manifest('node x.mjs "packages/lab/src/**/*.test.ts" --min=1')),
    ['test:org still names the departed directory: packages/lab/src/**/*.test.ts'], "a path under it");
  assert.deepEqual(globRefusals(manifest('node x.mjs \\"packages/{agent-org,guards,control}/src/**/*.test.ts\\" --min=50')), [], "the same glob without it passes");
  assert.deepEqual(globRefusals(manifest('node x.mjs \\"packages/laboratory/src/**/*.test.ts\\" --min=1')), [], "a directory whose name only begins with lab is not it");
});

// ---- 4. no changeset names the package ------------------------------------------------------------------------------

/** The names an entry's frontmatter versions: `"name": bump` lines between the `---` fences. */
function changesetNames(text: string): string[] {
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  return [...frontmatter.matchAll(/^["']?([^"':\s]+)["']?\s*:/gm)].map((match) => match[1]);
}

/** Every pending changeset that versions the package, and any entry for it in the changeset configuration, as sentences naming them. */
function changesetRefusals(root: string): string[] {
  const entries = readdirSync(join(root, ".changeset")).filter((file) => file.endsWith(".md") && file !== "README.md")
    .filter((file) => changesetNames(read(root, join(".changeset", file))).includes(PACKAGE_NAME)).map((file) => `.changeset/${file} names ${PACKAGE_NAME}`);
  const config = read(root, ".changeset/config.json");
  return config.includes(PACKAGE_NAME) ? [...entries, `.changeset/config.json names ${PACKAGE_NAME}`] : entries;
}

test("no pending changeset names the package and the changeset configuration has no entry for it", () => {
  assert.deepEqual(changesetRefusals(REPO_ROOT), []);
});

test("POSITIVE CONTROL: an entry or a configuration naming the package is REFUSED, and prose naming it is not", () => {
  const entry = (name: string) => `---\n"${name}": minor\n"a11ign": patch\n---\n\nbody\n`;
  const files = {
    ".changeset/names-it.md": entry(PACKAGE_NAME),
    ".changeset/other.md": entry("@a11ign/evidence"),
    ".changeset/README.md": `# Changesets\n\n${PACKAGE_NAME} is released from its own repository\n`,
    ".changeset/config.json": "{}",
  };
  withFixture(files, (root) => assert.deepEqual(changesetRefusals(root), [`.changeset/names-it.md names ${PACKAGE_NAME}`]));
  withFixture({ ...files, ".changeset/config.json": `{ "ignore": ["${PACKAGE_NAME}"] }` }, (root) => {
    assert.deepEqual(changesetRefusals(root), [`.changeset/names-it.md names ${PACKAGE_NAME}`, `.changeset/config.json names ${PACKAGE_NAME}`]);
  });
});

// ---- 5. the pin -----------------------------------------------------------------------------------------------------

type LayerEntry = { path?: string; remote?: string; tag?: string; lays?: string[] };
type LayersManifest = { layers: Record<string, LayerEntry>; pinned?: Record<string, LayerEntry> };

/** What is wrong with `lab`'s declaration, the scripts that lay it and the ignore line that keeps the laid copy out of a commit. */
function pinRefusals({ manifest, scripts, gitignore }: { manifest: LayersManifest; scripts: Record<string, string>; gitignore: string }): string[] {
  const entry = manifest.pinned?.[DEPARTED_DIRECTORY];
  if (entry === undefined) return ["packages/control/layers.json declares no `lab` layer under `pinned`"];
  // Under `layers` a guest and a lab job must hold a pinned checkout of it (`separateLayers`), and nothing on a worker runs the lab.
  const held = Object.hasOwn(manifest.layers, DEPARTED_DIRECTORY) ? ["`lab` is declared under `layers`, which makes fleet:deploy and every lab job demand a pin for it"] : [];
  const declaration = [
    ...held,
    ...(entry.path === DEPARTED_PATH ? [] : [`the layer's path is ${entry.path}, not ${DEPARTED_PATH}`]),
    ...(/^https:\/\/github\.com\/a11ign\/lab\.git$/.test(entry.remote ?? "") ? [] : [`the layer's remote is ${entry.remote}, not a11ign/lab`]),
    ...(SEMVER_TAG.test(entry.tag ?? "") ? [] : [`the layer's tag is ${entry.tag}: a pin is a v<semver> tag, never a branch or a sha`]),
    ...(Array.isArray(entry.lays) && entry.lays.length > 0 ? [] : ["the layer names nothing to lay"]),
  ];
  const laid = ["build", "prepare"].filter((name) => !(scripts[name] ?? "").includes("lay-layer.mjs lab")).map((name) => `\`${name}\` does not lay lab`);
  const ignored = gitignore.split("\n").some((line) => line.trim() === `/${DEPARTED_PATH}`) ? [] : [`.gitignore does not ignore /${DEPARTED_PATH}`];
  return [...declaration, ...laid, ...ignored];
}

const pinInputs = (root: string) => ({
  manifest: JSON.parse(read(root, "packages/control/layers.json")) as LayersManifest,
  scripts: (JSON.parse(read(root, "package.json")) as { scripts: Record<string, string> }).scripts,
  gitignore: read(root, ".gitignore"),
});

test("lab is taken as a pinned tag of a11ign/lab, laid by build and prepare, and kept out of a commit", () => {
  const { manifest, scripts, gitignore } = pinInputs(REPO_ROOT);
  assert.deepEqual(pinRefusals({ manifest, scripts, gitignore }), []);
  // The parts to lay are what the rest of the tree reads by path, so a part dropped from the declaration is a read that stops resolving.
  assert.deepEqual([...(manifest.pinned?.lab.lays ?? [])].sort(), ["CLAUDE.md", "baselines", "rule-ownership.json", "scripts", "src"]);
});

test("POSITIVE CONTROL: a branch for a tag, a missing layer, a layer a deploy would demand a pin for, a build that does not lay it and an unignored laid copy are each REFUSED", () => {
  const lab = { path: DEPARTED_PATH, remote: "https://github.com/a11ign/lab.git", tag: "v0.1.2", lays: ["src"] };
  const good = { manifest: { layers: {}, pinned: { lab } },
    scripts: { build: "node scripts/lay-layer.mjs lab", prepare: "node scripts/lay-layer.mjs lab && x" }, gitignore: `/${DEPARTED_PATH}\n` };
  assert.deepEqual(pinRefusals(good), []);
  assert.match(pinRefusals({ ...good, manifest: { layers: {}, pinned: { lab: { ...lab, tag: "main" } } } })[0], /a pin is a v<semver> tag, never a branch or a sha/);
  assert.match(pinRefusals({ ...good, manifest: { layers: {}, pinned: { lab: { ...lab, tag: undefined } } } })[0], /a pin is a v<semver> tag/);
  assert.deepEqual(pinRefusals({ ...good, manifest: { layers: {}, pinned: {} } }), ["packages/control/layers.json declares no `lab` layer under `pinned`"]);
  assert.deepEqual(pinRefusals({ ...good, manifest: { layers: { lab }, pinned: { lab } } }), ["`lab` is declared under `layers`, which makes fleet:deploy and every lab job demand a pin for it"]);
  assert.deepEqual(pinRefusals({ ...good, scripts: { build: "node scripts/lay-layer.mjs lab", prepare: "x" } }), ["`prepare` does not lay lab"]);
  assert.deepEqual(pinRefusals({ ...good, gitignore: "node_modules\n" }), [`.gitignore does not ignore /${DEPARTED_PATH}`]);
});

// ---- 6. what runs a test of the old directory by path is tracked, and every relocation is real --------------------------

/** Quoted or bare repo paths of tests under the departed directory that a workflow, hook or script names. */
const DEPARTED_TEST_PATH = /packages\/lab\/[\w./*-]*\.test\.(?:ts|mjs)\b/g;

/** Files whose text RUNS a test by path: the workflows, the hook, the verify script. Comments are not stripped: a comment that names a deleted test is a stale instruction. */
function departedTestRefusals(files: Record<string, string>): string[] {
  return Object.entries(files).flatMap(([path, text]) => [...new Set(text.match(DEPARTED_TEST_PATH) ?? [])].map((name) => `${path} names ${name}, a test of the directory that left`));
}

/** The files that run tests by path, read from `root`. */
function runners(root: string): Record<string, string> {
  const names = [...readdirSync(join(root, ".github/workflows")).filter((file) => /\.ya?ml$/.test(file)).map((file) => join(".github/workflows", file)), "scripts/git-hooks/pre-push", "scripts/verify.mjs"];
  return Object.fromEntries(names.map((path) => [path, read(root, path)]));
}

test("nothing that runs a test by path names a test of packages/lab/", () => {
  const files = runners(REPO_ROOT);
  assert.ok(Object.keys(files).length >= MIN_WORKFLOWS, "the reader found almost no workflow: it is not looking at the tree");
  // The workflow that holds the generated-file comment is exempt BY NAME and by claim: `consumer-gate.yml` and `outsider-job.yml` say which test checks them
  // in a header, and that test is a lab one by the ADR's own split (27 move with lab). The header is prose, and `departedTestRefusals` reads prose, so those
  // two files are asserted to carry exactly that and nothing that RUNS it.
  const generatedHeaders = ["packages/lab/src/packaging/consumer-gate.test.ts"];
  const found = departedTestRefusals(files).filter((line) => !generatedHeaders.some((header) => line.includes(header)));
  assert.deepEqual(found, []);
});

test("POSITIVE CONTROL: a workflow, a hook or a script that runs a deleted lab test is REFUSED naming the file and the test", () => {
  assert.deepEqual(departedTestRefusals({
    ".github/workflows/a.yml": "run: pnpm exec rstest run --include packages/lab/src/packaging/gone.test.ts\n",
    "scripts/git-hooks/pre-push": "run x tsx --test \\\n  packages/lab/src/packaging/a.test.ts \\\n  packages/lab/src/packaging/a.test.ts\n",
    "scripts/verify.mjs": 'const t = "packages/guards/src/layer-edges.test.ts";\n',
  }), [
    ".github/workflows/a.yml names packages/lab/src/packaging/gone.test.ts, a test of the directory that left",
    "scripts/git-hooks/pre-push names packages/lab/src/packaging/a.test.ts, a test of the directory that left",
  ], "named once per file, and a relocated test's new path is not a refusal");
});

test("every test relocated by name is tracked at its new home and not at its old", () => {
  const now = new Set(tracked(REPO_ROOT, "packages/guards", "scripts"));
  assert.ok(Object.keys(RELOCATED).length >= MIN_RELOCATED, "the table is nearly empty: the check below would pass on nothing");
  const missing = Object.entries(RELOCATED).filter(([, to]) => !now.has(to)).map(([from, to]) => `${from} went to ${to}, which is not tracked`);
  const left = Object.keys(RELOCATED).filter((from) => tracked(REPO_ROOT, from).length > 0).map((from) => `${from} is still tracked`);
  assert.deepEqual([...missing, ...left], []);
});

// ---- 7. the tree-wide guards the product keeps still run, and select nothing that left ------------------------------

/** Names the tree-wide guards outside the departed directory that must still be found: the three #2703 counted as staying. */
const STAYING_GUARDS = [
  "packages/control/src/fleet-layer/entry-points.test.ts",
  "packages/control/src/fleet-layer/protocol-guard.test.ts",
  "packages/judge/src/criteria-counts-are-not-spelled-out.test.ts",
];

/** What is wrong with a population of selected guards: one under the departed directory, one that does not exist, or a staying guard that is not found. */
function guardRefusals({ selected, exists }: { selected: string[]; exists: (path: string) => boolean }): string[] {
  const departed = selected.filter((path) => path.startsWith(`${DEPARTED_PATH}/`)).map((path) => `${path} is selected and lives in the directory that left`);
  const absent = selected.filter((path) => !exists(path)).map((path) => `${path} is selected and does not exist`);
  const lost = STAYING_GUARDS.filter((path) => !selected.includes(path)).map((path) => `${path} stayed with the product and is no longer found`);
  return [...departed, ...absent, ...lost];
}

test("the tree-wide guards the product keeps are still discovered, all exist, and none is under packages/lab", () => {
  const selected = treeWideGuardFiles();
  const present = new Set(tracked(REPO_ROOT));
  // The population is not empty and is not just the three: the relocated leak scans and the layer-edge fence declare themselves too.
  assert.ok(selected.length >= STAYING_GUARDS.length + RELOCATED_GUARDS, `${selected.length} guard(s) found: ${selected.join(", ")}`);
  assert.deepEqual(guardRefusals({ selected, exists: (path) => present.has(path) }), []);
  for (const relocated of ["layer-edges", "tracked-source-leak-guard", "tracked-prose-leak-guard"]) {
    assert.ok(selected.includes(`packages/guards/src/${relocated}.test.ts`), `${relocated} was relocated and is still a tree-wide guard`);
  }
});

test("POSITIVE CONTROL: a guard selected from the departed directory, a missing one and a lost staying guard are each REFUSED", () => {
  const exists = (path: string) => !path.endsWith("/vanished.test.ts");
  assert.deepEqual(guardRefusals({ selected: [...STAYING_GUARDS], exists }), [], "the three that stayed pass");
  assert.deepEqual(guardRefusals({ selected: [...STAYING_GUARDS, "packages/lab/src/packaging/ci-changed.test.ts"], exists }),
    ["packages/lab/src/packaging/ci-changed.test.ts is selected and lives in the directory that left"]);
  assert.deepEqual(guardRefusals({ selected: [...STAYING_GUARDS, "packages/guards/src/vanished.test.ts"], exists }),
    ["packages/guards/src/vanished.test.ts is selected and does not exist"]);
  assert.deepEqual(guardRefusals({ selected: STAYING_GUARDS.slice(1), exists }), [`${STAYING_GUARDS[0]} stayed with the product and is no longer found`]);
  // And the discovery itself, over a fixture population that holds a lab guard: `treeWideGuardFiles` is the product's own, so this is the seam it offers.
  const found = treeWideGuardFiles({ lsFiles: () => "packages/lab/src/packaging/x.test.ts\n", readFile: () => "declareTreeWideGuard();", imports: () => [resolve(REPO_ROOT, "packages/guards/src/tree-wide-guard.mjs")] });
  assert.deepEqual(guardRefusals({ selected: found, exists: () => true }).slice(0, 1), ["packages/lab/src/packaging/x.test.ts is selected and lives in the directory that left"]);
});
