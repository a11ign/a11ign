// no-token: gh -- drives `provisionAgentOrg` against throwaway repositories in a temp directory with a bare repository on disk as "origin"; its only `gh` call is the clone path, which every case here avoids by making the cache first, and nothing reaches the network
/**
 * #3931: `verify` BRINGS THE AGENT-ORG CLONE IT MADE TO `origin/main`, AND TOUCHES NO OTHER CHECKOUT.
 *
 * The clone is made once and was never updated, so it aged until `verify` required a module newer than it (`suite-slots.mjs`, #3536) and refused for every session
 * sharing it (#3928's reviewer died without a verdict). The refresh is for THAT clone only: `A11Y_AGENT_ORG_REPO` and a sibling `../agent-org` are the caller's.
 *
 * REAL `git`, NO FAKE: origin is a bare repository, the clones are real, and every reading is of a ref or a file on disk. "No fetch ran" is read as the remote-tracking ref
 * not having moved and `FETCH_HEAD` not existing, since a fetch writes both.
 *
 * POSITIVE CONTROLS: the refresh test finds the new file ONLY in a clone that was refreshed (the file is absent beforehand, asserted), and the other tests start from a
 * clone that IS behind origin, so "unchanged" is a reading of a checkout that WOULD have moved had anything fetched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sandboxGitEnv } from "../packages/guards/src/git-env.ts";
import { agentOrgSource, provisionAgentOrg } from "./verify.ts";

type Say = { out: string[]; err: string[] };

const git = (cwd: string, ...args: string[]) => {
  const run = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.test", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8", env: sandboxGitEnv() });
  assert.equal(run.status, 0, `git ${args.join(" ")} in ${cwd}: ${run.stderr}`);
  return run.stdout.trim();
};

const head = (dir: string) => git(dir, "rev-parse", "HEAD");
const trackingRef = (dir: string) => git(dir, "rev-parse", "refs/remotes/origin/main");

/** `root/origin.git` (bare, one commit) and `root/repo` (the repository `verify` runs in), with `root/agent-org` NOT yet made so a sibling is only there when a test puts it there. */
function world() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "verify-agent-org-cache-")));
  const origin = join(root, "origin.git");
  const seed = join(root, "seed");
  const repo = join(root, "repo");
  git(root, "init", "--bare", "--initial-branch=main", origin);
  mkdirSync(seed);
  git(seed, "init", "--initial-branch=main");
  git(seed, "remote", "add", "origin", origin);
  writeFileSync(join(seed, "old.mjs"), "export {};\n");
  git(seed, "add", ".");
  git(seed, "commit", "-m", "the commit the clones start at");
  git(seed, "push", "origin", "main");
  mkdirSync(repo);
  git(repo, "init", "--initial-branch=main");
  const cache = join(repo, ".git", "verify-agent-org");
  const say: Say = { out: [], err: [] };
  const sayInto = { out: (line: string) => say.out.push(line), err: (line: string) => say.err.push(line) };
  return { root, origin, seed, repo, cache, say, sayInto, clone: (into: string) => git(root, "clone", origin, into) };
}

type World = ReturnType<typeof world>;

/** Origin gains `src/suite-slots.mjs`, the way a module `verify` requires lands after a clone was made. */
function originAdvances(w: World) {
  mkdirSync(join(w.seed, "src"), { recursive: true });
  writeFileSync(join(w.seed, "src", "suite-slots.mjs"), "export {};\n");
  git(w.seed, "add", ".");
  git(w.seed, "commit", "-m", "adds a module verify requires");
  git(w.seed, "push", "origin", "main");
  return git(w.seed, "rev-parse", "HEAD");
}

const provision = (w: World, env: Record<string, string | undefined> = {}) => provisionAgentOrg({ repo: w.repo, env, say: w.sayInto });
const cleanUp = (w: World) => rmSync(w.root, { recursive: true, force: true });

