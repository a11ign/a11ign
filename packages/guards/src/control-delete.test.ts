/**
 * #3506 (move 4 of #69, the delete step): THE DELETE'S OWN TEST. `packages/control` left the workspace for `a11ign/control` (ADR 0040, M4), and this
 * repository takes it as a PINNED TAG: `layers.json` (at the ROOT since this row, because a file inside a directory that is laid and untracked cannot say
 * which tag to lay it at) declares the tag, and `scripts/lay-layer.ts` lays control's `src/` and `ansible/` at `packages/control` (untracked, never a
 * workspace member) for the root scripts, the workflows and the hosts that run them by path. It lives in `packages/guards`, not in the directory it proves
 * gone: that directory cannot hold the test that says it is not there. `lab-delete.test.ts` is the same test for the lab, and this one differs where control does:
 *
 *   - control is the layer that READS the declaration which lays it, so the laid directory carries a COPY of `layers.json` that `lay-layer.mjs` writes
 *     over whatever the tag holds (`declares`). Claim 6 pins that the two are equal, which is what keeps `fleet:deploy`'s hasher (`layerCodeVersion`)
 *     reading the one declaration through the resolver it always used.
 *   - the root scripts RUN control's files by path, so "no root script names it" would be false and wrong. The claim is the one the row states: every
 *     path into `packages/control/` that a root script or workflow names resolves THROUGH the declared layer checkout, and one that does not is refused naming it.
 *
 * Seven claims, each with a fixture beside it:
 *
 *   1. No tracked file is under `packages/control/`, and `pnpm-workspace.yaml` matches no member of that name or carrying `@a11ign/control`.
 *   2. `pnpm-lock.yaml` holds no importer under `packages/control`, no `link:` to it and no `@a11ign/control` entry.
 *   3. No `test:*` script's glob names it, as a path or in a brace list.
 *   4. No pending changeset versions the package, and `.changeset/config.json` has no entry for it.
 *   5. The pin: `layers.json` declares `control` under `pinned` (never under `layers`), with its own repository, a `v<semver>` tag, the parts to lay and the
 *      declaration copy; `build` and `prepare` both lay it, and `.gitignore` keeps the laid copy out of a commit.
 *   6. Every `packages/control/<path>` a root script or a workflow names RESOLVES: its first segment is a part the declaration lays, the file is in the laid
 *      tree (READ, not run), the deploy and provision paths among them, and the laid `layers.json` is the root's, byte for byte.
 *   7. Nothing runs a test of the old directory by path: those tests left with it, into `a11ign/control`'s CI.
 *
 * THE POSITIVE CONTROL is each function over a fixture: a root script that runs `packages/control/src/...` by a bare path with no declared layer is REFUSED
 * naming it, and so is a workspace holding the directory, a lockfile with an importer or a link, a changeset naming the package, a declaration with a branch for
 * a tag, a build that does not lay it and a path outside what the declaration lays. A reader that found nothing in the real tree would otherwise be
 * indistinguishable from one that cannot see.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { sandboxGitEnv } from "./git-env.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const DEPARTED_DIRECTORY = "control";
const DEPARTED_PATH = `packages/${DEPARTED_DIRECTORY}`;
const PACKAGE_NAME = "@a11ign/control";
/** Floors on what each reader SEES before an empty answer from it means anything (each is well under the reading, which is the point of a floor, not a pin). */
const MIN_WORKSPACE_DIRECTORIES = 5;
const MIN_LOCKFILE_IMPORTERS = 5;
const MIN_TEST_GLOBS = 4;
const MIN_WORKFLOWS = 10;
const MIN_ROOT_SCRIPT_REFERENCES = 20;
/** What a declared tag looks like: `v` and a semver. Spelled here as well as in `lay-layer.mjs`, so a loosening in one is a failure in the other. */
const SEMVER_TAG = /^v\d+\.\d+\.\d+$/;
/** The two paths the row names: `fleet:deploy` and `fleet:provision` run these, and a delete that stopped them resolving would be found by an operator at a host. */
const DEPLOY_AND_PROVISION = [
  "packages/control/src/fleet-playbook.mjs",
  "packages/control/ansible/deploy.yml",
  "packages/control/ansible/provision-role.yml",
  "packages/control/ansible/ansible.cfg",
];

