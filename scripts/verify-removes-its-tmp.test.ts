// no-token: gh -- runs `scripts/verify.mjs`'s own steps in a child against throwaway repositories in a temp directory; no `gh`, no network, no real worktree of this repository is touched
/**
 * #3847 (incident #3846, 1a): `verify` REMOVES THE SCRATCH TREES IT MAKES ON EVERY EXIT A PROCESS CAN CHOOSE, A KILL BY SIGTERM OR SIGINT INCLUDED.
 *
 * `try/finally` runs on a return and a throw and not when the process is killed, so nine `/tmp/verify-*` trees stood on the agents host, three of them
 * git worktrees (`verify-agent-org-<id>/tree`) that a leak also leaves in the primary's `git worktree list`. SIGKILL cannot be handled by anyone: what
 * survives it is the janitor row's work, and this test does not claim otherwise.
 *
 * THE CHILD RUNS A REAL STEP, NOT A STAND-IN. `runAffectedSet` is the step that makes `verify-affected-*`, with its `run` replaced by one that announces
 * itself and never returns; `runAgentOrgStep` is the step that makes `verify-agent-org-*` and the worktree, run on throwaway repositories whose one tool test
 * announces itself and waits. Each child's `TMPDIR` is a directory of this test's own, so "no tree it made remains" is a read of that directory, and the
 * worktree half is a read of the throwaway author repository's `git worktree list`.
 *
 * POSITIVE CONTROLS, three: the same child run to completion also leaves nothing (the reading is of a directory a finished step empties, not of one nothing
 * ever fills), the kill is only sent once the child has announced that its scratch tree exists AND the test has READ it standing, and the static count
 * below finds exactly the one `mkdtempSync` the helper owns, so a new bare one cannot arrive unnoticed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sandboxGitEnv } from "../packages/guards/src/git-env.mjs";
import { removeInSmallCalls } from "./verify.mjs";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const VERIFY = join(REPO, "scripts/verify.mjs");
const FIXTURE = "packages/lab/src/packaging/board-document-chrome-resolver.test.ts";
const READY_WAIT_MS = 15_000;
const POLL_MS = 50;

type Mode = "affected" | "agentOrg" | "private";
type Tree = { dir: string; author: string; tool: string; tmp: string; home: string; ready: string; release: string };

// A CI runner has no `user.name`, so the commits of the throwaway repositories carry their own identity rather than the host's (the first push of this test failed there, "empty ident name").
const IDENTITY = { GIT_AUTHOR_NAME: "test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "test", GIT_COMMITTER_EMAIL: "test@example.invalid" };
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe", env: { ...sandboxGitEnv(), ...IDENTITY } }).trim();

const writeAll = (root: string, files: Record<string, string>) => {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
};

/** The tool's one test announces itself through `ready`, then waits for `release` (or gives up), so the suite is mid-step for as long as the test wants. */
function throwawayTree(): Tree {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "removes-its-tmp-test-")));
  const [author, origin, tool, tmp, home] = ["author", "origin", "tool", "tmp", "home"].map((name) => join(dir, name));
  const ready = join(dir, "ready");
  const release = join(dir, "release");
  for (const path of [author, origin, tmp, home]) mkdirSync(path);
  writeAll(author, { [FIXTURE]: 'import "agent-org/src/board-document.mjs";\n', "packages/lab/src/packaging/sibling.mjs": "", ".gitignore": "node_modules\n" });
  git(author, "init", "-q", "-b", "main"); git(author, "add", "."); git(author, "commit", "-q", "-m", "author");
  symlinkSync(realpathSync(join(REPO, "node_modules")), join(author, "node_modules"));
  writeAll(origin, {
    "src/wait.test.mjs": `import { existsSync, writeFileSync } from "node:fs";
import { test } from "node:test";
test("wait", async () => {
  writeFileSync(${JSON.stringify(ready)}, "1");
  for (let waited = 0; waited < 20_000 && !existsSync(${JSON.stringify(release)}); waited += 50) await new Promise((r) => setTimeout(r, 50));
});\n`,
  });
  git(origin, "init", "-q", "-b", "main"); git(origin, "add", "."); git(origin, "commit", "-q", "-m", "tool");
  git(dir, "clone", "-q", origin, tool);
  return { dir, author, tool, tmp, home, ready, release };
}

