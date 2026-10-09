/**
 * `scripts/prune-stale-workspace-scope.ts` (#376): after a workspace scope rename `npm install` ADDS the new scope's `node_modules` symlinks and never removes the
 * old one, so a leftover `@old/*` import keeps working on that machine and fails only on a fresh clone. This removes the old scope, and must NEVER fail an install.
 *
 * What is pinned, against fixture trees (the script's repo root is a parameter, and its CLI derives it from its own location, so the CLI runs as a COPY inside a fixture):
 *   1. `currentWorkspaceScope` is the scope of the first SCOPED `packages/*\/package.json`; an unscoped package, an unparseable manifest, a plain file and a missing
 *      `packages/` are skipped, and with nothing scoped the answer is `undefined` rather than a guess.
 *   2. A STALE scope is found STRUCTURALLY: a `node_modules/@*` directory with at least one member that is a symlink resolving into this repo's `packages/`, and whose name is
 *      not the current scope. An ordinary scoped dependency (real directories, or links elsewhere) and the current scope are NOT stale. It also holds when `node_modules` is
 *      itself a link to a primary checkout's (a worktree), where members resolve into the PRIMARY's `packages/`.
 *   3. `pruneStaleWorkspaceScopes` removes exactly the stale scopes and logs each; with no derivable scope it logs and removes nothing; a failed removal is REPORTED with the
 *      by-hand command and does not throw, nor stop the next removal.
 *
 * THE POSITIVE CONTROLS: every "not stale" scope sits in a fixture that also holds a stale one, and every `[]` is asked of the same tree after the stale scope is removed
 * or against an unrelated current scope that makes the same directory stale.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, readdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const TSX = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SCRIPT = join(REPO_ROOT, "scripts/prune-stale-workspace-scope.ts");
const { currentWorkspaceScope, staleWorkspaceScopes, pruneStaleWorkspaceScopes } = await import("../../../scripts/prune-stale-workspace-scope.ts");

function writeManifest(repo: string, dir: string, manifest: object | string): void {
  mkdirSync(join(repo, "packages", dir), { recursive: true });
  writeFileSync(join(repo, "packages", dir, "package.json"), typeof manifest === "string" ? manifest : JSON.stringify(manifest));
}

/** Link `node_modules/<scope>/<member>` to `packages/<member>` of `owner`. */
function linkMember(repo: string, owner: string, scope: string, member: string): void {
  mkdirSync(join(repo, "node_modules", scope), { recursive: true });
  symlinkSync(join(owner, "packages", member), join(repo, "node_modules", scope, member));
}

/**
 * A repo whose packages are scoped `@current`, with `node_modules` holding: the current scope (linked), a STALE `@old` (linked), an ordinary `@types`
 * dependency (a real directory) and `@elsewhere` (a link pointing outside `packages/`).
 */