test("a cache clone one commit behind origin is at origin's commit after provisioning, and has the module origin added", () => {
  const w = world();
  try {
    w.clone(w.cache);
    const newest = originAdvances(w);
    assert.notEqual(head(w.cache), newest, "the control: the clone starts behind");
    assert.ok(!existsSync(join(w.cache, "src", "suite-slots.mjs")), "the control: the module is absent before the refresh");

    assert.equal(provision(w), w.cache);

    assert.equal(head(w.cache), newest);
    assert.ok(existsSync(join(w.cache, "src", "suite-slots.mjs")));
    assert.deepEqual(w.say.err, [], "a refresh that worked says nothing");
  } finally {
    cleanUp(w);
  }
});

test("an A11Y_AGENT_ORG_REPO checkout is never fetched or moved", () => {
  const w = world();
  try {
    const explicit = join(w.root, "explicit-checkout");
    w.clone(explicit);
    const [headBefore, trackingBefore] = [head(explicit), trackingRef(explicit)];
    originAdvances(w);

    assert.equal(provision(w, { A11Y_AGENT_ORG_REPO: explicit }), explicit);

    assert.equal(head(explicit), headBefore);
    assert.equal(trackingRef(explicit), trackingBefore, "a fetch would have moved origin/main");
    assert.ok(!existsSync(join(explicit, ".git", "FETCH_HEAD")), "no fetch ran");
  } finally {
    cleanUp(w);
  }
});

test("a sibling ../agent-org is never fetched or moved, and it wins over a stale cache that is left alone too", () => {
  const w = world();
  try {
    const sibling = join(w.root, "agent-org");
    w.clone(sibling);
    w.clone(w.cache);
    const [siblingBefore, cacheBefore] = [head(sibling), head(w.cache)];
    originAdvances(w);

    assert.equal(provision(w), sibling);

    assert.equal(head(sibling), siblingBefore);
    assert.equal(head(w.cache), cacheBefore, "the cache is not the source, so it is not refreshed either");
    for (const checkout of [sibling, w.cache]) assert.ok(!existsSync(join(checkout, ".git", "FETCH_HEAD")), `no fetch ran in ${checkout}`);
  } finally {
    cleanUp(w);
  }
});

test("an unreachable origin leaves the clone as it was, says so, and still returns it", () => {
  const w = world();
  try {
    w.clone(w.cache);
    originAdvances(w);
    const before = head(w.cache);
    git(w.cache, "remote", "set-url", "origin", join(w.root, "no-such-origin.git"));

    assert.equal(provision(w), w.cache);

    assert.equal(head(w.cache), before);
    assert.equal(w.say.err.length, 1);
    assert.match(w.say.err[0], /could not fetch/);
    assert.ok(w.say.err[0].includes(w.cache), "it names the clone it is using");
  } finally {
    cleanUp(w);
  }
});

test("a diverged clone is refused, naming its directory, and is not moved", () => {
  const w = world();
  try {
    w.clone(w.cache);
    writeFileSync(join(w.cache, "local-only.mjs"), "export {};\n");
    git(w.cache, "add", ".");
    git(w.cache, "commit", "-m", "a commit origin never had");
    const before = head(w.cache);
    originAdvances(w);

    assert.equal(provision(w), null);

    assert.equal(head(w.cache), before);
    assert.equal(w.say.err.length, 1);
    assert.ok(w.say.err[0].includes(w.cache), `the refusal names ${w.cache}: ${w.say.err[0]}`);
    assert.match(w.say.err[0], /fast-forward/);
  } finally {
    cleanUp(w);
  }
});

test("agentOrgSource marks for refresh the cache that already existed, and no other source", () => {
  const checkouts = new Set(["/sibling", "/cache"]);
  const isCheckout = (dir: string) => checkouts.has(dir);
  const where = { sibling: "/sibling", cache: "/cache", isCheckout };
  assert.deepEqual(agentOrgSource({ ...where, env: { A11Y_AGENT_ORG_REPO: "/explicit" } }), { dir: "/explicit", clone: false, refresh: false });
  assert.deepEqual(agentOrgSource({ ...where, env: {} }), { dir: "/sibling", clone: false, refresh: false });
  checkouts.delete("/sibling");
  assert.deepEqual(agentOrgSource({ ...where, env: {} }), { dir: "/cache", clone: false, refresh: true });
  checkouts.delete("/cache");
  assert.deepEqual(agentOrgSource({ ...where, env: {} }), { dir: "/cache", clone: true, refresh: false }, "a clone made this run is current, so it is not refreshed");
});
