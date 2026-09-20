#!/usr/bin/env node
// @ts-check
// command: commit changeset version's manifest bump and consumed changesets back to main after a real publish
/**
 * #1824: `release:version` (`changeset version && npm install --package-lock-only`) runs INSIDE the release
 * job and nothing commits the result -- so every package's `package.json` stayed at `0.0.0` through the
 * first real publish (run 35544379475, 2026-09-19), and every later dispatch recomputes the same
 * already-published target version from that same stale base. npm refuses to republish an identical
 * version, so `changeset publish` silently no-ops every already-shipped package.
 *
 * Runs AFTER `npx changeset publish` succeeds -- `release.yml` gives this step the identical `if:` the
 * Publish step itself carries. `release:version` already ran earlier in the same job (the "Apply the
 * pending changesets" step) and left its result sitting uncommitted in this checkout's working tree: each
 * package's bumped `package.json`, a regenerated `CHANGELOG.md` per touched package, `package-lock.json`
 * (the workspaces reinstall `release:version` itself runs), and the consumed changeset markdown files
 * already deleted from `.changeset`. This step's only job is to commit exactly that diff back to `main`.
 *
 * IDEMPOTENT, which is #1824's own done-when: a run with nothing pending (every changeset already
 * consumed by an earlier commit) finds no diff in the tracked paths and commits nothing -- so a second real
 * dispatch with no new changesets reports nothing pending to bump.
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
  return [...perPackage, "package.json", "package-lock.json", ".changeset"]
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
      + "paths, so nothing is committed. This is the property #1824's done-when names: a real dispatch with "
      + "no new changesets is a no-op here.");
    return;
  }
  console.log(`release-commit-version-bump: committing this version bump back to main:\n${pending}`);
  git(["config", "user.name", "github-actions[bot]"]);
  git(["config", "user.email", "github-actions[bot]@users.noreply.github.com"]);
  git(["add", "-A", "--", ...paths]);
  const publishedAt = git(["rev-parse", "--short", "HEAD"]).trim();
  git(["commit", "-m", `release: apply version bump published at ${publishedAt}`]);
  git(["push", "origin", "HEAD:main"]);
  console.log("release-commit-version-bump: pushed.");
}

// REALPATH'D, per `entry-points.test.ts` (#1086): reached through a symlink, the plain form skips main() and exits 0 silently.
if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