/** Writes `files` (path -> text) under a fresh directory, runs `body` on it, and removes it however `body` ends. */
function withFixture<T>(files: Record<string, string>, body: (root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), "control-delete-"));
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

test("no file under packages/control is tracked", () => {
  const files = tracked(REPO_ROOT, DEPARTED_PATH);
  assert.deepEqual(files, [], `${files.length} tracked file(s) remain under the directory that left`);
});

test("the workspace matches no control directory and no manifest carries the package's name", () => {
  assert.ok(workspaceDirectories(REPO_ROOT).length >= MIN_WORKSPACE_DIRECTORIES, "the workspace expanded to almost nothing: the reader is not looking at the tree");
  assert.deepEqual(workspaceRefusals(REPO_ROOT), []);
});

test("POSITIVE CONTROL: a workspace holding the directory, or the name under another directory, is refused naming it; the exclusion lets a laid copy stand", () => {
  const files = {
    "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n',
    "packages/control/package.json": `{ "name": "${PACKAGE_NAME}" }`,
    "packages/renamed/package.json": `{ "name": "${PACKAGE_NAME}" }`,
    "packages/fine/package.json": '{ "name": "@a11ign/evidence" }',
  };
  withFixture(files, (root) => {
    assert.deepEqual(workspaceRefusals(root), [
      "packages/control is still a workspace directory",
      `packages/control still carries the name ${PACKAGE_NAME}`,
      `packages/renamed still carries the name ${PACKAGE_NAME}`,
    ]);
  });
  withFixture({ ...files, "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n  - "!packages/control"\n' }, (root) => {
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

test("pnpm-lock.yaml holds no importer under packages/control, no link: to it and no @a11ign/control entry", () => {
  const lockfile = read(REPO_ROOT, "pnpm-lock.yaml");
  assert.ok(Object.keys((parse(lockfile) as Lockfile).importers ?? {}).length >= MIN_LOCKFILE_IMPORTERS, "the lockfile has almost no importers: the reader is not looking at it");
  assert.deepEqual(lockfileRefusals(lockfile), []);
});

test("POSITIVE CONTROL: an importer, a link: and the package's own name are each REFUSED, naming it", () => {
  const lockfile = (body: string) => `lockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    dependencies: {}\n${body}`;
  assert.deepEqual(lockfileRefusals(lockfile("\n  packages/control:\n    dependencies: {}\n")), ["an importer under the departed path: packages/control"]);
  assert.deepEqual(lockfileRefusals(lockfile("\n  packages/cli:\n    dependencies:\n      x:\n        specifier: 0.0.0\n        version: link:../control\n")),
    ["a link to the departed package: version: link:../control"]);
  assert.deepEqual(lockfileRefusals(lockfile(`\n  packages/cli:\n    devDependencies:\n      '${PACKAGE_NAME}':\n        specifier: 0.1.0\n        version: 0.1.0\n`)),
    [`the package's name: '${PACKAGE_NAME}':`]);
  assert.deepEqual(lockfileRefusals(lockfile("\n  packages/cli:\n    dependencies: {}\n")), [], "a lockfile with none of them passes");
});

// ---- 3. no test glob names the directory ----------------------------------------------------------------------------

/** `packages/{a,control,b}/...` and `packages/control/...`: a glob token that selects the departed directory. */
const NAMES_DEPARTED_DIRECTORY = new RegExp(`packages/(?:${DEPARTED_DIRECTORY}\\b|\\{[^}]*\\b${DEPARTED_DIRECTORY}\\b[^}]*\\})`);

/** The scripts of the root manifest that run tests and hand a glob to the runner, and the quoted globs each one names. */
function testScriptGlobs(manifest: { scripts: Record<string, string> }): { script: string; glob: string }[] {
  return Object.entries(manifest.scripts).filter(([name]) => name.startsWith("test") || name === "coverage")
    .flatMap(([script, command]) => [...command.matchAll(/(?:\\"|")([^"\\]*\*[^"\\]*)(?:\\"|")/g)].map((match) => ({ script, glob: match[1] })));
}

/** Every test glob in `manifest` that selects the departed directory, as a sentence naming the script and the glob. */
function globRefusals(manifest: { scripts: Record<string, string> }): string[] {
  return testScriptGlobs(manifest).filter(({ glob }) => NAMES_DEPARTED_DIRECTORY.test(glob)).map(({ script, glob }) => `${script} still names the departed directory: ${glob}`);
}

test("no test:* script's glob names packages/control, as a path or in a brace list", () => {
  const manifest = JSON.parse(read(REPO_ROOT, "package.json"));
  const globs = testScriptGlobs(manifest);
  // The reader's own precondition: it SEES the globs, or "none names control" is a statement about an empty list.
  assert.ok(globs.length >= MIN_TEST_GLOBS && globs.some(({ script }) => script === "test:ts") && globs.some(({ script }) => script === "test:org"), `the reader found ${globs.length} test glob(s)`);
  assert.deepEqual(globRefusals(manifest), []);
});

test("POSITIVE CONTROL: a guard glob that still names a deleted packages/control path is REFUSED, naming the script and the glob", () => {
  const manifest = (script: string) => ({ scripts: { "test:org": script, "test:ts": 'node x.mjs \\"packages/{evidence,judge}/src/**/*.test.ts\\" --min=1' } });
  assert.deepEqual(globRefusals(manifest('node x.mjs \\"packages/{agent-org,guards,control}/src/**/*.test.ts\\" --min=50')),
    ["test:org still names the departed directory: packages/{agent-org,guards,control}/src/**/*.test.ts"], "a brace list that holds control");
  assert.deepEqual(globRefusals(manifest('node x.mjs "packages/control/src/**/*.test.ts" --min=1')),
    ["test:org still names the departed directory: packages/control/src/**/*.test.ts"], "a path under it");
  assert.deepEqual(globRefusals(manifest('node x.mjs \\"packages/{agent-org,guards}/src/**/*.test.ts\\" --min=13')), [], "the same glob without it passes");
  assert.deepEqual(globRefusals(manifest('node x.mjs \\"packages/controller/src/**/*.test.ts\\" --min=1')), [], "a directory whose name only begins with control is not it");
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

type LayerEntry = { path?: string; remote?: string; tag?: string; lays?: string[]; declares?: string; keeps?: string[] };
type LayersManifest = { layers: Record<string, LayerEntry>; pinned?: Record<string, LayerEntry> };

/** What is wrong with `control`'s declaration, the scripts that lay it and the ignore line that keeps the laid copy out of a commit. */
function pinRefusals({ manifest, scripts, gitignore }: { manifest: LayersManifest; scripts: Record<string, string>; gitignore: string }): string[] {
  const entry = manifest.pinned?.[DEPARTED_DIRECTORY];
  if (entry === undefined) return ["layers.json declares no `control` layer under `pinned`"];
  // Under `layers` a guest and a lab job must hold a pinned checkout of it (`separateLayers`), and nothing on a worker runs control.
  const held = Object.hasOwn(manifest.layers, DEPARTED_DIRECTORY) ? ["`control` is declared under `layers`, which makes fleet:deploy and every lab job demand a pin for it"] : [];
  const declaration = [
    ...held,
    ...(entry.path === DEPARTED_PATH ? [] : [`the layer's path is ${entry.path}, not ${DEPARTED_PATH}`]),
    ...(/^https:\/\/github\.com\/a11ign\/control\.git$/.test(entry.remote ?? "") ? [] : [`the layer's remote is ${entry.remote}, not a11ign/control`]),
    ...(SEMVER_TAG.test(entry.tag ?? "") ? [] : [`the layer's tag is ${entry.tag}: a pin is a v<semver> tag, never a branch or a sha`]),
    ...(Array.isArray(entry.lays) && entry.lays.length > 0 ? [] : ["the layer names nothing to lay"]),
    ...(entry.declares === "layers.json" ? [] : ["the layer does not declare the copy of layers.json it reads, so a laid control would read the tag's, not this repository's"]),
  ];
  const laid = ["build", "prepare"].filter((name) => !(scripts[name] ?? "").includes("lay-layer.mjs control")).map((name) => `\`${name}\` does not lay control`);
  const ignored = gitignore.split("\n").some((line) => line.trim() === `/${DEPARTED_PATH}`) ? [] : [`.gitignore does not ignore /${DEPARTED_PATH}`];
  return [...declaration, ...laid, ...ignored];
}

const pinInputs = (root: string) => ({
  manifest: JSON.parse(read(root, "layers.json")) as LayersManifest,
  scripts: (JSON.parse(read(root, "package.json")) as { scripts: Record<string, string> }).scripts,
  gitignore: read(root, ".gitignore"),
});

test("control is taken as a pinned tag of a11ign/control, laid by build and prepare, and kept out of a commit", () => {
  const { manifest, scripts, gitignore } = pinInputs(REPO_ROOT);
  assert.deepEqual(pinRefusals({ manifest, scripts, gitignore }), []);
  // The parts to lay are what the rest of the tree reads by path, so a part dropped from the declaration is a read that stops resolving.
  assert.deepEqual([...(manifest.pinned?.control.lays ?? [])].sort(), ["CLAUDE.md", "README.md", "ansible", "src"]);
  // What an operator keeps INSIDE the laid directory survives a re-lay (the real fleet inventory is untracked, #54), so the declaration names it.
  assert.deepEqual([...(manifest.pinned?.control.keeps ?? [])].sort(), ["ansible/*.local.yml", "ansible/inventory.yml"]);
});

test("POSITIVE CONTROL: a branch for a tag, a missing layer, a layer a deploy would demand a pin for, no declaration copy, a build that does not lay it and an unignored laid copy are each REFUSED", () => {
  const control = { path: DEPARTED_PATH, remote: "https://github.com/a11ign/control.git", tag: "v0.1.2", lays: ["src", "ansible"], declares: "layers.json" };
  const good = { manifest: { layers: {}, pinned: { control } },
    scripts: { build: "node scripts/lay-layer.ts control", prepare: "node scripts/lay-layer.ts control && x" }, gitignore: `/${DEPARTED_PATH}\n` };
  assert.deepEqual(pinRefusals(good), []);
  assert.match(pinRefusals({ ...good, manifest: { layers: {}, pinned: { control: { ...control, tag: "main" } } } })[0], /a pin is a v<semver> tag, never a branch or a sha/);
  assert.match(pinRefusals({ ...good, manifest: { layers: {}, pinned: { control: { ...control, tag: undefined } } } })[0], /a pin is a v<semver> tag/);
  assert.deepEqual(pinRefusals({ ...good, manifest: { layers: {}, pinned: {} } }), ["layers.json declares no `control` layer under `pinned`"]);
  assert.deepEqual(pinRefusals({ ...good, manifest: { layers: { control }, pinned: { control } } }), ["`control` is declared under `layers`, which makes fleet:deploy and every lab job demand a pin for it"]);
  assert.match(pinRefusals({ ...good, manifest: { layers: {}, pinned: { control: { ...control, declares: undefined } } } })[0], /does not declare the copy of layers\.json it reads/);
  assert.deepEqual(pinRefusals({ ...good, scripts: { build: "node scripts/lay-layer.ts control", prepare: "x" } }), ["`prepare` does not lay control"]);
  assert.deepEqual(pinRefusals({ ...good, gitignore: "node_modules\n" }), [`.gitignore does not ignore /${DEPARTED_PATH}`]);
});

// ---- 6. every path into the directory resolves through the declared layer checkout -----------------------------------

/** Every `packages/control/<path>` token in `text`, with a trailing `.`, `,` or `:` (prose punctuation) trimmed off. */
const CONTROL_PATH = new RegExp(`${DEPARTED_PATH}/[\\w./*{},-]*[\\w*/]`, "g");

/** The paths `packages/control/...` that each file in `files` names, as `[file, path]`, one per distinct path. */
function controlReferences(files: Record<string, string>): [string, string][] {
  return Object.entries(files).flatMap(([file, text]) => [...new Set(text.match(CONTROL_PATH) ?? [])].map((path): [string, string] => [file, path]));
}

/**
 * Why a reference does not resolve: no declared layer at that path (a BARE path, which is exactly what a deleted directory leaves behind), a part the
 * declaration does not lay, or (when a tree is given) a file the laid tree does not hold. A reference with a glob is judged by its directory.
 */
function referenceRefusals({ references, manifest, laidRoot }: { references: [string, string][]; manifest: LayersManifest; laidRoot?: string }): string[] {
  const entry = manifest.pinned?.[DEPARTED_DIRECTORY];
  return references.flatMap(([file, path]) => {
    const inside = path.slice(DEPARTED_PATH.length + 1);
    const segment = inside.split("/")[0];
    if (entry === undefined) return [`${file} names ${path} by a bare path: layers.json declares no control layer, so nothing puts it there`];
    if (inside === "") return [];
    if (!(entry.lays ?? []).includes(segment) && segment !== entry.declares) return [`${file} names ${path}, which the declaration does not lay (it lays ${(entry.lays ?? []).join(", ")})`];
    const pieces = inside.split("/");
    const globAt = pieces.findIndex((piece) => /[*{}]/.test(piece));
    const target = join(laidRoot ?? "", DEPARTED_PATH, ...(globAt === -1 ? pieces : pieces.slice(0, globAt)));
    return laidRoot === undefined || existsSync(target) ? [] : [`${file} names ${path}, which is not in the laid tree`];
  });
}

/** The files that run or name control's paths: the root manifest's scripts, the workflows, the hooks and the root scripts. */
function referencingFiles(root: string): Record<string, string> {
  const workflows = readdirSync(join(root, ".github/workflows")).filter((file) => /\.ya?ml$/.test(file)).map((file) => join(".github/workflows", file));
  const manifest = JSON.parse(read(root, "package.json")) as { scripts: Record<string, string> };
  return { ...Object.fromEntries(workflows.map((path) => [path, read(root, path)])), "package.json": Object.values(manifest.scripts).join("\n") };
}

test("every packages/control path a root script or a workflow names resolves through the declared layer checkout, and is in the laid tree", () => {
  const files = referencingFiles(REPO_ROOT);
  const references = controlReferences(files);
  // The reader's own precondition: it SEES the root scripts' references (there are dozens), or "all resolve" is a statement about an empty list.
  assert.ok(Object.keys(files).length > MIN_WORKFLOWS, "the reader found almost no workflow: it is not looking at the tree");
  assert.ok(references.filter(([file]) => file === "package.json").length >= MIN_ROOT_SCRIPT_REFERENCES, `the reader found ${references.length} reference(s): it cannot see the root scripts`);
  assert.deepEqual(referenceRefusals({ references, manifest: pinInputs(REPO_ROOT).manifest, laidRoot: REPO_ROOT }), []);
});

test("the deploy and provision paths resolve (read, not run), and the laid layers.json is the root's byte for byte", () => {
  const scripts = (JSON.parse(read(REPO_ROOT, "package.json")) as { scripts: Record<string, string> }).scripts;
  for (const script of ["fleet:deploy", "fleet:provision"]) assert.match(scripts[script] ?? "", /packages\/control\/src\/fleet-playbook\.mjs/, `${script} no longer runs the playbook wrapper by the path this test reads`);
  for (const path of DEPLOY_AND_PROVISION) assert.ok(existsSync(join(REPO_ROOT, path)), `${path} is not in the laid tree: \`node scripts/lay-layer.mjs control\` lays it`);
  // `fleet:deploy`'s hasher (`layerCodeVersion`) and every Ansible play read `packages/control/layers.json`: it must be the declaration this repository tracks.
  assert.equal(read(REPO_ROOT, "packages/control/layers.json"), read(REPO_ROOT, "layers.json"), "the laid declaration differs from the root's: lay-layer.mjs writes it, so someone edited one");
});

test("POSITIVE CONTROL: a root script that runs packages/control/src by a bare path, a path the declaration does not lay and a file the laid tree lacks are each REFUSED, naming it", () => {
  const control = { path: DEPARTED_PATH, remote: "https://github.com/a11ign/control.git", tag: "v0.1.2", lays: ["src", "ansible"], declares: "layers.json" };
  const manifest = { layers: {}, pinned: { control } };
  const files = { "package.json": "node packages/control/src/fleet-playbook.mjs --playbook=deploy.yml\nANSIBLE_CONFIG=packages/control/ansible/ansible.cfg ansible-playbook packages/control/ansible/*.yml\n" };
  assert.deepEqual(referenceRefusals({ references: controlReferences(files), manifest: { layers: {}, pinned: {} } }), [
    "package.json names packages/control/src/fleet-playbook.mjs by a bare path: layers.json declares no control layer, so nothing puts it there",
    "package.json names packages/control/ansible/ansible.cfg by a bare path: layers.json declares no control layer, so nothing puts it there",
    "package.json names packages/control/ansible/*.yml by a bare path: layers.json declares no control layer, so nothing puts it there",
  ]);
  assert.deepEqual(referenceRefusals({ references: controlReferences(files), manifest }), [], "with the layer declared, the same references resolve");
  assert.deepEqual(referenceRefusals({ references: controlReferences({ "ci.yml": "run: node packages/control/scripts/x.mjs\n" }), manifest }),
    ["ci.yml names packages/control/scripts/x.mjs, which the declaration does not lay (it lays src, ansible)"]);
  withFixture({ "packages/control/src/fleet-playbook.mjs": "", "packages/control/ansible/ansible.cfg": "" }, (laidRoot) => {
    assert.deepEqual(referenceRefusals({ references: controlReferences({ "package.json": "node packages/control/src/fleet-playbook.mjs packages/control/src/gone.mjs packages/control/ansible/*.yml" }), manifest, laidRoot }),
      ["package.json names packages/control/src/gone.mjs, which is not in the laid tree"], "a laid tree holding the file and the glob's directory passes; a file it lacks is named");
  });
  assert.deepEqual(controlReferences({ "a.yml": "see packages/control/layers.json." }), [["a.yml", "packages/control/layers.json"]], "prose punctuation after a path is not part of it");
});

// ---- 7. what ran a test of the old directory by path is gone ---------------------------------------------------------

/** Quoted or bare repo paths of tests under the departed directory that a workflow, hook or script names. */
const DEPARTED_TEST_PATH = /packages\/control\/[\w./*-]*\.test\.(?:ts|mjs)\b/g;

/** Files whose text RUNS a test by path: the workflows, the hook, the verify script. Comments are not stripped: a comment that names a deleted test is a stale instruction. */
function departedTestRefusals(files: Record<string, string>): string[] {
  return Object.entries(files).flatMap(([path, text]) => [...new Set(text.match(DEPARTED_TEST_PATH) ?? [])].map((name) => `${path} names ${name}, a test of the directory that left`));
}

/** The files that run tests by path, read from `root`. */
function runners(root: string): Record<string, string> {
  const names = [...readdirSync(join(root, ".github/workflows")).filter((file) => /\.ya?ml$/.test(file)).map((file) => join(".github/workflows", file)), "scripts/git-hooks/pre-push", "scripts/verify.ts"];
  return Object.fromEntries(names.map((path) => [path, read(root, path)]));
}

test("nothing that runs a test by path names a test of packages/control/", () => {
  const files = runners(REPO_ROOT);
  assert.ok(Object.keys(files).length >= MIN_WORKFLOWS, "the reader found almost no workflow: it is not looking at the tree");
  assert.deepEqual(departedTestRefusals(files), []);
});

test("POSITIVE CONTROL: a workflow, a hook or a script that runs a deleted control test is REFUSED naming the file and the test", () => {
  assert.deepEqual(departedTestRefusals({
    ".github/workflows/a.yml": "run: pnpm exec rstest run --include packages/control/src/gone.test.ts\n",
    "scripts/git-hooks/pre-push": "run x tsx --test \\\n  packages/control/src/fleet-layer/a.test.ts \\\n  packages/control/src/fleet-layer/a.test.ts\n",
    "scripts/verify.ts": 'const t = "packages/guards/src/layer-edges.test.ts";\n',
  }), [
    ".github/workflows/a.yml names packages/control/src/gone.test.ts, a test of the directory that left",
    "scripts/git-hooks/pre-push names packages/control/src/fleet-layer/a.test.ts, a test of the directory that left",
  ], "named once per file, and a test that stayed is not a refusal");
});
