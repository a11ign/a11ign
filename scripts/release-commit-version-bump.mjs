#!/usr/bin/env node
// @ts-check
// command: commit changeset version's manifest bump and consumed changesets onto the version branch, never main
/**
 * #1824: `release:version` (`changeset version && pnpm install --lockfile-only`) leaves its result
 * uncommitted, and until it is committed somewhere every package's `package.json` stays behind the version
 * the registry holds -- so every later run recomputes the same already-published target from that stale base
 * and `changeset publish` silently no-ops every already-shipped package (run 35544379475, 2026-09-19).
 *
 * #3131: THIS NO LONGER PUSHES `main`. It used to, after a typed-confirmation publish, and `main`'s required
 * review (#2022) refuses a direct push. The commit now goes to `VERSION_BRANCH`, and `release.yml`'s
 * `version-pr` job opens (or updates) the ONE pull request from it, which merges through the queue like any
 * other. THAT merge is the release: the push it makes to `main` is the event `release.yml` publishes on.
 *
 * Runs right after `release:version` in the `version-pr` job, and finds its result sitting uncommitted in
 * this checkout's working tree: each package's bumped `package.json`, a regenerated `CHANGELOG.md` per
 * touched package, `pnpm-lock.yaml` (the lockfile-only install `release:version` itself runs), and the
 * consumed changeset markdown files already deleted from `.changeset`. This script's only job is to commit
 * exactly that diff and push it to the version branch.
 *
 * IT ADDS NO CHANGESET (#3161). `ci.yml`'s `changeset` job runs `changeset status --since` on every pull request
 * that changes a published package, and a version commit can never pass it on its own: `changeset version` consumes
 * the changesets and always ships `package.json` and `CHANGELOG.md`. #3131 first answered with ONE EMPTY CHANGESET
 * left in `.changeset/` after every release, a file whose only job was to satisfy a check. The job now skips its
 * enforcement step for `VERSION_BRANCH` itself instead (and for that pull request's queue entry), so the version
 * commit is exactly what `changeset version` made.
 *
 * FORCE-PUSHED, because nothing else writes the version branch and each run regenerates it from `main`'s
 * current tip: a fast-forward-only push would fail the second time `main` moved under an open version pull
 * request, which is the ordinary case.
 *
 * IDEMPOTENT, which is #1824's own done-when: a run with nothing pending (every changeset already
 * consumed by an earlier commit) finds no diff in the tracked paths and commits nothing.
 *
 * EXISTING PATHS ONLY, never a glob pathspec. A `package.json`/`CHANGELOG.md` pathspec written as a glob
 * (one `*` standing in for every package directory) refuses the WHOLE `git add` call with "did not match
 * any files" the moment even one package has never had a changeset applied and so has no `CHANGELOG.md`
 * yet -- measured against this repo today: no package does -- even though the sibling `package.json`
 * pathspec matches fine. Building the exact, existing path list in JS avoids the pathspec glob entirely
 * rather than working around what it does.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sandboxGitEnv } from "../packages/guards/src/git-env.mjs";
import { refuseUnknownFlags } from "../packages/worker-fleet/src/cli-flags.mjs";

const REPO = fileURLToPath(new URL("../", import.meta.url));

/** The one branch the version pull request is opened from; `release.yml` names it in its `--head`. */
export const VERSION_BRANCH = "release/version-packages";

/**
 * Every path `release:version` can have touched, filtered to what actually exists right now.
 * @param {string} repoRoot
 * @returns {string[]}
 */
export function versionBumpPaths(repoRoot) {
  const packagesDir = join(repoRoot, "packages");
  const perPackage = readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => [`packages/${entry.name}/package.json`, `packages/${entry.name}/CHANGELOG.md`]);
  // `.changeset` itself, not a glob inside it -- deleting every consumed changeset markdown file must be
  // staged too, and the directory always exists (it holds `config.json`/`README.md` even with nothing
  // pending).
  return [...perPackage, "package.json", "pnpm-lock.yaml", ".changeset"]
    .filter((path) => existsSync(join(repoRoot, path)));
}

// `sandboxGitEnv()`, not an inherited `env` -- git exports GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE into every
// hook environment, and this script's own commit step is exactly the kind of git-spawning code
// `git-env.mjs`'s header requires to strip through it rather than trust `cwd` alone.
/** @param {string[]} args @returns {string} */
function git(args) {
  return execFileSync("git", args, { cwd: REPO, encoding: "utf8", env: sandboxGitEnv() });
}

function main() {
  refuseUnknownFlags([], { entry: import.meta.url, command: "node scripts/release-commit-version-bump.mjs" });
  const paths = versionBumpPaths(REPO);
  const pending = git(["status", "--porcelain", "--", ...paths]).trim();
  if (pending === "") {
    console.log("release-commit-version-bump: nothing pending -- release:version left no diff in the tracked "
      + "paths, so nothing is committed. This is the property #1824's done-when names: a run with no "
      + "new changesets is a no-op here.");
    return;
  }
  console.log(`release-commit-version-bump: committing this version bump to ${VERSION_BRANCH}:\n${pending}`);
  git(["config", "user.name", "github-actions[bot]"]);
  git(["config", "user.email", "github-actions[bot]@users.noreply.github.com"]);
  git(["add", "-A", "--", ...paths]);
  const basedOn = git(["rev-parse", "--short", "HEAD"]).trim();
  git(["commit", "-m", `release: version packages (main at ${basedOn})`]);
  git(["push", "--force", "origin", `HEAD:refs/heads/${VERSION_BRANCH}`]);
  console.log(`release-commit-version-bump: pushed ${VERSION_BRANCH}.`);
}

// REALPATH'D, per `entry-points.test.ts` (#1086): reached through a symlink, the plain form skips main() and exits 0 silently.
if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
