/**
 * `scripts/ci-changed.mjs` classifies a PR's changed files into the `ci.yml` jobs that must run. The classification is the one place
 * the conditional jobs read, so a category that stops matching anything is a CI budget regression nobody sees and a category that
 * matches too little is a SKIPPED check on a diff that needed it (#2329: docs-only, `ts` skipped, main red).
 *
 * Pinned here, each with a counter-case so that "false" is never the only thing a test has seen:
 *   1. `classify` per category (ts, python, ansible, docs, board, changeset, rulesFitness) and the `packages` list, over injected
 *      stand-ins for `npm pack`, the test dependency map and the docs-reading tests, so no npm and no runner is needed.
 *   2. THE EAGER DIRECTION: a root config or `scripts/*.mjs` change touches EVERY package; a board-only docs diff is narrower than a
 *      mixed one; the changeset answer asks what is PACKED, not what is under a package directory.
 *   3. THE READERS of a checkout (`knownPackages`, `testDependencyMap`, `docsReadingTests`, `jobsFor`) over a throwaway git repository
 *      whose tracked files are the whole input, including the refusal of a second workspace glob.
 *   4. `candidatePackedPaths` / `reachesPacked`: a source file reaches its built `dist/` counterpart by PREFIX, a test file never does.
 *
 * `packedFiles` (the real `npm pack` wrapper) is not run: it shells out to npm, and `classify` accepts a stand-in for exactly that reason.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sandboxGitEnv, withGitSandbox, type GitSandbox } from "../../../scripts/test-support/git-sandbox.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const ci = await import(pathToFileURL(join(REPO_ROOT, "scripts/ci-changed.mjs")).href);
const { DOC_ROOT_FILES, boardOnly, candidatePackedPaths, reachesPacked, classify, jobsFor, knownPackages, testDependencyMap, docsReadingTests } = ci;

interface Deps {
  getPackedFiles?: (repoRoot: string, pkgName: string) => Set<string>;
  getTestDependencyMap?: (repoRoot: string) => Map<string, Set<string>>;
  getDocsReadingTests?: (repoRoot: string) => string[];
}
const ALL_PACKAGES = ["evidence", "judge", "priv", "pub"];
const NO_TESTS_READ_DOCS = () => [] as string[];
const NO_TEST_DEPENDENCIES = () => new Map<string, Set<string>>();

/** Writes `files` into the sandbox and stages them, which is all `git ls-files` needs: no commit, no identity. */
function track(sandbox: GitSandbox, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(sandbox.dir, path)), { recursive: true });
    writeFileSync(join(sandbox.dir, path), text);
  }
  sandbox.run(["add", "-A"]);
}

const WORKSPACE = JSON.stringify({ name: "root", workspaces: ["packages/*"] });
const PUBLISHED = JSON.stringify({ name: "@a11ign/pub", version: "1.0.0" });
const PRIVATE = JSON.stringify({ name: "@a11ign/priv", private: true });

/** A checkout holding one published package and three private ones (so `jobsFor`, which has no injection point, never reaches `npm pack`). */
function trackFixtureRepo(sandbox: GitSandbox): void {
  track(sandbox, {
    "package.json": WORKSPACE,
    "packages/README.md": "a file directly under packages/ is not a package",
    "packages/pub/package.json": PUBLISHED,
    "packages/pub/src/index.ts": "export {};",
    "packages/priv/package.json": PRIVATE,
    "packages/priv/src/index.ts": "export {};",
    "packages/judge/package.json": JSON.stringify({ name: "@a11ign/judge", private: true }),
    "packages/evidence/package.json": JSON.stringify({ name: "@a11ign/evidence", private: true }),
  });
}

