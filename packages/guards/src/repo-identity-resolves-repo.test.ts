// no-token: none -- runs `git init`/`git remote add` in a temp directory and `node` on repo-identity.ts; no network, no `gh`
/**
 * ADR 0045 cut (b) (#5459): `REPO` IS WHAT `gh` RESOLVES, NOT A DECLARATION READ FROM THE ORG TOOL.
 *
 * Every operational call in the product scripts passes `REPO` to `gh`/git, so a resolver that answered a wrong but valid `owner/name` would send them all to another
 * repository without failing anything. Each outcome of `resolveRepo` is therefore asserted by value: the runner variable wins, the `origin` remote answers when it is unset or
 * malformed, and neither naming a repository REFUSES (a fallback literal would answer for a checkout that is not this project's, which is what #2616 closed).
 * The last test loads the real module in a child process with only `$GITHUB_REPOSITORY` set, because `REPO` is bound at import time.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { originRemote, resolveRepo } from "../../../scripts/repo-identity.ts";
import { sandboxGitEnv } from "./git-env.ts";

const NO_REMOTE = () => {
  throw new Error("no origin");
};
const remoteOf = (url: string) => () => url;

test("resolveRepo: `$GITHUB_REPOSITORY` wins over the origin remote", () => {
  assert.equal(resolveRepo({ GITHUB_REPOSITORY: "some-org/some-repo" }, remoteOf("https://github.com/other/thing.git")), "some-org/some-repo");
});

test("resolveRepo: with no runner variable the origin remote names the repository, https and ssh, with or without `.git`", () => {
  assert.equal(resolveRepo({}, remoteOf("https://github.com/a11ign/a11ign.git")), "a11ign/a11ign");
  assert.equal(resolveRepo({}, remoteOf("https://github.com/a11ign/a11ign")), "a11ign/a11ign");
  assert.equal(resolveRepo({}, remoteOf("git@github.com:some-org/some.repo.git")), "some-org/some.repo");
});

test("resolveRepo: a runner variable that is not owner/name is ignored in favour of the remote", () => {
  assert.equal(resolveRepo({ GITHUB_REPOSITORY: "not-a-repo" }, remoteOf("https://github.com/a11ign/a11ign.git")), "a11ign/a11ign");
  assert.equal(resolveRepo({ GITHUB_REPOSITORY: "   " }, remoteOf("https://github.com/a11ign/a11ign.git")), "a11ign/a11ign");
});

test("resolveRepo REFUSES when neither names a repository", () => {
  assert.throws(() => resolveRepo({}, NO_REMOTE), /no origin/);
  assert.throws(() => resolveRepo({}, remoteOf("https://gitlab.com/some-org/some-repo.git")), /not a github\.com repository/);
  assert.throws(() => resolveRepo({ GITHUB_REPOSITORY: "bad" }, remoteOf("")), /not a github\.com repository/);
});

test("originRemote reads the origin of the checkout it is given and throws, naming why, when there is none", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "repo-identity-")));
  try {
    const run = (...args: string[]) => execFileSync("git", args, { cwd: dir, env: sandboxGitEnv(), stdio: "ignore" });
    run("init", "-q");
    assert.throws(() => originRemote(dir), /no `origin` remote to read/);
    run("remote", "add", "origin", "https://github.com/some-org/some-repo.git");
    assert.equal(originRemote(dir), "https://github.com/some-org/some-repo.git");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the exported REPO is the runner variable when one is set (the module, loaded fresh)", () => {
  const module = pathToFileURL(resolve(import.meta.dirname, "../../../scripts/repo-identity.ts")).href;
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", `import { REPO, REPO_URL } from ${JSON.stringify(module)}; console.log(JSON.stringify([REPO, REPO_URL]));`], {
    env: { ...sandboxGitEnv(), GITHUB_REPOSITORY: "some-org/some-repo" },
    encoding: "utf8",
  });
  assert.deepEqual(JSON.parse(out), ["some-org/some-repo", "https://github.com/some-org/some-repo"]);
});
