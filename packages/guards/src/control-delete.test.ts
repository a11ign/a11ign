/**
 * #3506 (move 4 of #69, the delete step), as ADR 0045 cut 8 (#5086) left it: THE DELETE'S OWN TEST. The `control` directory under `packages/` left the
 * workspace for `a11ign/control` (ADR 0040, M4), was LAID back at a pinned tag so the root scripts could run its files by path, and since cut 8 is not
 * laid by this repository at all: the control plane and the lab host run the commands from control's own checkout, where each of the 31 scripts the core
 * used to hold exists under the same name, and a repository does not read another's source (ADR 0045 Decision 1 rule 2). It lives in `packages/guards`,
 * not in the directory it proves gone: that directory cannot hold the test that says it is not there. `lab-delete.test.ts` is the same test for the lab.
 *
 * `layers.json`, its `pinned.control` entry and `.gitignore`'s blanket class for a copy an existing host laid earlier went with ADR 0045 cut 9 (#5087). What stays in
 * `.gitignore` is the two NAMED lines that keep an operator's real `inventory.yml` and `*.local.yml` out of a commit (#54): a leftover copy's files show as untracked
 * (host cleanup), and those two never reach a commit.
 *
 * Seven claims, each with a fixture beside it:
 *
 *   1. No tracked file is under the directory, and `pnpm-workspace.yaml` matches no member of that name or carrying `@a11ign/control`.
 *   2. `pnpm-lock.yaml` holds no importer under it, no `link:` to it and no `@a11ign/control` entry.
 *   3. No `test:*` script's glob names it, as a path or in a brace list.
 *   4. No pending changeset versions the package, and `.changeset/config.json` has no entry for it.
 *   5. No root script lays it: nothing in `package.json` runs `lay-layer`, so `prepare` and `build` leave the checkout without it.
 *   6. NO LIVE FILE NAMES IT, the sentence the row's Acceptance proves: the tracked files outside `docs/`, `.acceptance/`, `.changeset/` and the changelogs hold no
 *      mention of the path. The operator's real `inventory.yml` and `*.local.yml` in a leftover copy stay ignored by name, so neither can reach a commit (#54).
 *   7. Nothing runs a test of the old directory by path: those tests left with it, into `a11ign/control`'s CI.
 *
 * THE POSITIVE CONTROL is each function over a fixture: a root script naming the path, a workspace holding the directory, a lockfile with an importer or a
 * link, a changeset naming the package and a script that still lays it are each REFUSED naming it. Claim 6's control is a real repository in a temporary
 * directory, so the pathspec exclusions are exercised and not merely read. A reader that found nothing in the real tree would otherwise be
 * indistinguishable from one that cannot see.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { sandboxGitEnv } from "./git-env.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const DEPARTED_DIRECTORY = "control";
const DEPARTED_PATH = `packages/${DEPARTED_DIRECTORY}`;
const PACKAGE_NAME = "@a11ign/control";
/**
 * `pnpm-workspace.yaml`, `.gitignore` and the lint and type configs name a laid copy as a glob class (`packages/contro[l]`), so the cut that took the
 * directory's path out of the core's live files (ADR 0045 cut 8, #5086) finds none of them while the entries keep matching a copy an old host still has.
 * Both spellings are accepted, because a fixture that spells it out is the same claim.
 */
const asClass = (path: string) => `${path.slice(0, -1)}[${path.slice(-1)}]`;
/** Floors on what each reader SEES before an empty answer from it means anything (each is well under the reading, which is the point of a floor, not a pin). */
const MIN_WORKSPACE_DIRECTORIES = 5;
const MIN_LOCKFILE_IMPORTERS = 5;
const MIN_TEST_GLOBS = 4;
const MIN_WORKFLOWS = 10;
const MIN_TRACKED_FILES = 500;
/** The pathspecs the row's Acceptance excludes: record (`docs`, `.acceptance`, changesets, changelogs). */
const NOT_LIVE = [":!docs", ":!.acceptance", ":!.changeset", ":!**/CHANGELOG.md"];

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

const git = (root: string, args: string[]): string => execFileSync("git", args, { cwd: root, encoding: "utf8", env: sandboxGitEnv() });

/** `withFixture`, with the files tracked by a repository of their own, for the claims that ask git rather than read a file. */
function withRepoFixture<T>(files: Record<string, string>, body: (root: string) => T): T {
  return withFixture(files, (root) => {
    git(root, ["init", "-q"]);
    git(root, ["add", "-A", "-f"]);
    return body(root);
  });
}