/** The child's whole program: a real step of verify.mjs, run where the test says. @param {Mode} mode */
function childProgram(mode: Mode, tree: Tree): string {
  const verify = JSON.stringify(pathToFileURL(VERIFY).href);
  if (mode === "private") {
    // What a suite's test leaves behind goes in the private directory with a child that REPORTS the TMPDIR it was given, so the control sees it inherited.
    return `const verify = await import(${verify});
const { writeFileSync, mkdirSync } = await import("node:fs");
const { spawnSync } = await import("node:child_process");
const dir = verify.privateRunTmp({ home: ${JSON.stringify(tree.home)} });
mkdirSync(dir + "/a-test-left-this/deep", { recursive: true });
writeFileSync(dir + "/a-test-left-this/deep/file", "x");
spawnSync(process.execPath, ["-e", "require('node:fs').writeFileSync(" + JSON.stringify(${JSON.stringify(tree.ready)}) + ", process.env.TMPDIR)"]);
if (process.env.TEST_RUNS_TO_COMPLETION !== "1") await new Promise(() => setInterval(() => {}, 1000));
`;
  }
  if (mode === "affected") {
    return `const verify = await import(${verify});
const hangs = async () => { (await import("node:fs")).writeFileSync(${JSON.stringify(tree.ready)}, "1"); await new Promise(() => setInterval(() => {}, 1000)); };
const run = process.env.TEST_RUNS_TO_COMPLETION === "1" ? async () => ({ status: 0 }) : hangs;
await verify.runAffectedSet({ base: "origin/main" }, run, () => ({ files: [] }));
`;
  }
  return `const verify = await import(${verify});
await verify.runAgentOrgStep({ repo: ${JSON.stringify(tree.author)}, toolRepo: ${JSON.stringify(tree.tool)}, ref: "main", copied: ["src"] });
`;
}

const settle = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function until(what: string, holds: () => boolean, evidence: () => string) {
  for (let waited = 0; waited < READY_WAIT_MS; waited += POLL_MS) {
    if (holds()) return;
    await settle(POLL_MS);
  }
  assert.fail(`${what} never happened in ${READY_WAIT_MS} ms\n${evidence()}`);
}

