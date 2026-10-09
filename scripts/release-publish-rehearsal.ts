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
 * So this runs `pnpm publish --dry-run --tag <the release's dist-tag>` in each published package's directory, the exact command
 * the release runs per package minus the upload, and prints what npm said. It REFUSES, before
 * spawning anything, unless the environment asks for provenance AND the npm this machine would use reports
 * the setting on -- the second reading is what makes it an observation of arrival rather than of the
 * variable. `npm publish --dry-run` stops before the registry, so it publishes nothing and cannot show the
 * signing itself: that happens only on a real publish, and this file does not pretend otherwise.
 *
 *   NPM_CONFIG_PROVENANCE=true node --import tsx scripts/release-publish-rehearsal.ts
 */
import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
// STAYS npm for the `npm` calls (`no-npm-spawn.test.ts` pins this file by name): trusted publishing is bound to npm's OIDC, and
// `pnpm publish` shells out to `npm publish`, so the rehearsal must read the npm the publish would use.
import { npmCliInvocation, pnpmCliInvocation } from "./npm-cli-executable.ts";
import { publishedManifests } from "./manifest-repository-check.ts";
import { refuseUnknownFlags } from "./cli-flags.ts";

const REPO = fileURLToPath(new URL("../", import.meta.url));

/** What npm prints when `--dry-run` reached the point where it would have uploaded. */
export const DRY_RUN_MARKER = "(dry-run)";

const RELEASE_WORKFLOW = join(REPO, ".github/workflows/release.yml");

/**
 * The dist-tag the release publishes with, read from the one place that spells it: the `release` JOB's `dist-tag:` input (#4009).
 * Without `--tag` npm applies `latest`, and npm 11 refuses that for a version below one already published (`main` is never written
 * by a release, so it is always below `next`): the rehearsal went red on a publish the release does not make.
 *
 * Scoped to the lines of `release:` (up to the next key at the jobs' indent), so another job's `dist-tag` input, now or later, is
 * neither mistaken for the release's nor makes the rehearsal refuse a valid file. No YAML parser: `yaml` is hoisted to the root
 * `node_modules` by `pnpm-workspace.yaml` and declared by no manifest this script could lean on.
 * @param {string} workflowText the text of `release.yml`; comment lines do not match, because the key must start the line
 * @returns {string}
 */
export function releaseDistTag(workflowText: string): string {
  const lines = workflowText.split("\n");
  const start = lines.findIndex((line) => /^ {2}release:\s*$/.test(line));
  if (start < 0) throw new Error("release.yml has no `release` job: the rehearsal cannot tell which dist-tag the release publishes with");
  const end = lines.findIndex((line, index) => index > start && /^ {2}[^\s#]/.test(line));
  const job = lines.slice(start + 1, end < 0 ? undefined : end);
  const tags = job.flatMap((line) => line.match(/^\s+dist-tag:\s*([\w.-]+)\s*$/)?.[1] ?? []);
  if (tags.length !== 1) throw new Error(`the \`release\` job must pass exactly one \`dist-tag:\`, found ${tags.length}: the rehearsal cannot tell which one the release publishes with`);
  return tags[0];
}

/**
 * @param {string} tag
 * @returns {string[]}
 */
export function publishArgs(tag: string): string[] {
  return ["publish", "--dry-run", "--no-git-checks", "--access", "public", "--tag", tag];
}

/**
 * @param {{ command: string, args: string[] }} invocation
 * @param {string} cwd
 * @returns {{ status: number | null, output: string }}
 */
function runCaptured(invocation: { command: string; args: string[]; }, cwd: string): { status: number | null; output: string; } {
  const result = spawnSync(invocation.command, invocation.args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

/**
 * The value npm itself reports for `provenance`, under this process's environment: the variable read by the
 * program that will act on it, not by this script.
 * @returns {string}
 */
export function npmReportsProvenance(): string {
  const { output } = runCaptured(npmCliInvocation("npm", ["config", "get", "provenance"]), REPO);
  return output.trim().split("\n").pop() ?? "";
}

/**
 * Why this rehearsal would prove nothing, or `null` when it can run.
 * @param {Record<string, string | undefined>} env
 * @param {string} reported what npm says `provenance` is
 * @returns {string | null}
 */
export function refusal(env: Record<string, string | undefined>, reported: string): string | null {
  if (env.NPM_CONFIG_PROVENANCE !== "true") {
    return `NPM_CONFIG_PROVENANCE is ${JSON.stringify(env.NPM_CONFIG_PROVENANCE)}, not "true": this step exists to `
      + "show provenance requested, so a run without it would rehearse a publish the release does not make";
  }
  if (reported !== "true") return `npm reports provenance=${JSON.stringify(reported)} under this environment, so the request does not reach it`;
  return null;
}

function main() {
  refuseUnknownFlags([], { entry: import.meta.url, command: "node --import tsx scripts/release-publish-rehearsal.ts" });
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
  const tag = releaseDistTag(readFileSync(RELEASE_WORKFLOW, "utf8"));
  console.log(`publishing with --tag ${tag}, the dist-tag release.yml's \`release\` call passes`);
  let failed = 0;
  for (const { path, name } of targets) {
    const { status, output } = runCaptured(pnpmCliInvocation(publishArgs(tag)), join(REPO, dirname(path)));
    const reached = status === 0 && output.includes(DRY_RUN_MARKER);
    if (!reached) failed += 1;
    console.log(`  ${reached ? "ok  " : "FAIL"}  ${name}  ${reached ? "npm reached its upload step (dry run, nothing sent)" : `exit ${status}\n${output}`}`);
  }
  console.log(`\n${targets.length - failed}/${targets.length} package(s) handed from pnpm to npm with provenance requested`);
  process.exit(failed ? 1 : 0);
}

// REALPATH'D, per `entry-points.test.ts` (#1086): reached through a symlink, the plain form skips main() and exits 0 silently.
if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