/** `classify` against the fixture checkout, with a packed manifest per package and no docs-reading tests unless a test says so. */
function classifyIn(sandboxDir: string, files: string[], overrides: Deps = {}) {
  const packed: Record<string, string[]> = { pub: ["package.json", "dist/index.js", "dist/index.d.ts", "README.md"], judge: [], evidence: [] };
  return classify(files, ALL_PACKAGES, {
    repoRoot: sandboxDir,
    getPackedFiles: (_root: string, name: string) => new Set(packed[name] ?? []),
    getTestDependencyMap: NO_TEST_DEPENDENCIES,
    getDocsReadingTests: NO_TESTS_READ_DOCS,
    ...overrides,
  });
}

const trueCategories = (result: Record<string, unknown>) =>
  Object.entries(result).filter(([key, value]) => key !== "packages" && value === true).map(([key]) => key);

test("boardOnly: only board summaries and reported.json count; an empty list is NOT board-only", () => {
  assert.equal(boardOnly(["docs/board/reported.json"]), true);
  assert.equal(boardOnly(["docs/board/summaries/2026-10-07.md", "docs/board/reported.json"]), true);
  assert.equal(boardOnly([]), false, "no doc changed at all is a different question");
  assert.equal(boardOnly(["docs/board/summaries/x.md", "docs/backlog.md"]), false);
  assert.equal(boardOnly(["docs/board/summaries/x.txt"]), false);
  assert.equal(boardOnly(["docs/board/summaries/nested/x.md"]), true, "the pattern is `.*`, so a nested summary is a summary");
  assert.equal(boardOnly(["docs/board/other.json"]), false);
  assert.equal(boardOnly(["README.md"]), false);
});

test("DOC_ROOT_FILES: the five root documents, nothing else", () => {
  assert.deepEqual([...DOC_ROOT_FILES].sort(), ["CLAUDE.md", "CONTRIBUTING.md", "PLAN.md", "README.md", "SECURITY.md"]);
});

test("candidatePackedPaths: a src file adds its dist prefix; a file elsewhere, or without an extension, only itself", () => {
  assert.deepEqual(candidatePackedPaths("src/foo.ts"), ["src/foo.ts", "dist/foo."]);
  assert.deepEqual(candidatePackedPaths("src/deep/dir/foo.bar.mjs"), ["src/deep/dir/foo.bar.mjs", "dist/deep/dir/foo.bar."]);
  assert.deepEqual(candidatePackedPaths("README.md"), ["README.md"]);
  assert.deepEqual(candidatePackedPaths("bin/cli.mjs"), ["bin/cli.mjs"]);
  assert.deepEqual(candidatePackedPaths("src/noext"), ["src/noext"]);
});

test("reachesPacked: a literal hit, a dist PREFIX hit, a miss, and an eager stand-in that cannot be iterated", () => {
  const packed = new Set(["dist/foo.js", "dist/foo.d.ts", "src/raw.mjs"]);
  assert.equal(reachesPacked(packed, ["src/raw.mjs"]), true, "shipped raw: its own path is the candidate");
  assert.equal(reachesPacked(packed, ["src/foo.ts", "dist/foo."]), true, "built: the prefix finds dist/foo.js");
  assert.equal(reachesPacked(packed, ["src/foo.test.ts", "dist/foo.test."]), false, "a test file has no built counterpart");
  assert.equal(reachesPacked(packed, ["dist/fo."]), false, "a prefix must end at the dot: dist/foo. does not start with dist/fo.");
  assert.equal(reachesPacked(packed, ["dist/foo"]), false, "no trailing dot means a literal lookup only");
  assert.equal(reachesPacked(new Set(), ["dist/foo."]), false);
  assert.equal(reachesPacked(packed, []), false);
  const everything = { has: () => true } as unknown as Set<string>;
  assert.equal(reachesPacked(everything, ["src/x.ts", "dist/x."]), true);
});

test("classify: an empty diff turns every category off and names no package", () => {
  withGitSandbox((sandbox) => {
    trackFixtureRepo(sandbox);
    const result = classifyIn(sandbox.dir, []);
    assert.deepEqual(result, { ts: false, python: false, ansible: false, docs: false, board: false, changeset: false, rulesFitness: false, packages: [] });
  });
});