function withRepo(body: (repo: string) => void): void {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "prune-scope-test-")));
  try {
    writeManifest(repo, "alpha", { name: "@current/alpha" });
    linkMember(repo, repo, "@current", "alpha");
    linkMember(repo, repo, "@old", "alpha");
    mkdirSync(join(repo, "node_modules/@types/node"), { recursive: true });
    mkdirSync(join(repo, "node_modules/@elsewhere"), { recursive: true });
    mkdirSync(join(repo, "outside"));
    symlinkSync(join(repo, "outside"), join(repo, "node_modules/@elsewhere/lib"));
    body(repo);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

test("currentWorkspaceScope is the scope of the first scoped package.json under packages/", () => {
  withRepo((repo) => assert.equal(currentWorkspaceScope({ repo }), "@current"));
});

test("currentWorkspaceScope skips unscoped, unparseable and non-directory entries, and is undefined with nothing scoped", () => {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "prune-scope-test-")));
  try {
    assert.equal(currentWorkspaceScope({ repo }), undefined, "no packages/ at all");
    writeManifest(repo, "a-unscoped", { name: "plain-name" });
    writeManifest(repo, "b-broken", "{ not json");
    writeManifest(repo, "c-nameless", {});
    writeManifest(repo, "d-numeric", { name: 7 });
    writeFileSync(join(repo, "packages/e-file.txt"), "not a directory");
    mkdirSync(join(repo, "packages/f-empty"));
    assert.equal(currentWorkspaceScope({ repo }), undefined);
    writeManifest(repo, "g-scoped", { name: "@later/pkg" });
    assert.equal(currentWorkspaceScope({ repo }), "@later", "positive control: a scoped package after the skipped ones is found");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("currentWorkspaceScope uses the injected reader and takes the scope part of the name only", () => {
  const entries = [{ name: "x", isDirectory: () => true }];
  const reads: string[] = [];
  const scope = currentWorkspaceScope({
    repo: "/virtual",
    readdir: () => entries,
    readFile: (path: string) => { reads.push(path); return JSON.stringify({ name: "@virtual/deep/er" }); },
  });
  assert.equal(scope, "@virtual");
  assert.deepEqual(reads, [join("/virtual", "packages", "x", "package.json")]);
});

test("staleWorkspaceScopes names the old linked scope, and not the current, ordinary or outside-linking ones", () => {
  withRepo((repo) => {
    assert.deepEqual(staleWorkspaceScopes({ repo }), ["@old"]);
  });
});

test("the same directory is not stale when it IS the current scope, and a different current scope makes the others stale", () => {
  withRepo((repo) => {
    assert.deepEqual(staleWorkspaceScopes({ repo, currentScope: "@old" }), ["@current"]);
    assert.deepEqual(staleWorkspaceScopes({ repo, currentScope: "@current" }), ["@old"]);
  });
});

test("with no current scope, no node_modules, or an unreadable node_modules there is nothing to prune", () => {
  withRepo((repo) => {
    rmSync(join(repo, "packages"), { recursive: true });
    assert.deepEqual(staleWorkspaceScopes({ repo }), [], "no scope can be derived, so nothing is called stale");
    assert.deepEqual(staleWorkspaceScopes({ repo: join(repo, "nowhere") }), []);
    assert.deepEqual(staleWorkspaceScopes({ repo, currentScope: "@current", realpath: () => { throw new Error("EIO"); } }), [], "an unresolvable node_modules");
  });
});

test("a scope directory whose members cannot be listed or lstat'd is not a workspace scope", () => {
  withRepo((repo) => {
    const failingLstat = () => { throw new Error("EACCES"); };
    assert.deepEqual(staleWorkspaceScopes({ repo, lstat: failingLstat }), []);
    let calls = 0;
    const flakyReaddir = (path: string, options: object) => {
      calls += 1;
      if (calls > 1) throw new Error("EACCES");
      return (readdirSync as (p: string, o: object) => unknown[])(path, options);
    };
    assert.deepEqual(staleWorkspaceScopes({ repo, readdir: flakyReaddir }), []);
  });
});

test("from a worktree whose node_modules links to the PRIMARY checkout's, members resolving into the primary's packages/ are still found", () => {
  const primary = realpathSync(mkdtempSync(join(tmpdir(), "prune-scope-primary-")));
  const worktree = realpathSync(mkdtempSync(join(tmpdir(), "prune-scope-worktree-")));
  try {
    writeManifest(primary, "alpha", { name: "@current/alpha" });
    linkMember(primary, primary, "@current", "alpha");
    linkMember(primary, primary, "@old", "alpha");
    writeManifest(worktree, "alpha", { name: "@current/alpha" });
    symlinkSync(join(primary, "node_modules"), join(worktree, "node_modules"));
    assert.deepEqual(staleWorkspaceScopes({ repo: worktree }), ["@old"]);
  } finally {
    rmSync(primary, { recursive: true, force: true });
    rmSync(worktree, { recursive: true, force: true });
  }
});

test("pruneStaleWorkspaceScopes removes the stale scope, logs it, and leaves every other scope alone", () => {
  withRepo((repo) => {
    const log: string[] = [];
    pruneStaleWorkspaceScopes({ repo, log: (line: string) => log.push(line) });
    assert.deepEqual(log, ["  removed stale workspace scope node_modules/@old (current scope is @current)"]);
    assert.equal(existsSync(join(repo, "node_modules/@old")), false);
    for (const kept of ["@current/alpha", "@types/node", "@elsewhere/lib"]) {
      assert.ok(existsSync(join(repo, "node_modules", kept)), kept);
    }
    assert.equal(existsSync(join(repo, "packages/alpha/package.json")), true, "removing a link must not reach through it into packages/");
    const again: string[] = [];
    pruneStaleWorkspaceScopes({ repo, log: (line: string) => again.push(line) });
    assert.deepEqual(again, [], "a second run has nothing to remove and logs nothing");
  });
});

test("pruneStaleWorkspaceScopes with no derivable scope logs why and removes nothing", () => {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "prune-scope-test-")));
  try {
    const log: string[] = [];
    const removed: string[] = [];
    pruneStaleWorkspaceScopes({ repo, log: (line: string) => log.push(line), remove: (path: string) => removed.push(path) });
    assert.deepEqual(log, ["  workspace scope prune: no scoped workspace package.json found -- nothing to derive the current scope from."]);
    assert.deepEqual(removed, []);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("a removal that fails is reported with the by-hand command, does not throw, and does not stop the next one", () => {
  withRepo((repo) => {
    linkMember(repo, repo, "@older", "alpha");
    const log: string[] = [];
    const attempted: string[] = [];
    const remove = (path: string) => {
      attempted.push(path);
      if (path.endsWith("@old")) throw new Error("EPERM: operation not permitted");
    };
    assert.doesNotThrow(() => pruneStaleWorkspaceScopes({ repo, log: (line: string) => log.push(line), remove }));
    assert.deepEqual(attempted, [join(repo, "node_modules/@old"), join(repo, "node_modules/@older")]);
    assert.deepEqual(log, [
      "  could not remove stale workspace scope node_modules/@old: EPERM: operation not permitted -- remove it by hand: rm -rf node_modules/@old",
      "  removed stale workspace scope node_modules/@older (current scope is @current)",
    ]);
  });
});

test("CLI (a copy inside a fixture, never the real node_modules): prunes the stale scope and prints what it removed; an unknown flag is refused", () => {
  withRepo((repo) => {
    mkdirSync(join(repo, "scripts"));
    copyFileSync(SCRIPT, join(repo, "scripts/prune-stale-workspace-scope.ts"));
    copyFileSync(join(REPO_ROOT, "scripts/cli-flags.mjs"), join(repo, "scripts/cli-flags.mjs"));
    const copy = join(repo, "scripts/prune-stale-workspace-scope.ts");

    const refused = spawnSync(process.execPath, ["--import", TSX, copy, "--force"], { cwd: repo, encoding: "utf8" });
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /unknown flag --force/);
    assert.equal(existsSync(join(repo, "node_modules/@old")), true, "a refused run removes nothing");

    const result = spawnSync(process.execPath, ["--import", TSX, copy], { cwd: repo, encoding: "utf8" });
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "  removed stale workspace scope node_modules/@old (current scope is @current)\n");
    assert.equal(existsSync(join(repo, "node_modules/@old")), false);
    assert.equal(existsSync(join(repo, "node_modules/@current/alpha")), true);
  });
});

test("the real script, asked only to LIST against this checkout, derives a scope that exists in its own packages", () => {
  // Read-only: `staleWorkspaceScopes` and `currentWorkspaceScope` never remove anything. `pruneStaleWorkspaceScopes` is never called on the real tree.
  const scope = currentWorkspaceScope({ repo: REPO_ROOT });
  assert.match(scope ?? "", /^@[^/]+$/);
  assert.equal(staleWorkspaceScopes({ repo: REPO_ROOT, currentScope: scope }).includes(scope), false, "the current scope is never stale");
});
