// no-token: gh -- builds throwaway directories in a temp directory and reads which checkout of the tool `verify` would use; no `gh`, no network, no git command is run against a real worktree
/**
 * ADR 0045 cut (b) (#5459): `presentAgentOrg` ANSWERS WITH A CHECKOUT THAT IS ON DISK, OR NULL, AND MAKES NOTHING.
 *
 * `verify`'s host suite slot used to clone the tool into the git common dir and refuse when it could not. It now asks `presentAgentOrg`, so a machine with no tool answers
 * null and `verify` goes on to its product checks. Two things are pinned, each with its positive control in the same file:
 *
 * - a checkout that IS there is found, in `agentOrgSource`'s order (explicit `A11Y_AGENT_ORG_REPO`, then a sibling `../agent-org`, then the cache), so "always null" fails here;
 * - none there is null AND nothing is created (no cache directory, no `FETCH_HEAD`), so "clone when absent" fails here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sandboxGitEnv } from "./git-env.ts";
import { presentAgentOrg } from "../../../scripts/verify.ts";

/** `root/repo` (a real repository, so `--git-common-dir` answers) and nothing else: no sibling, no cache. */
function world() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "verify-present-agent-org-")));
  const repo = join(root, "repo");
  mkdirSync(repo);
  const init = spawnSync("git", ["init", "--initial-branch=main", repo], { encoding: "utf8", env: sandboxGitEnv() });
  assert.equal(init.status, 0, init.stderr);
  const checkout = (dir: string) => {
    mkdirSync(join(dir, ".git"), { recursive: true });
    return dir;
  };
  return { root, repo, sibling: join(root, "agent-org"), cache: join(repo, ".git", "verify-agent-org"), checkout };
}

test("no sibling, no cache and no A11Y_AGENT_ORG_REPO: null, and nothing is cloned, fetched or created", () => {
  const w = world();
  assert.equal(presentAgentOrg({ repo: w.repo, env: {} }), null);
  assert.equal(existsSync(w.cache), false, "a cache directory was made");
  assert.equal(existsSync(w.sibling), false, "a sibling was made");
  assert.equal(existsSync(join(w.repo, ".git", "FETCH_HEAD")), false, "something fetched");
});

test("a sibling ../agent-org that is a checkout is the answer (the positive control for the absent case)", () => {
  const w = world();
  w.checkout(w.sibling);
  assert.equal(presentAgentOrg({ repo: w.repo, env: {} }), w.sibling);
});

test("A11Y_AGENT_ORG_REPO naming a checkout wins over a sibling and over the cache", () => {
  const w = world();
  w.checkout(w.sibling);
  w.checkout(w.cache);
  const explicit = w.checkout(join(w.root, "elsewhere"));
  assert.equal(presentAgentOrg({ repo: w.repo, env: { A11Y_AGENT_ORG_REPO: explicit } }), explicit);
});

test("a cache that an earlier verify made is found when there is no sibling and no explicit path", () => {
  const w = world();
  w.checkout(w.cache);
  assert.equal(presentAgentOrg({ repo: w.repo, env: {} }), w.cache);
});

test("A11Y_AGENT_ORG_REPO naming a directory that is NOT a checkout is null, not a guess at another one and not a clone", () => {
  const w = world();
  w.checkout(w.sibling);
  const notACheckout = join(w.root, "empty");
  mkdirSync(notACheckout);
  assert.equal(presentAgentOrg({ repo: w.repo, env: { A11Y_AGENT_ORG_REPO: notACheckout } }), null);
  assert.equal(existsSync(w.cache), false, "a cache directory was made");
});