test("classify: a file under a package marks that package, sorted and deduplicated, and turns ts on", () => {
  withGitSandbox((sandbox) => {
    trackFixtureRepo(sandbox);
    const result = classifyIn(sandbox.dir, ["packages/pub/src/index.ts", "packages/priv/src/a.ts", "packages/pub/src/c.ts"]);
    assert.deepEqual(result.packages, ["priv", "pub"]);
    assert.equal(result.ts, true);
    assert.deepEqual(trueCategories(result).sort(), ["changeset", "ts"].sort(), "src/index.ts ships as dist/index.js");
    assert.deepEqual(classifyIn(sandbox.dir, ["unrelated/file.txt"]).packages, [], "a non-package path names none");
  });
});

test("classify: a root config file or a scripts/*.mjs file touches EVERY package; a scripts file of another extension does not", () => {
  withGitSandbox((sandbox) => {
    trackFixtureRepo(sandbox);
    for (const file of ["package.json", "pnpm-lock.yaml", "tsconfig.base.json", "eslint.config.mjs", "scripts/cli-flags.mjs"]) {
      const result = classifyIn(sandbox.dir, [file]);
      assert.deepEqual(result.packages, ALL_PACKAGES, file);
      assert.equal(result.ts, true, file);
      assert.equal(result.rulesFitness, false, `${file}: a root change does NOT imply the rules fitness gate`);
    }
    const shell = classifyIn(sandbox.dir, ["scripts/hook.sh", "scripts/data.json"]);
    assert.deepEqual([shell.ts, shell.packages], [false, []]);
  });
});

test("classify: python is the python/tests trees of a package or one of the two requirements files", () => {
  withGitSandbox((sandbox) => {
    trackFixtureRepo(sandbox);
    for (const file of ["packages/scorer/python/train.py", "packages/scorer/tests/test_a.py", "requirements-ci.txt", "packages/scorer/requirements.txt"]) {
      assert.equal(classifyIn(sandbox.dir, [file]).python, true, file);
    }
    for (const file of ["packages/scorer/python/README.md", "packages/scorer/src/train.py", "scripts/x.py", "requirements.txt"]) {
      assert.equal(classifyIn(sandbox.dir, [file]).python, false, file);
    }
  });
});

test("classify: ansible turns on for the layer pin alone", () => {
  withGitSandbox((sandbox) => {
    trackFixtureRepo(sandbox);
    assert.equal(classifyIn(sandbox.dir, ["layers.json"]).ansible, true);
    assert.equal(classifyIn(sandbox.dir, ["packages/control/ansible/site.yml", "ansible/site.yml"]).ansible, false);
  });
});

test("classify: rulesFitness is judge or evidence only", () => {
  withGitSandbox((sandbox) => {
    trackFixtureRepo(sandbox);
    assert.equal(classifyIn(sandbox.dir, ["packages/judge/src/rules.ts"]).rulesFitness, true);
    assert.equal(classifyIn(sandbox.dir, ["packages/evidence/anything"]).rulesFitness, true);
    assert.equal(classifyIn(sandbox.dir, ["packages/pub/src/index.ts"]).rulesFitness, false);
    assert.equal(classifyIn(sandbox.dir, ["packages/judgement/x.ts"]).rulesFitness, false, "judge/ needs the slash");
  });
});

test("classify: docs and board are exclusive; a mixed docs diff is docs, a board-only one is board", () => {
  withGitSandbox((sandbox) => {
    trackFixtureRepo(sandbox);
    const board = classifyIn(sandbox.dir, ["docs/board/summaries/today.md", "docs/board/reported.json"]);
    assert.deepEqual([board.docs, board.board], [false, true]);
    const mixed = classifyIn(sandbox.dir, ["docs/board/reported.json", "docs/backlog.md"]);
    assert.deepEqual([mixed.docs, mixed.board], [true, false]);
    const root = classifyIn(sandbox.dir, ["README.md"]);
    assert.deepEqual([root.docs, root.board], [true, false]);
    const neither = classifyIn(sandbox.dir, ["packages/pub/src/index.ts"]);
    assert.deepEqual([neither.docs, neither.board], [false, false]);
  });
});

