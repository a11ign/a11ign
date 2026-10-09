#!/usr/bin/env tsx
// command: decide whether `consumer-gate.yml`'s pin must be regenerated at a commit, and whether a release run is owed after the repair (#4331)
//
// THE QUESTION `.github/workflows/consumer-gate-pin.yml` ASKS ON EVERY PUSH TO `main` THAT TOUCHES `action.yml` OR `consumer-gate.yml`.
//
// A pull request that changes `action.yml` can never carry a pin containing its own change, because that commit does not exist until it
// merges (#558, #4153). So every such merge leaves the pin stale the instant it lands, and eleven rows were filed by hand to repair it. The
// repair is mechanical (`node scripts/generate-consumer-gate.ts` at the new tip), so the merge starts it: this file is the decision, and the
// workflow is the actor.
//
// THE DECISION IS A PURE READING OF ONE COMMIT: the pin `consumer-gate.yml` carries AT that commit, against `action.yml` AT that commit. It
// reuses `actionPinVerdict` (the pull-request-time form of `check-pin`'s second step) rather than restating it, and adds the first step of
// `check-pin` (a pin that is not an ancestor of the commit is stale too). It does not read which files the push touched: a push that touched
// neither file leaves the answer as it was, and the test pins exactly that, so a re-run of the workflow on an unrelated commit is harmless.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sandboxGitEnv } from "../packages/guards/src/git-env.mjs";
import { refuseUnknownFlags } from "./cli-flags.mjs";
import { actionPinVerdict, extractPinnedSha } from "./generate-consumer-gate.ts";

const REPO = fileURLToPath(new URL("..", import.meta.url));
export const CONSUMER_GATE_PATH = ".github/workflows/consumer-gate.yml";
/** The one branch the workflow regenerates on, force-updated while a pull request from it is open, so there is never a second repair in flight. */
export const REGENERATION_BRANCH = "automation/consumer-gate-pin";
export const REGENERATE = "regenerate";
export const NOTHING_TO_DO = "nothing to do";

function git(args: string[], { cwd, allowedStatus = [0] }: { cwd: string; allowedStatus?: number[] }): { status: number; stdout: string } {
  try {
    return { status: 0, stdout: execFileSync("git", args, { cwd, env: sandboxGitEnv(), encoding: "utf8", stdio: "pipe" }) };
  } catch (caught) {
    const error = caught as Error & { status?: number; stderr?: Buffer };
    if (error.status !== undefined && allowedStatus.includes(error.status)) return { status: error.status, stdout: "" };
    throw new Error(`git ${args.join(" ")} failed: ${error.stderr?.toString().trim() || error.message}`, { cause: caught });
  }
}

/**
 * `check-pin`'s two refusals, read at `head`. Throws when git cannot resolve a commit: not being able to ask is never "nothing to do".
 */
export function pinDecision({ pin, head, cwd = REPO }: { pin: string; head: string; cwd?: string }): { action: string; reason: string } {
  // `merge-base --is-ancestor` exits 1 for "not an ancestor" and 128 for a commit it cannot resolve; only the first is an answer.
  const ancestor = git(["merge-base", "--is-ancestor", pin, head], { cwd, allowedStatus: [0, 1] });
  if (ancestor.status === 1) {
    return { action: REGENERATE, reason: `the pin, ${pin}, is not an ancestor of ${head}` };
  }
  const verdict = actionPinVerdict({ pin, base: head, head, cwd });
  return verdict.ok
    ? { action: NOTHING_TO_DO, reason: verdict.message }
    : { action: REGENERATE, reason: verdict.message };
}

/**
 * The decision at `commit`, with the pin read from the `consumer-gate.yml` THAT COMMIT carries.
 */
export function decideAtCommit({ commit, cwd = REPO }: { commit: string; cwd?: string }): { action: string; reason: string; pin: string } {
  const file = git(["show", `${commit}:${CONSUMER_GATE_PATH}`], { cwd }).stdout;
  const pin = extractPinnedSha(file);
  if (!pin) throw new Error(`${CONSUMER_GATE_PATH} at ${commit} pins no commit, so there is nothing to compare action.yml against`);
  return { ...pinDecision({ pin, head: commit, cwd }), pin };
}