const read = (root: string, path: string): string => readFileSync(join(root, path), "utf8");
const tracked = (root: string, ...paths: string[]): string[] => git(root, ["ls-files", "-z", "--", ...paths]).split("\0").filter(Boolean);

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
  }).filter((directory) => !excluded.has(directory) && !excluded.has(asClass(directory)));
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

test(`no file under ${DEPARTED_PATH} is tracked`, () => {
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
    [`${DEPARTED_PATH}/package.json`]: `{ "name": "${PACKAGE_NAME}" }`,
    "packages/renamed/package.json": `{ "name": "${PACKAGE_NAME}" }`,
    "packages/fine/package.json": '{ "name": "@a11ign/evidence" }',
  };
  withFixture(files, (root) => {
    assert.deepEqual(workspaceRefusals(root), [
      `${DEPARTED_PATH} is still a workspace directory`,
      `${DEPARTED_PATH} still carries the name ${PACKAGE_NAME}`,
      `packages/renamed still carries the name ${PACKAGE_NAME}`,
    ]);
  });
  for (const excluded of [DEPARTED_PATH, asClass(DEPARTED_PATH)]) {
    withFixture({ ...files, "pnpm-workspace.yaml": `packages:\n  - "packages/*"\n  - "!${excluded}"\n` }, (root) => {
      assert.deepEqual(workspaceRefusals(root), [`packages/renamed still carries the name ${PACKAGE_NAME}`], `the exclusion ${excluded} removes the directory and nothing else`);
    });
  }
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

test(`pnpm-lock.yaml holds no importer under ${DEPARTED_PATH}, no link: to it and no ${PACKAGE_NAME} entry`, () => {
  const lockfile = read(REPO_ROOT, "pnpm-lock.yaml");
  assert.ok(Object.keys((parse(lockfile) as Lockfile).importers ?? {}).length >= MIN_LOCKFILE_IMPORTERS, "the lockfile has almost no importers: the reader is not looking at it");
  assert.deepEqual(lockfileRefusals(lockfile), []);
});

test("POSITIVE CONTROL: an importer, a link: and the package's own name are each REFUSED, naming it", () => {
  const lockfile = (body: string) => `lockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    dependencies: {}\n${body}`;
  assert.deepEqual(lockfileRefusals(lockfile(`\n  ${DEPARTED_PATH}:\n    dependencies: {}\n`)), [`an importer under the departed path: ${DEPARTED_PATH}`]);
  assert.deepEqual(lockfileRefusals(lockfile("\n  packages/cli:\n    dependencies:\n      x:\n        specifier: 0.0.0\n        version: link:../control\n")),
    ["a link to the departed package: version: link:../control"]);
  assert.deepEqual(lockfileRefusals(lockfile(`\n  packages/cli:\n    devDependencies:\n      '${PACKAGE_NAME}':\n        specifier: 0.1.0\n        version: 0.1.0\n`)),
    [`the package's name: '${PACKAGE_NAME}':`]);
  assert.deepEqual(lockfileRefusals(lockfile("\n  packages/cli:\n    dependencies: {}\n")), [], "a lockfile with none of them passes");
});

// ---- 3. no test glob names the directory ----------------------------------------------------------------------------

/** A brace list or a path that selects the departed directory, as a glob token: `{a,control,b}` and `control/...`, but not `controller`. */
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

test(`no test:* script's glob names ${DEPARTED_PATH}, as a path or in a brace list`, () => {
  const manifest = JSON.parse(read(REPO_ROOT, "package.json"));
  const globs = testScriptGlobs(manifest);
  // The reader's own precondition: it SEES the globs, or "none names control" is a statement about an empty list.
  assert.ok(globs.length >= MIN_TEST_GLOBS && globs.some(({ script }) => script === "test:ts") && globs.some(({ script }) => script === "test:org"), `the reader found ${globs.length} test glob(s)`);
  assert.deepEqual(globRefusals(manifest), []);
});

test(`POSITIVE CONTROL: a guard glob that still names a deleted ${DEPARTED_PATH} path is REFUSED, naming the script and the glob`, () => {
  const manifest = (script: string) => ({ scripts: { "test:org": script, "test:ts": 'node x.mjs \\"packages/{evidence,judge}/src/**/*.test.ts\\" --min=1' } });
  assert.deepEqual(globRefusals(manifest('node x.mjs \\"packages/{agent-org,guards,control}/src/**/*.test.ts\\" --min=50')),
    ["test:org still names the departed directory: packages/{agent-org,guards,control}/src/**/*.test.ts"], "a brace list that holds control");
  assert.deepEqual(globRefusals(manifest(`node x.mjs "${DEPARTED_PATH}/src/**/*.test.ts" --min=1`)),
    [`test:org still names the departed directory: ${DEPARTED_PATH}/src/**/*.test.ts`], "a path under it");
  assert.deepEqual(globRefusals(manifest('node x.mjs \\"packages/{agent-org,guards}/src/**/*.test.ts\\" --min=13')), [], "the same glob without it passes");
  assert.deepEqual(globRefusals(manifest(`node x.mjs \\"${DEPARTED_PATH}ler/src/**/*.test.ts\\" --min=1`)), [], "a directory whose name only begins with control is not it");
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

// ---- 5. no root script lays it --------------------------------------------------------------------------------------

/** The scripts that still run `lay-layer`, which is what put the directory back at the path this file proves empty. */
function layingRefusals(scripts: Record<string, string>): string[] {
  return Object.entries(scripts).filter(([, command]) => /\blay-layer\b/.test(command)).map(([name]) => `\`${name}\` still lays a layer`);
}

const rootScripts = (root: string) => (JSON.parse(read(root, "package.json")) as { scripts: Record<string, string> }).scripts;

test("no root script lays a layer: prepare and build run the build and nothing before it", () => {
  const scripts = rootScripts(REPO_ROOT);
  // The reader's own precondition: it SEES the two scripts that used to lay, or "none lays" is a statement about a manifest that has neither.
  for (const name of ["prepare", "build"]) assert.match(scripts[name] ?? "", /pnpm\.ts -r run build/, `${name} is not the build: the reader is not looking at the script that used to lay layers`);
  assert.deepEqual(layingRefusals(scripts), []);
});

test("POSITIVE CONTROL: a script that still lays is REFUSED naming it, and one that merely contains the word is not", () => {
  assert.deepEqual(layingRefusals({ build: "node scripts/pnpm.ts -r run build", prepare: "node scripts/lay-layer.ts control && x" }), ["`prepare` still lays a layer"]);
  assert.deepEqual(layingRefusals({ build: "node scripts/lay-layer.ts lab", prepare: "node scripts/lay-layer.ts  control" }), ["`build` still lays a layer", "`prepare` still lays a layer"]);
  assert.deepEqual(layingRefusals({ other: "echo relay-layers-notes" }), [], "a script that merely contains the letters is not it");
});

// ---- 6. no live file names the directory ----------------------------------------------------------------------------

/** The tracked files outside the record (`NOT_LIVE`) that mention the departed path: the row's Acceptance, as a function over a repository. */
function liveReferences(root: string): string[] {
  try {
    return git(root, ["grep", "-lFz", DEPARTED_PATH, "--", ".", ...NOT_LIVE]).split("\0").filter(Boolean).sort();
  } catch (cause) {
    // `git grep` exits 1 for "no match", which is the answer this function exists to give; any other status is a failure to read.
    if ((cause as { status?: number }).status === 1) return [];
    throw new Error("git grep could not read the tree", { cause });
  }
}

/** Whether git ignores each of `paths`: a laid copy an old host still has must stay out of a commit, whichever way the ignore line is spelled (#54). */
function unignored(root: string, paths: string[]): string[] {
  return paths.filter((path) => {
    try {
      git(root, ["check-ignore", "-q", "--", path]);
      return false;
    } catch (cause) {
      if ((cause as { status?: number }).status === 1) return true;
      throw new Error("git check-ignore could not read the tree", { cause });
    }
  });
}

/** The two files of a leftover copy that must never reach a commit: the operator's real addresses (#54). The rest of a leftover copy is host cleanup, not a secret. */
const LAID_COPY_FILES = [`${DEPARTED_PATH}/ansible/inventory.yml`, `${DEPARTED_PATH}/ansible/me.local.yml`];

test("no live file of the core names the directory (the row's Acceptance)", () => {
  assert.ok(tracked(REPO_ROOT).length >= MIN_TRACKED_FILES, "git lists almost no tracked file: the reader is not looking at the tree");
  assert.deepEqual(liveReferences(REPO_ROOT), []);
});

test("the operator's real inventory and local playbooks in a leftover copy stay ignored, whichever way the line is spelled", () => {
  assert.deepEqual(unignored(REPO_ROOT, LAID_COPY_FILES), []);
});

test("POSITIVE CONTROL: a live file naming the path is REFUSED naming it; record and a longer name are not", () => {
  const files = {
    "package.json": `{ "scripts": { "x": "node ${DEPARTED_PATH}/src/a.ts" } }\n`,
    "scripts/y.ts": `// reads ${DEPARTED_PATH}/ansible/\n`,
    "docs/runbook.md": `run ${DEPARTED_PATH}/src/a.ts\n`,
    ".acceptance/agent~x-1.md": `${DEPARTED_PATH}/.layer-ref\n`,
    ".changeset/a.md": `${DEPARTED_PATH}\n`,
    "packages/other/CHANGELOG.md": `${DEPARTED_PATH}\n`,
    "scripts/clean.ts": "// names nothing\n",
  };
  withRepoFixture(files, (root) => assert.deepEqual(liveReferences(root), ["package.json", "scripts/y.ts"]));
  withRepoFixture({ "scripts/clean.ts": "// names nothing\n" }, (root) => assert.deepEqual(liveReferences(root), [], "a tree with none passes"));
  withRepoFixture({ ".gitignore": `${asClass(`/${DEPARTED_PATH}`)}\n`, "a.txt": "x\n" }, (root) => assert.deepEqual(unignored(root, LAID_COPY_FILES), [], "the class spelling ignores the copy"));
  withRepoFixture({ ".gitignore": `/${DEPARTED_PATH}\n`, "a.txt": "x\n" }, (root) => assert.deepEqual(unignored(root, LAID_COPY_FILES), [], "the spelled-out form ignores it too"));
  withRepoFixture({ ".gitignore": "node_modules\n", "a.txt": "x\n" }, (root) => assert.deepEqual(unignored(root, LAID_COPY_FILES), LAID_COPY_FILES, "a tree that ignores nothing is refused for each file"));
});

// ---- 7. what ran a test of the old directory by path is gone ---------------------------------------------------------

/** Quoted or bare repo paths of tests under the departed directory that a workflow, hook or script names. */
const DEPARTED_TEST_PATH = new RegExp(`${DEPARTED_PATH}/[\\w./*-]*\\.test\\.(?:ts|mjs)\\b`, "g");

/** Files whose text RUNS a test by path: the workflows, the hook, the verify script. Comments are not stripped: a comment that names a deleted test is a stale instruction. */
function departedTestRefusals(files: Record<string, string>): string[] {
  return Object.entries(files).flatMap(([path, text]) => [...new Set(text.match(DEPARTED_TEST_PATH) ?? [])].map((name) => `${path} names ${name}, a test of the directory that left`));
}

/** The files that run tests by path, read from `root`. */
function runners(root: string): Record<string, string> {
  const names = [...readdirSync(join(root, ".github/workflows")).filter((file) => /\.ya?ml$/.test(file)).map((file) => join(".github/workflows", file)), "scripts/git-hooks/pre-push", "scripts/verify.ts"];
  return Object.fromEntries(names.map((path) => [path, read(root, path)]));
}

test(`nothing that runs a test by path names a test of ${DEPARTED_PATH}/`, () => {
  const files = runners(REPO_ROOT);
  assert.ok(Object.keys(files).length >= MIN_WORKFLOWS, "the reader found almost no workflow: it is not looking at the tree");
  assert.deepEqual(departedTestRefusals(files), []);
});

test("POSITIVE CONTROL: a workflow, a hook or a script that runs a deleted control test is REFUSED naming the file and the test", () => {
  assert.deepEqual(departedTestRefusals({
    ".github/workflows/a.yml": `run: pnpm exec rstest run --include ${DEPARTED_PATH}/src/gone.test.ts\n`,
    "scripts/git-hooks/pre-push": `run x tsx --test \\\n  ${DEPARTED_PATH}/src/fleet-layer/a.test.ts \\\n  ${DEPARTED_PATH}/src/fleet-layer/a.test.ts\n`,
    "scripts/verify.ts": 'const t = "packages/guards/src/layer-edges.test.ts";\n',
  }), [
    `.github/workflows/a.yml names ${DEPARTED_PATH}/src/gone.test.ts, a test of the directory that left`,
    `scripts/git-hooks/pre-push names ${DEPARTED_PATH}/src/fleet-layer/a.test.ts, a test of the directory that left`,
  ], "named once per file, and a test that stayed is not a refusal");
});