test("classify: a docs diff turns ts on ONLY when some test reads docs, and board never asks (#2357)", () => {
  withGitSandbox((sandbox) => {
    trackFixtureRepo(sandbox);
    const asked: string[] = [];
    const readers = (root: string) => { asked.push(root); return ["packages/pub/src/docs-reader.test.ts"]; };
    assert.equal(classifyIn(sandbox.dir, ["docs/guide.md"], { getDocsReadingTests: readers }).ts, true);
    assert.deepEqual(asked, [sandbox.dir], "asked with the repo root");
    assert.equal(classifyIn(sandbox.dir, ["docs/guide.md"]).ts, false, "no test reads docs: nothing to run");

    asked.length = 0;
    assert.equal(classifyIn(sandbox.dir, ["docs/board/reported.json"], { getDocsReadingTests: readers }).ts, false);
    assert.deepEqual(asked, [], "board has its own narrower route and does not ask");
    assert.equal(classifyIn(sandbox.dir, ["packages/pub/src/index.ts"], { getDocsReadingTests: readers }).ts, true);
    assert.deepEqual(asked, [], "a non-docs diff does not ask either");
  });
});

test("classify: on a board diff, packages whose tests NAME a changed file are folded in; on any other diff the map is not consulted (#283)", () => {
  withGitSandbox((sandbox) => {
    trackFixtureRepo(sandbox);
    const map = new Map([["docs/board/reported.json", new Set(["judge", "pub"])], ["README.md", new Set(["evidence"])]]);
    const consulted: string[] = [];
    const getTestDependencyMap = (root: string) => { consulted.push(root); return map; };

    const board = classifyIn(sandbox.dir, ["docs/board/reported.json"], { getTestDependencyMap });
    assert.deepEqual(board.packages, ["judge", "pub"]);
    assert.equal(board.ts, true, "folded packages make ts run");
    assert.deepEqual(consulted, [sandbox.dir]);

    consulted.length = 0;
    const docs = classifyIn(sandbox.dir, ["README.md"], { getTestDependencyMap });
    assert.deepEqual(docs.packages, [], "README.md is also named by non-board tests, which must not be folded for a docs diff");
    assert.deepEqual(consulted, []);

    const unnamed = classifyIn(sandbox.dir, ["docs/board/summaries/x.md"], { getTestDependencyMap });
    assert.deepEqual(unnamed.packages, [], "nothing names this board file");
  });
});

test("classify: changeset is what npm PACKS from a PUBLISHED package, not anything under it", () => {
  withGitSandbox((sandbox) => {
    trackFixtureRepo(sandbox);
    assert.equal(classifyIn(sandbox.dir, ["packages/pub/src/index.ts"]).changeset, true, "src/index.ts ships as dist/index.js");
    assert.equal(classifyIn(sandbox.dir, ["packages/pub/README.md"]).changeset, true, "a packed literal path");
    assert.equal(classifyIn(sandbox.dir, ["packages/pub/src/index.test.ts"]).changeset, false, "a test has no built counterpart");
    assert.equal(classifyIn(sandbox.dir, ["packages/pub/notes.txt"]).changeset, false, "not packed");
    assert.equal(classifyIn(sandbox.dir, ["packages/priv/src/index.ts"]).changeset, false, "a private package has no changeset question");
    assert.equal(classifyIn(sandbox.dir, ["packages/ghost/src/index.ts"]).changeset, false, "not a known package");
    assert.equal(classifyIn(sandbox.dir, ["docs/x.md", "packages/pub/notes.txt", "packages/pub/src/index.ts"]).changeset, true, "any one file suffices");
  });
});

