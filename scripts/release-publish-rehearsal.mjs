#!/usr/bin/env node
// @ts-check
// command: rehearse the release's pnpm-to-npm publish hand-off for every published package, publishing nothing
/**
 * #2301: `release.yml`'s dry run used to stop at "packed", which said nothing about the one step this row
 * moved: the publish is now `pnpm publish`, which packs and then SHELLS OUT to `npm publish <tarball>`. Two
 * things can go wrong there that no earlier step sees, and both are quiet:
 *
 *   - `NPM_CONFIG_PROVENANCE` is a variable on the STEP, and whether it reaches the npm that signs depends on
 *     what pnpm passes down. Read off the workflow it looks right on any tool; the log has to say it arrived.
 *   - the hand-off itself (pnpm's pack, its `.npmrc` copy, the registry and access it passes on) can fail
 *     for a package in a way `npm pack` never exercised.
 *
 * So this runs `pnpm publish --dry-run` in each published package's directory, the exact command
 * `changeset publish` runs per package minus the upload, and prints what npm said. It REFUSES, before
 * spawning anything, unless the environment asks for provenance AND the npm this machine would use reports
 * the setting on -- the second reading is what makes it an observation of arrival rather than of the
 * variable. `npm publish --dry-run` stops before the registry, so it publishes nothing and cannot show the
 * signing itself: that happens only on a real publish, and this file does not pretend otherwise.
 *
 *   NPM_CONFIG_PROVENANCE=true node scripts/release-publish-rehearsal.mjs
 */
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { npmCliInvocation, pnpmCliInvocation } from "./npm-cli-executable.mjs";
import { publishedManifests } from "./manifest-repository-check.mjs";
import { refuseUnknownFlags } from "../packages/worker-fleet/src/cli-flags.mjs";

const REPO = fileURLToPath(new URL("../", import.meta.url));

/** What npm prints when `--dry-run` reached the point where it would have uploaded. */
export const DRY_RUN_MARKER = "(dry-run)";

/**
 * @param {{ command: string, args: string[] }} invocation
 * @param {string} cwd
 * @returns {{ status: number | null, output: string }}
 */
function runCaptured(invocation, cwd) {
  const result = spawnSync(invocation.command, invocation.args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

/**
 * The value npm itself reports for `provenance`, under this process's environment: the variable read by the
 * program that will act on it, not by this script.
 * @returns {string}
 */
export function npmReportsProvenance() {
  const { output } = runCaptured(npmCliInvocation("npm", ["config", "get", "provenance"]), REPO);
  return output.trim().split("\n").pop() ?? "";
}

/**
 * Why this rehearsal would prove nothing, or `null` when it can run.
 * @param {Record<string, string | undefined>} env
 * @param {string} reported what npm says `provenance` is
 * @returns {string | null}
 */
export function refusal(env, reported) {
  if (env.NPM_CONFIG_PROVENANCE !== "true") {
    return `NPM_CONFIG_PROVENANCE is ${JSON.stringify(env.NPM_CONFIG_PROVENANCE)}, not "true": this step exists to `
      + "show provenance requested, so a run without it would rehearse a publish the release does not make";
  }
  if (reported !== "true") return `npm reports provenance=${JSON.stringify(reported)} under this environment, so the request does not reach it`;
  return null;
}

function main() {
  refuseUnknownFlags([], { entry: import.meta.url, command: "node scripts/release-publish-rehearsal.mjs" });
  const reason = refusal(process.env, npmReportsProvenance());
  if (reason) {
    console.error(`release-publish-rehearsal: ${reason}`);
    process.exit(1);
  }
  const pnpmVersion = runCaptured(pnpmCliInvocation(["--version"]), REPO).output.trim();
  const npmVersion = runCaptured(npmCliInvocation("npm", ["--version"]), REPO).output.trim();
  console.log(`pnpm ${pnpmVersion} hands the tarball to npm ${npmVersion}; `
    + "npm reports provenance=true under this step's environment");
  const targets = publishedManifests(REPO);
  if (targets.length === 0) throw new Error("no published packages found -- the rehearsal would report success over nothing");
  let failed = 0;
  for (const { path, name } of targets) {
    const { status, output } = runCaptured(
      pnpmCliInvocation(["publish", "--dry-run", "--no-git-checks", "--access", "public"]), join(REPO, dirname(path)));
    const reached = status === 0 && output.includes(DRY_RUN_MARKER);
    if (!reached) failed += 1;
    console.log(`  ${reached ? "ok  " : "FAIL"}  ${name}  ${reached ? "npm reached its upload step (dry run, nothing sent)" : `exit ${status}\n${output}`}`);
  }
  console.log(`\n${targets.length - failed}/${targets.length} package(s) handed from pnpm to npm with provenance requested`);
  process.exit(failed ? 1 : 0);
}

// REALPATH'D, per `entry-points.test.ts` (#1086): reached through a symlink, the plain form skips main() and exits 0 silently.
if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