/** Runs the child in `tree`; resolves with how it ended once it has. `kill` is sent when the step is mid-way, and `null` lets it finish. */
async function runChild(mode: Mode, tree: Tree, kill: NodeJS.Signals | null) {
  // The mode travels in the environment: changed-files.mjs reads `process.argv[1]` as a path to its own entry, and `-e` makes an argument that.
  const env = { ...process.env, TMPDIR: tree.tmp, TEST_RUNS_TO_COMPLETION: kill === null ? "1" : "0" };
  delete env.NODE_TEST_CONTEXT; // the suite inside the clone would inherit it and refuse to start ("run() called recursively")
  if (kill === null) writeFileSync(tree.release, "1");
  const args = ["--input-type=module", "-e", childProgram(mode, tree)];
  const child = spawn(process.execPath, args, { cwd: REPO, env, stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const ended = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((done) => child.on("close", (code, signal) => done({ code, signal })));
  if (kill === null) return { ...(await ended), stderr, before: [] as string[], standing: [] as string[] };
  await until(`the ${mode} step reaching its wait`, () => existsSync(tree.ready), () => stderr);
  const before = readdirSync(mode === "private" ? privateRoot(tree) : tree.tmp);
  const standing = worktreesOf(tree);
  child.kill(kill);
  const result = await ended;
  return { ...result, stderr, before, standing };
}

const privateRoot = (tree: Tree) => join(tree.home, ".cache/a11ign/tmp");
const leftIn = (tree: Tree) => readdirSync(tree.tmp);
const worktreesOf = (tree: Tree) => git(tree.author, "worktree", "list").split("\n");

for (const mode of ["affected", "agentOrg"] as const) {
  const prefix = mode === "affected" ? "verify-affected-" : "verify-agent-org-";

  test(`${mode}: the step run to completion leaves no scratch tree and no worktree entry (the positive control)`, async () => {
    const tree = throwawayTree();
    try {
      await runChild(mode, tree, null);
      assert.deepEqual(leftIn(tree), []);
      assert.equal(worktreesOf(tree).length, 1, worktreesOf(tree).join("\n"));
    } finally {
      rmSync(tree.dir, { recursive: true, force: true });
    }
  });

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    test(`${mode}: a ${signal} in the middle of the step removes the tree it made and its worktree registration`, async () => {
      const tree = throwawayTree();
      try {
        const { before, standing, stderr } = await runChild(mode, tree, signal);
        assert.ok(before.some((name) => name.startsWith(prefix)), `the control did not see ${prefix}* standing before the kill: ${before.join(", ")}\n${stderr}`);
        if (mode === "agentOrg") assert.equal(standing.length, 2, `the control did not see the clone registered before the kill:\n${standing.join("\n")}`);
        assert.deepEqual(leftIn(tree), [], `${signal} left scratch behind in ${tree.tmp}\n${stderr}`);
        assert.equal(worktreesOf(tree).length, 1, `${signal} left a worktree registration:\n${worktreesOf(tree).join("\n")}`);
      } finally {
        rmSync(tree.dir, { recursive: true, force: true });
      }
    });
  }
}

test("every mkdtempSync in verify.mjs is the one inside the scratch helper, so no tree is made outside the cleanup", () => {
  const source = readFileSync(VERIFY, "utf8");
  const sites = [...source.matchAll(/\bmkdtempSync\(/g)].map((match) => match.index ?? -1);
  const helper = /^export function makeScratch\b[\s\S]*?^}/m.exec(source);
  assert.ok(helper, "verify.mjs has no `export function makeScratch`, the helper this test names");
  const start = helper.index;
  const end = start + helper[0].length;
  assert.ok(sites.length > 0, "verify.mjs has no mkdtempSync at all, so the count below would pass on nothing");
  const outside = sites.filter((at) => at < start || at > end);
  assert.deepEqual(outside, [], `a mkdtempSync outside makeScratch, at offsets ${outside.join(", ")}`);
  assert.equal(sites.length - outside.length, 1, "the helper's own mkdtempSync is the positive control, and there must be exactly one");
});

// THE PRIVATE RUN DIRECTORY (chairman's correction on #3846): verify's TMPDIR for itself and what it spawns, removed on every exit, in small calls.
for (const signal of [null, "SIGTERM", "SIGINT"] as const) {
  test(`private TMPDIR: ${signal ?? "a run to completion"} leaves nothing under ~/.cache/a11ign/tmp, and a spawned child was given it${signal ? "" : " (the positive control)"}`, async () => {
    const tree = throwawayTree();
    try {
      const { before, stderr } = await runChild("private", tree, signal);
      if (signal) assert.ok(before.some((name) => name.startsWith("run-")), `no run-* directory stood before the kill: ${before.join(", ")}\n${stderr}`);
      const given = readFileSync(tree.ready, "utf8");
      assert.ok(given.startsWith(`${privateRoot(tree)}/run-`), `the spawned child's TMPDIR was ${given}`);
      assert.deepEqual(readdirSync(privateRoot(tree)), [], `${signal} left a run directory\n${stderr}`);
      assert.deepEqual(leftIn(tree), [], "something was made in the shared temp directory instead of the private one");
    } finally {
      rmSync(tree.dir, { recursive: true, force: true });
    }
  });
}

test("removeInSmallCalls refuses an empty name, and removes a tree one entry at a time, itself last", () => {
  assert.throws(() => removeInSmallCalls(""), /refusing an empty directory name/);
  const dir = mkdtempSync(join(tmpdir(), "removes-its-tmp-small-"));
  try {
    for (const name of ["a", "b", "c"]) writeAll(dir, { [`${name}/inner/file`]: "x" });
    removeInSmallCalls(dir);
    assert.ok(!existsSync(dir), "the directory was left standing");
    removeInSmallCalls(dir); // already gone: not an error, since the signal handler and the `exit` handler both run it
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("main takes the private TMPDIR after the slot and before any step, and verify.mjs has one place that sets TMPDIR", () => {
  const source = readFileSync(VERIFY, "utf8");
  const main = /^async function main\(\) \{[\s\S]*?^}/m.exec(source)?.[0] ?? "";
  assert.ok(main.length > 0, "verify.mjs has no `async function main`");
  const slot = main.indexOf("underTheHostsSlot()");
  const taken = main.indexOf("privateRunTmp()");
  assert.ok(slot >= 0 && taken > slot, "main must call privateRunTmp() after underTheHostsSlot(), so only the process that does the work makes one");
  assert.ok(taken < main.indexOf("runAllSteps("), "main must call privateRunTmp() before its steps");
  assert.equal(source.match(/process\.env\.TMPDIR\s*=/g)?.length, 1);
});