test("classify: the packed manifest is read once per package, however many of its files changed", () => {
  withGitSandbox((sandbox) => {
    trackFixtureRepo(sandbox);
    track(sandbox, { "packages/pub2/package.json": JSON.stringify({ name: "@a11ign/pub2" }) });
    const asked: string[] = [];
    const getPackedFiles = (_root: string, name: string) => { asked.push(name); return new Set<string>(); };
    classify(["packages/pub/a.txt", "packages/pub/b.txt", "packages/pub/c.txt", "packages/pub2/x.txt"], [...ALL_PACKAGES, "pub2"],
      { repoRoot: sandbox.dir, getPackedFiles, getTestDependencyMap: NO_TEST_DEPENDENCIES, getDocsReadingTests: NO_TESTS_READ_DOCS });
    assert.deepEqual(asked, ["pub", "pub2"]);
  });
});

test("classify: a manifest-less package that is named but unreadable surfaces as an error, not as a quiet false", () => {
  withGitSandbox((sandbox) => {
    trackFixtureRepo(sandbox);
    assert.throws(() => classify(["packages/ghost/x.txt"], [...ALL_PACKAGES, "ghost"], { repoRoot: sandbox.dir, getTestDependencyMap: NO_TEST_DEPENDENCIES }),
      { code: "ENOENT" });
  });
});

test("knownPackages: the package directories git tracks under packages/, sorted, skipping a file directly under packages/", () => {
  withGitSandbox((sandbox) => {
    trackFixtureRepo(sandbox);
    assert.deepEqual(knownPackages(sandbox.dir), ["evidence", "judge", "priv", "pub"]);
  });
});

test("knownPackages: a workspaces list that is not exactly packages/* is refused, naming what package.json says", () => {
  withGitSandbox((sandbox) => {
    track(sandbox, { "package.json": JSON.stringify({ workspaces: ["packages/*", "tools/*"] }), "packages/a/package.json": "{}" });
    assert.throws(() => knownPackages(sandbox.dir), (e: Error) =>
      e.message.includes('assumes a single "packages/*" workspace glob') && e.message.includes('["packages/*","tools/*"]'));
    track(sandbox, { "package.json": JSON.stringify({ workspaces: ["apps/*"] }) });
    assert.throws(() => knownPackages(sandbox.dir), /\["apps\/\*"\]/);
    // Positive control: with no `workspaces` field the default is the one glob, and the read succeeds.
    track(sandbox, { "package.json": JSON.stringify({ name: "no-workspaces" }) });
    assert.deepEqual(knownPackages(sandbox.dir), ["a"]);
  });
});

test("knownPackages: no tracked packages is an empty list, and the real checkout has some", () => {
  withGitSandbox((sandbox) => {
    track(sandbox, { "package.json": WORKSPACE });
    assert.deepEqual(knownPackages(sandbox.dir), []);
  });
  const real = knownPackages(REPO_ROOT) as string[];
  assert.ok(real.includes("guards"), "this test's own package is tracked");
  assert.deepEqual(real, [...real].sort());
});

test("testDependencyMap: every file: literal in a tracked packages/*/src/*.test.ts maps to the package whose test names it", () => {
  withGitSandbox((sandbox) => {
    track(sandbox, {
      "package.json": WORKSPACE,
      "packages/alpha/src/one.test.ts": 'const SITES = [{ file: "README.md" }, { file: \'docs/a.md\' }];',
      "packages/beta/src/deep/two.test.ts": 'const SITES = [{ file: "README.md" }];',
      "packages/beta/src/helper.ts": '{ file: "ignored-not-a-test.md" }',
      "packages/beta/other/three.test.ts": '{ file: "ignored-not-under-src.md" }',
      "packages/beta/src/three.test.mjs": '{ file: "ignored-wrong-extension.md" }',
      "packages/gamma/src/none.test.ts": "no sites here at all",
    });
    const map = testDependencyMap(sandbox.dir) as Map<string, Set<string>>;
    assert.deepEqual([...map.keys()].sort(), ["README.md", "docs/a.md"]);
    assert.deepEqual([...(map.get("README.md") ?? [])].sort(), ["alpha", "beta"]);
    assert.deepEqual([...(map.get("docs/a.md") ?? [])], ["alpha"]);
  });
});