/**
 * Is the repair for a stale pin on `base` already on its way? The condition `generate-consumer-gate.test.ts` reads to REPORT a stale pin
 * instead of failing every unrelated pull request on it: the regeneration branch exists on `origin` AND the pin it carries contains
 * `action.yml` as `base` has it. A branch that exists with a pin that is itself stale excuses nothing.
 *
 * It asks `origin`, not the API, because a checkout already holds the credential for it; a remote it cannot reach THROWS, and the caller's
 * test fails: not being able to ask is not an excuse for a red pin.
 */
export function regenerationInFlight({ base, cwd = REPO }: { base: string; cwd?: string }): { inFlight: boolean; reason: string } {
  const listed = git(["ls-remote", "origin", `refs/heads/${REGENERATION_BRANCH}`], { cwd }).stdout.trim();
  if (listed === "") return { inFlight: false, reason: `origin has no ${REGENERATION_BRANCH} branch, so no regeneration is open` };
  git(["fetch", "--quiet", "origin", `refs/heads/${REGENERATION_BRANCH}`], { cwd });
  const pin = extractPinnedSha(git(["show", `FETCH_HEAD:${CONSUMER_GATE_PATH}`], { cwd }).stdout);
  if (!pin) return { inFlight: false, reason: `${REGENERATION_BRANCH} carries a ${CONSUMER_GATE_PATH} with no pin` };
  const verdict = actionPinVerdict({ pin, base, head: base, cwd });
  return verdict.ok
    ? { inFlight: true, reason: `${REGENERATION_BRANCH} pins ${pin}, which contains action.yml as ${base} has it` }
    : { inFlight: false, reason: `${REGENERATION_BRANCH} pins ${pin}, which is itself stale against ${base}` };
}

export type ReleaseRun = { id: number; conclusion: string | null; jobs: { name: string; conclusion: string | null }[] };

/**
 * A release run is OWED after the repair merges when the newest release run on `main` failed or was skipped because of the stale pin: the
 * repair carries no changeset, so it starts no release of its own (#4325, #4329), and the changesets that run was to consume wait for the
 * next one. The reading is of the newest run only: an older failure was followed by a later run, which has already had its chance.
 * `runs` are the release runs on `main`, NEWEST FIRST, each with its jobs.
 */
export function releaseOwed({ runs }: { runs: ReleaseRun[] }): { owed: boolean; reason: string } {
  const newest = runs.find((run) => run.conclusion !== null);
  if (!newest) return { owed: false, reason: "no completed release run on main, so none was left behind" };
  if (newest.conclusion === "success") return { owed: false, reason: `release run ${newest.id} succeeded` };
  const refused = newest.jobs.some((job) => /consumer-gate/.test(job.name) && /check-pin/.test(job.name) && job.conclusion === "failure");
  return refused
    ? { owed: true, reason: `release run ${newest.id} ended ${newest.conclusion} in consumer-gate / check-pin, on the stale pin this repair fixes` }
    : { owed: false, reason: `release run ${newest.id} ended ${newest.conclusion} but not in consumer-gate / check-pin: a different cause, which a re-dispatch would not fix` };
}

function setOutput(name: string, value: string): void {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

/** `flag` is `--name=`. */
function flagValue(flag: string): string | undefined {
  const argument = process.argv.slice(2).find((a) => a.startsWith(flag));
  return argument === undefined ? undefined : argument.slice(flag.length);
}

function main() {
  const runsFile = flagValue("--release-runs=");
  if (runsFile !== undefined) {
    const { owed, reason } = releaseOwed({ runs: JSON.parse(readFileSync(runsFile, "utf8")) });
    console.log(`${owed ? "OWED" : "NOT OWED"}  ${reason}`);
    setOutput("release", owed ? "owed" : "not-owed");
    return;
  }
  const commit = flagValue("--commit=") ?? "HEAD";
  const { action, reason, pin } = decideAtCommit({ commit });
  console.log(`${action.toUpperCase()}  ${CONSUMER_GATE_PATH} pins ${pin} at ${commit}: ${reason}`);
  setOutput("action", action === REGENERATE ? "regenerate" : "nothing");
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  try {
    refuseUnknownFlags(["--commit=", "--release-runs="], { entry: import.meta.url, command: "pnpm exec tsx scripts/consumer-gate-pin-needed.ts" });
    main();
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
  }
}