test("testDependencyMap: a checkout with no matching tests yields an empty map", () => {
  withGitSandbox((sandbox) => {
    track(sandbox, { "package.json": WORKSPACE, "packages/a/src/x.ts": "{ file: \"x\" }" });
    assert.equal((testDependencyMap(sandbox.dir) as Map<string, unknown>).size, 0);
  });
});

test("docsReadingTests: tests that quote a docs path or root doc, walk a directory or list tracked files are found, sorted; others are not", () => {
  withGitSandbox((sandbox) => {
    track(sandbox, {
      "package.json": WORKSPACE,
      "packages/z/src/quotes-docs.test.ts": 'readFileSync(join(root, "docs/backlog.md"));',
      "packages/a/src/root-doc.test.ts": "const text = readFileSync('README.md');",
      "packages/m/src/walks.test.ts": "const entries = readdirSync(dir);",
      "packages/m/src/globs.test.ts": 'const all = globSync("**/*.md");',
      "packages/m/src/tracked.test.ts": 'const files = execFileSync("git", ["ls-files", "docs"]);',
      "packages/m/src/pure.test.ts": 'assert.equal(add(1, 2), 3); const s = "documents";',
      "packages/m/src/not-a-test.ts": 'readFileSync("docs/x.md")',
      "packages/m/lib/outside-src.test.ts": 'readFileSync("docs/x.md")',
    });
    assert.deepEqual(docsReadingTests(sandbox.dir), [
      "packages/a/src/root-doc.test.ts",
      "packages/m/src/globs.test.ts",
      "packages/m/src/tracked.test.ts",
      "packages/m/src/walks.test.ts",
      "packages/z/src/quotes-docs.test.ts",
    ]);
  });
});

test("docsReadingTests: a checkout whose tests read nothing of the sort yields none, and the real checkout has readers (positive control)", () => {
  withGitSandbox((sandbox) => {
    track(sandbox, { "package.json": WORKSPACE, "packages/a/src/pure.test.ts": "assert.equal(1, 1);" });
    assert.deepEqual(docsReadingTests(sandbox.dir), []);
  });
  assert.ok((docsReadingTests(REPO_ROOT) as string[]).length > 0);
});

test("jobsFor: the job names classify set true, in the workflow's order, for a file list against a checkout", () => {
  withGitSandbox((sandbox) => {
    trackFixtureRepo(sandbox);
    assert.deepEqual(jobsFor(["packages/judge/src/rules.ts"], sandbox.dir), ["ts", "rulesFitness"]);
    assert.deepEqual(jobsFor(["layers.json", "packages/scorer/python/x.py"], sandbox.dir), ["ts", "python", "ansible"]);
    assert.deepEqual(jobsFor(["scripts/x.mjs"], sandbox.dir), ["ts"]);
    assert.deepEqual(jobsFor([], sandbox.dir), []);
  });
});

test("jobsFor: a board-only diff routes to board, and a docs diff to docs, against the real checkout (#283)", () => {
  const board = jobsFor(["docs/board/summaries/2026-10-07.md"], REPO_ROOT) as string[];
  assert.ok(board.includes("board") && !board.includes("docs"), board.join(","));
  const docs = jobsFor(["docs/backlog.md"], REPO_ROOT) as string[];
  assert.ok(docs.includes("docs") && !docs.includes("board"), docs.join(","));
});

const SCRIPT = join(REPO_ROOT, "scripts/ci-changed.mjs");
const EXIT_REFUSED = 2;
const BASE_REF = "base-ref";

/** Runs the real CLI as a child process against a checkout; GITHUB_OUTPUT is only set when the test asks for it. */
function runCli(args: string[], env: Record<string, string> = {}) {
  const run = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env: { ...sandboxGitEnv(), PATH: process.env.PATH ?? "", ...env } });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

/** The fixture checkout with a base ref, then one more commit that edits `file` (a PR's diff against `BASE_REF`). */
function branchEditing(sandbox: GitSandbox, file: string): void {
  trackFixtureRepo(sandbox);
  sandbox.run(["add", "-A"]);
  sandbox.commit("base");
  sandbox.run(["branch", BASE_REF]);
  track(sandbox, { [file]: "changed by the PR\n" });
  sandbox.commit("the pull request");
}

test("CLI: a flag it does not read, and an --event other than pull_request or merge_group, are refused with exit 2 and a reason", () => {
  const unknown = runCli(["--event=pull_request", "--bogus=1", `--base=${BASE_REF}`]);
  assert.equal(unknown.status, EXIT_REFUSED);
  assert.match(unknown.stderr, /--bogus/);

  for (const event of ["--event=push", "--event=", ""]) {
    const refused = runCli(event === "" ? [`--base=${BASE_REF}`] : [event, `--base=${BASE_REF}`]);
    assert.equal(refused.status, EXIT_REFUSED, event);
    assert.match(refused.stderr, /ci-changed: --event must be "pull_request" or "merge_group", got /);
    assert.match(refused.stderr, /--event=push was removed/);
  }
});

test("CLI: a missing base, or a bare 'origin/' prefix from an empty github.base_ref, is refused before git is asked", () => {
  const missing = runCli(["--event=merge_group"]);
  assert.equal(missing.status, EXIT_REFUSED);
  assert.match(missing.stderr, /--base=undefined is empty or a bare prefix/);
  const bare = runCli(["--event=merge_group", "--base=origin/"]);
  assert.equal(bare.status, EXIT_REFUSED);
  assert.match(bare.stderr, /--base="origin\/" is empty or a bare prefix/);
});

test("CLI: an empty diff is refused rather than reported as 'every job unnecessary'", () => {
  withGitSandbox((sandbox) => {
    trackFixtureRepo(sandbox);
    sandbox.commit("base");
    sandbox.run(["branch", BASE_REF]);
    const run = runCli(["--event=pull_request", `--base=${BASE_REF}`, `--repo=${sandbox.dir}`]);
    assert.equal(run.status, EXIT_REFUSED);
    assert.match(run.stderr, new RegExp(`changedFiles\\("${BASE_REF}\\.\\.\\.HEAD"\\) returned nothing`));
    assert.equal(run.stdout, "");
  });
});

test("CLI: a diff is classified and printed as key=value lines when not inside Actions; without --precise a published package's change is eager", () => {
  withGitSandbox((sandbox) => {
    branchEditing(sandbox, "packages/pub/notes.txt");
    const run = runCli(["--event=pull_request", `--base=${BASE_REF}`, `--repo=${sandbox.dir}`]);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout.trimEnd(), [
      "ts=true", "python=false", "ansible=false", "docs=false", "board=false", "changeset=true", "rulesFitness=false", "packages=pub",
    ].join("\n"));
  });
});

test("CLI: under Actions the outputs are APPENDED to $GITHUB_OUTPUT, not printed, for a merge_group event too", () => {
  withGitSandbox((sandbox) => {
    branchEditing(sandbox, "layers.json");
    const outFile = join(sandbox.dir, "github-output.txt");
    writeFileSync(outFile, "earlier=1\n");
    const run = runCli(["--event=merge_group", `--base=${BASE_REF}`, `--repo=${sandbox.dir}`], { GITHUB_OUTPUT: outFile });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, "");
    assert.equal(readFileSync(outFile, "utf8"), [
      "earlier=1", "ts=false", "python=false", "ansible=true", "docs=false", "board=false", "changeset=false", "rulesFitness=false", "packages=", "",
    ].join("\n"));
  });
});
