#!/usr/bin/env node
// @ts-check
// command: `pnpm run verify` -- the ONE local command that equals CI, and a stamp that says so for this head (#3210)
//
// WHY THIS EXISTS. The chairman measured the first-run pass rate at 35% (41 of 63 pull requests red on their first
// completed run, #928) and read the cause: authors ran "the affected files", CI runs the changed files
// transitively, and every tree-wide guard. A partial local run is not "passing", and
// nothing let an author tell the difference. This runs what CI's `gate` waits for.
//
// IT REUSES CI'S CODE AND DOES NOT COPY IT. Which jobs apply is `ci-changed.mjs`'s `classify`, imported. The population is `gate`'s own
// `needs` list, read from `ci.yml`: every job in it is a step below or an entry of CI_ONLY with a reason, and
// `verify-matches-ci.test.ts` fails the day a job is added to CI and to neither.
//
// THE TESTS IT RUNS ARE THE MODULE-GRAPH-AFFECTED SET, NOT THE SUITE (#3572, chairman via ceo, 2026-10-04): `rstest run
// --changed=<base>` runs the test files whose graph reaches a changed file, and `forceRerunTriggers` in the rstest
// config widens it to every test for an input no graph can see (a lockfile, a tsconfig, a file read by path). The
// tree-wide guards leave local verify and run once, in CI (`guardSweep` is in CI_ONLY). So the stamp says "the AFFECTED
// SET passed at this head" and names its base: a stamp that read "passes" over a subset is #3215's misreading again.
//
// THE STAMP. `.git/<worktree>/verify-stamp.json` (git's own per-worktree path, so it is never tracked and never
// shared between worktrees): the head, a hash of the body, the result of every step and the wall time. A stamp is
// GREEN only for the head and body it was made for, and only when EVERY step is there and passed. `pr:open` reads
// it; `--check` prints the same verdict without running anything.
//
// WALL TIME is printed beside CI's median as a measurement and not a target (chairman, #3210). If this is slower
// than CI, that is the next row, not a reason to drop a step.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync, globSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { constants as osConstants, homedir, tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { changedFiles } from "../packages/guards/src/changed-files.mjs";
import { underFloor } from "../packages/guards/src/assert-glob-not-empty.mjs";
import { sandboxGitEnv } from "../packages/guards/src/git-env.mjs";
import { refuseUnknownFlags, flagValue } from "./cli-flags.mjs";
const { checkBody } = await toolExport("pr-open");
import { classify, knownPackages, packedFiles } from "./ci-changed.mjs";
import { privateRunRoot } from "./private-tmp.mjs";
// NEVER a bare `pnpm` spawn -- unsafe on Windows (CVE-2024-27980), and this repo's own guard refuses one.
import { pnpmCliInvocation } from "./npm-cli-executable.mjs";
import { toolBin, toolExport } from "./agent-org-newest-tag.mjs";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const STAMP_FILE = "verify-stamp.json";

/** Median wall time of CI's `ci` run (6.2 minutes, the chairman's measurement on #3210/#928), for comparison only. */
const CI_MEDIAN_MS = 372_000;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SHORT_SHA = 9;

/**
 * Every job of `ci.yml` that `gate` needs and that runs here. `runsWhen` is the `classify` key that makes CI run
 * the job, or null when CI runs it on every pull request: the body checks and the owned-path
 * sign-off carry no `changed` output, so a bare diff of a docs file still runs them (#2348), and so does this.
 */
export const STEPS = [
  { id: "changed", runsWhen: null },
  { id: "ts", runsWhen: "ts" },
  { id: "python", runsWhen: "python" },
  { id: "rulesFitness", runsWhen: "rulesFitness" },
  { id: "changeset", runsWhen: "changeset" },
  { id: "acceptance", runsWhen: null },
  { id: "ownedPaths", runsWhen: null },
];

/**
 * What `gate` waits for and `verify` does NOT run, each with its reason, so a reader can see the gap rather than
 * infer it. A job that needs a secret, a runner OS or the merge queue cannot run here; saying so beats a silent gap.
 */
export const CI_ONLY = {
  guardSweep: "the tree-wide guards (tests ABOUT the repository, the #2174 class) are not a function of the diff, so no "
    + "module graph selects them and `--changed` cannot; they run once per pull request in CI, which carries no "
    + "`changed` condition for them (#3572, chairman via ceo)",
  ansible: "needs ansible-core and the Galaxy collections, which CI installs fresh with pip and ansible-galaxy "
    + "and which are no dependency of this checkout; `changed` skips it for any diff that does not move a layer's pin in layers.json",
  deliberateRefusals: "needs the pull request's number and a GitHub token: it compares the head with what GitHub "
    + "recorded (#294) and the body's Closes with what GitHub will close (#549), and no pull request exists before "
    + "pr:open (the body's own shape is checked by the `acceptance` step)",
  bodyEdit: "classifies a pull request-body edit as prose-only by comparing the body GitHub holds now with the one it held "
    + "before (`changes.body`), and the event that carried the edit; both exist only on a pull request that is already open, "
    + "and a local verify has neither the body nor the event to read (#4413)",
};

/**
 * The jobs `gate` needs, read off `ci.yml`'s text. EMPTY means the block was not found, which a test pins against.
 * @param {string} ciYml
 */
export function jobsGateNeeds(ciYml: string) {
  const gate = ciYml.split("\n  gate:\n")[1] ?? "";
  const list = /\n {4}needs:\s*\[([^\]]*)\]/.exec(`\n${gate}`);
  return list ? list[1].split(",").map((name) => name.trim()).filter(Boolean) : [];
}

/**
 * The jobs in `needed` that are neither a step nor a CI-only entry with a reason.
 * @param {string[]} needed
 * @param {Array<{ id: string }>} [steps]
 * @param {Record<string, string>} [ciOnly]
 */
export function unaccountedJobs(needed: string[], steps: Array<{ id: string; }> = STEPS, ciOnly: Record<string, string> = CI_ONLY) {
  const ran = new Set(steps.map((step) => step.id));
  return needed.filter((job) => !ran.has(job) && !(typeof ciOnly[job] === "string" && ciOnly[job].trim() !== ""));
}

/**
 * Which steps CI would run for this classification. A step with no `runsWhen` always runs.
 * @param {Record<string, unknown>} classification
 */
export function stepsToRun(classification: Record<string, unknown>, steps = STEPS) {
  return steps.map((step) => ({ ...step, run: step.runsWhen === null || classification[step.runsWhen] === true }));
}

/** @param {string | null} body */
export function bodyHash(body: string | null) {
  return body === null ? "none" : createHash("sha256").update(body).digest("hex");
}

export type Stamp = { head: string, dirty: boolean, bodyHash: string, steps: Record<string, { status: string, ms: number }>, wallMs: number, base?: string };

/**
 * IS THIS STAMP GREEN FOR THE HEAD AND BODY IN HAND? A stamp for another head or body is red, so is one made on a
 * dirty tree, and so is a partial run: a step missing from it is not green, and neither is a step CI would never
 * skip reading `not-needed`.
 * @param {{ stamp: Stamp | null, head: string, body: string | null, steps?: typeof STEPS }} reading
 * @returns {{ green: boolean, reasons: string[] }}
 */
export function stampVerdict({ stamp, head, body, steps = STEPS }: { stamp: Stamp | null; head: string; body: string | null; steps?: typeof STEPS; }): { green: boolean; reasons: string[]; } {
  if (!stamp) return { green: false, reasons: ["no stamp: `pnpm run verify` has not run on this worktree"] };
  const reasons = [];
  if (stamp.head !== head) reasons.push(`the stamp is for head ${stamp.head.slice(0, SHORT_SHA)}, this is ${head.slice(0, SHORT_SHA)}`);
  if (stamp.dirty) reasons.push("the stamp was made on a tree with uncommitted changes, so it is not for any head");
  if (stamp.bodyHash !== bodyHash(body)) reasons.push("the stamp is for another body than the one now");
  for (const { id, runsWhen } of steps) {
    const status = stamp.steps?.[id]?.status;
    const fine = status === "pass" || (status === "not-needed" && runsWhen !== null);
    if (!fine) reasons.push(`step ${id}: ${status ?? "did not run"}`);
  }
  return { green: reasons.length === 0, reasons };
}

/** @param {number} ms */
function minutes(ms: number) {
  const seconds = Math.round(ms / MS_PER_SECOND);
  const rest = String(seconds % SECONDS_PER_MINUTE).padStart(2, "0");
  return `${Math.floor(seconds / SECONDS_PER_MINUTE)}m${rest}s`;
}

/**
 * EVERY SCRATCH TREE `verify` MAKES IS REMOVED ON EVERY EXIT A PROCESS CAN CHOOSE (#3847, incident #3846). `try/finally` runs on a return and a
 * throw and does not run when a signal ends the process, so a `verify` killed by its parent (a timeout, a closed terminal, a restarted unit) left
 * its `verify-*` tree in `/tmp`. The one `mkdtempSync` is `makeScratch`'s: it registers the tree here, and `removeScratch` (a `finally`) and the handlers below (SIGINT,
 * SIGTERM, SIGHUP and `exit`) are the same sync removal. The handlers stop the children first, so nothing is still writing into a tree being removed.
 *
 * WHAT THIS CANNOT DO: SIGKILL is not delivered to anyone's handler. What survives it is the janitor's work, and a step that blocks the event loop
 * (a `spawnSync`) would hold a signal until it returned, which is why the long steps below run through `shAsync`.
 */
const liveScratch = new Set<string>();
const liveChildren = new Set<ChildProcess>();
let exitHandlersInstalled = false;

/**
 * @param {string} prefix the directory's name up to its random suffix
 * @param {string} [parent] where it is made: the OS temp directory unless a caller says (`privateRunTmp` does)
 */
export function makeScratch(prefix: string, parent: string = tmpdir()) {
  installExitHandlers();
  const dir = mkdtempSync(join(parent, prefix));
  liveScratch.add(dir);
  return dir;
}

/** @param {string} dir a tree `makeScratch` made */
export function removeScratch(dir: string) {
  removeInSmallCalls(dir);
  liveScratch.delete(dir);
}

/**
 * A directory removed one top-level entry per call, then itself: the private run directory holds whatever the suite's tests left in it, and one
 * `rm -r` of a large tree is the call that locked the host's kernel in #3846. `dir` must be a non-empty path, the `${D:?}` rule for a glob joined to a variable.
 * @param {string} dir
 */
export function removeInSmallCalls(dir: string) {
  if (!dir) throw new Error("removeInSmallCalls: refusing an empty directory name");
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) rmSync(join(dir, entry), { recursive: true, force: true });
  rmSync(dir, { recursive: true, force: true });
}

/**
 * A PRIVATE `TMPDIR` FOR THIS RUN AND EVERYTHING IT SPAWNS (chairman's 16:55Z correction on #3846, #3847): `~/.cache/a11ign/tmp/run-<id>`, made once,
 * (or a `run-<id>` under the caller's `TMPDIR` when the home is not writable, #3932: `privateRunRoot` decides and refuses naming both), exported as `TMPDIR` in this process's environment (so `tmpdir()`, `makeScratch` and every child inherit it) and removed, in small calls, on every
 * exit `makeScratch`'s trees are. The test directories the suites make land in it and go with it, instead of piling up in the shared `/tmp`.
 * THE INTERFACE #3855's rstest config can reuse: `privateRunTmp({ home? }) -> dir`, and `removeInSmallCalls(dir)` for its own removal.
 * @param {{ home?: string }} [where]
 * @returns {string} the run's directory
 */
export function privateRunTmp({ home = homedir() }: { home?: string; } = {}): string {
  const dir = makeScratch("run-", privateRunRoot({ home }));
  process.env.TMPDIR = dir;
  return dir;
}

function removeAllScratch() {
  for (const dir of [...liveScratch]) removeScratch(dir);
}

/** The shell's offset for "ended by signal n", which an unhandled one would have exited with. */
const SIGNAL_EXIT_BASE = 128;
/** The signals that end a run from outside. */
const ENDING_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

function installExitHandlers() {
  if (exitHandlersInstalled) return;
  exitHandlersInstalled = true;
  for (const signal of ENDING_SIGNALS) {
    process.once(signal, () => {
      for (const child of liveChildren) child.kill("SIGTERM");
      removeAllScratch();
      process.exit(SIGNAL_EXIT_BASE + osConstants.signals[signal]);
    });
  }
  process.on("exit", removeAllScratch);
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {import("node:child_process").SpawnSyncOptions} [options]
 */
function sh(command: string, args: string[], options: import("node:child_process").SpawnSyncOptions = {}) {
  return spawnSync(command, args, { cwd: REPO, stdio: "inherit", encoding: "utf8", env: sandboxGitEnv(), ...options });
}

/** @param {string[]} pnpmArgs @param {{ stdio?: import("node:child_process").StdioOptions }} [options] */
function pnpm(pnpmArgs: string[], { stdio = "inherit" }: { stdio?: import("node:child_process").StdioOptions; } = {}) {
  const { command, args } = pnpmCliInvocation(pnpmArgs);
  return shAsync(command, args, { cwd: REPO, stdio });
}

/**
 * The rstest include of the affected run and the floor under it, ONE pair used for the check and for `--include`: they are
 * `test:all`'s own glob and `--min` (package.json), so a count that falls is a moved path and not a smaller suite. A
 * `--changed` run that matches no file exits 0 and says nothing (measured: `--include nothing/**` with `--changed=HEAD~1`),
 * so a wrong include would read exactly like a diff no test reaches, and this floor is what tells them apart (#2165, #3572).
 */
export const AFFECTED_INCLUDE = "packages/*/src/**/*.test.ts";
export const AFFECTED_MIN_FILES = 107;
const RSTEST_CONFIG = "scripts/rstest/rstest.config.mjs";

/**
 * The words the stamp says, in ONE place: the verify output and `--check` both print it, and a test pins that it carries
 * "affected set" and the base. NOT "the suite passed": the run was a subset.
 * @param {string} base
 */
export function stampWording(base: string) {
  return `the affected set passed at this head, affected against ${base}`;
}

/**
 * WHAT THE AFFECTED RUN MEANS, from the floor, the exit code and rstest's own run summary. Pure, so each refusal has a test:
 * an include under its floor is REFUSED before any run; a run that exits non-zero fails; a run with no summary is refused,
 * because without it "ran nothing" and "did not run" read alike; and ONLY a clean run of zero files is "no test reaches this diff".
 * @param {{ short: Array<{ pattern: string, matched: number }>, exit: number | null,
 *   summary: { testFiles: number, tests: number, failedFiles: number, failedTests: number } | null, base: string }} run
 * @returns {{ status: "pass" | "fail", line: string }}
 */
export function affectedVerdict({ short, exit, summary, base }: {
        short: Array<{ pattern: string; matched: number; }>; exit: number | null;
        summary: { testFiles: number; tests: number; failedFiles: number; failedTests: number; } | null; base: string;
    }): { status: "pass" | "fail"; line: string; } {
  if (short.length > 0) {
    const named = short.map(({ pattern, matched }) => `${pattern} matched ${matched}, need ${AFFECTED_MIN_FILES}`).join("; ");
    return { status: "fail", line: `verify: REFUSED -- the include of the affected run is under its floor (${named}); ` +
      "a `--changed` run over it would select nothing and pass" };
  }
  if (exit !== 0) return { status: "fail", line: `verify: the affected run exited ${exit} against ${base}` };
  if (summary === null) {
    return { status: "fail", line: "verify: REFUSED -- the affected run left no run summary, so what it ran is unknown" };
  }
  if (summary.failedFiles > 0 || summary.failedTests > 0) {
    return { status: "fail", line: `verify: the run record counts ${summary.failedTests} failed tests in ${summary.failedFiles} files` };
  }
  if (summary.testFiles === 0) {
    return { status: "pass", line: `verify: no test reaches this diff (affected against ${base}); nothing was run. The include matches files, so ` +
      "this is not a wrong include, whatever rstest's own `VERDICT REFUSED: 0 tests run` line above says of a run that selected nothing" };
  }
  return { status: "pass", line: `verify: the affected set is ${summary.testFiles} test files, ${summary.tests} tests (against ${base})` };
}

/**
 * The counts rstest's `json` reporter wrote to `file` for the run (`A11Y_RSTEST_SUMMARY_FILE`, which the config honours for
 * the TOP-LEVEL run only: a test that spawns rstest inside a worker would otherwise leave records beside this one, and 14
 * of them did on the first live run), or null, said aloud, when it is missing or not JSON.
 * @param {string} file
 */
export function readRunSummary(file: string) {
  if (!existsSync(file)) {
    console.error(`verify: rstest wrote no run summary to ${file}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(file, "utf8")).summary ?? null;
  } catch (cause) {
    console.error(`verify: the rstest run summary ${file} is not JSON: ${cause instanceof Error ? cause.message : cause}`);
    return null;
  }
}

/**
 * The `ts` step's tests: `rstest run --changed=<base>` through the config every other run uses, under `affectedVerdict`.
 * The floor is read BEFORE the run and the summary AFTER it. `run` and `readSummary` are parameters so a test can drive both.
 * @param {{ base: string }} ctx
 * @param {(command: string, args: string[], where: { cwd: string, stdio: import("node:child_process").StdioOptions, env?: Record<string, string> }) => Promise<{ status: number | null }>} run
 * @param {(file: string) => ReturnType<typeof readRunSummary>} readSummary
 * @returns {Promise<{ status: number }>}
 */
export async function runAffectedSet({ base }: { base: string; }, run: (command: string, args: string[], where: { cwd: string; stdio: import("node:child_process").StdioOptions; env?: Record<string, string>; }) => Promise<{ status: number | null; }>, readSummary: (file: string) => ReturnType<typeof readRunSummary> = readRunSummary): Promise<{ status: number; }> {
  const settle = (/** @type {Parameters<typeof affectedVerdict>[0]} */ reading: Parameters<typeof affectedVerdict>[0]) => {
    const verdict = affectedVerdict(reading);
    console.log(verdict.line);
    return { status: verdict.status === "pass" ? 0 : 1 };
  };
  const short = underFloor([AFFECTED_INCLUDE], AFFECTED_MIN_FILES);
  if (short.length > 0) return settle({ short, exit: null, summary: null, base });
  const scratch = makeScratch("verify-affected-");
  const summaryFile = join(scratch, "summary.json");
  try {
    const { command, args } = pnpmCliInvocation(["exec", "rstest", "run", "--config", RSTEST_CONFIG,
      "--include", AFFECTED_INCLUDE, `--changed=${base}`]);
    const { status } = await run(command, args, { cwd: REPO, stdio: "inherit", env: { A11Y_RSTEST_SUMMARY_FILE: summaryFile } });
    return settle({ short, exit: status, summary: readSummary(summaryFile), base });
  } finally {
    removeScratch(scratch);
  }
}

/**
 * WHERE THE LAST RUN'S FAILURES ARE READ FROM (#3574): the newest RUN RECORD of this worktree (#2199), and not rstest's own
 * sequence cache (`node_modules/.cache/.rstest-results/results.json`), measured 2026-10-05. That cache is ONE file for every
 * worktree here (each `node_modules/.cache` is a symlink to the primary's), keeps a `failed` flag per file for 30 days, and
 * holds failures of scratch fixtures that never existed in this tree, so it says "this file once failed" and never "the last
 * run failed". A record is per worktree, one per top-level run, green ones too, and says `status` for the run as a whole.
 * The directory is `rstest.config.mjs`'s, spelled twice because that file is outside this row's Region; a test pins the pair.
 * @param {Record<string, string | undefined>} [env]
 */
export function runRecordDir(env: Record<string, string | undefined> = process.env) {
  return env.A11Y_RSTEST_RECORD_DIR || join(REPO, "node_modules", ".cache", "rstest-run-records");
}

/** The shape of a record's name after the worktree: the config's UTC stamp. It tells `wt-1865` from `wt-1865-c`. */
const RECORD_STAMP = String.raw`-\d{4}-\d{2}-\d{2}T[\d-]+Z-\d+\.json$`;

/**
 * The newest run record of `worktree` in `dir`, or null when there is none or it cannot be read (said aloud: an unreadable
 * record is not a green one, but it must not stop a run either, so the run proceeds without a first leg). The stamp in the
 * name sorts as time, which is why the config can prune oldest-first the same way.
 * @param {{ dir?: string, worktree?: string }} [where]
 * @returns {{ name: string, record: { status?: string, files?: Array<{ testPath: string, status: string }> } } | null}
 */
export function newestRunRecord({ dir = runRecordDir(), worktree = basename(REPO) }: { dir?: string; worktree?: string; } = {}): { name: string; record: { status?: string; files?: Array<{ testPath: string; status: string; }>; }; } | null {
  if (!existsSync(dir)) return null;
  const mine = new RegExp(`^${worktree.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)}${RECORD_STAMP}`);
  const name = readdirSync(dir).filter((entry) => mine.test(entry)).sort().at(-1);
  if (name === undefined) return null;
  try {
    return { name, record: JSON.parse(readFileSync(join(dir, name), "utf8")) };
  } catch (cause) {
    console.error(`verify: the last run record ${name} is not JSON (${cause instanceof Error ? cause.message : cause}); no failures-first run`);
    return null;
  }
}

/**
 * THE FIRST LEG'S FILES: the files the last run failed, minus any that cannot be run again, each dropped file named with its
 * reason so nothing leaves the list silently. ONLY A RECORD WHOSE RUN FAILED YIELDS ANYTHING: a green, absent or unreadable one
 * yields no files, and no files means no first leg, because the alternative spelling, `--onlyFailures` with nothing recorded, runs
 * EVERYTHING (rstest 0.12.3 prints "No failed tests found from the previous run. Running all tests." and does).
 * @param {{ last: ReturnType<typeof newestRunRecord>, exists: (file: string) => boolean, inInclude: (file: string) => boolean }} reading
 * @returns {{ name: string | null, files: string[], dropped: Array<{ file: string, why: string }> }}
 */
export function failuresFirstPlan({ last, exists, inInclude }: { last: ReturnType<typeof newestRunRecord>; exists: (file: string) => boolean; inInclude: (file: string) => boolean; }): { name: string | null; files: string[]; dropped: Array<{ file: string; why: string; }>; } {
  if (last === null || last.record.status !== "fail") return { name: last?.name ?? null, files: [], dropped: [] };
  const failed = (last.record.files ?? []).filter((file) => file.status === "fail").map((file) => file.testPath);
  const files = [];
  const dropped = [];
  for (const file of failed) {
    if (!exists(file)) dropped.push({ file, why: "it no longer exists" });
    else if (!inInclude(file)) dropped.push({ file, why: `it no longer matches the include ${AFFECTED_INCLUDE}` });
    else files.push(file);
  }
  return { name: last.name, files, dropped };
}

/** The plan for the tree in hand: the newest record of this worktree, read before anything this run starts can write another. */
function lastRunFailures() {
  const included = new Set(globSync(AFFECTED_INCLUDE, { cwd: REPO }));
  return failuresFirstPlan({ last: newestRunRecord(), exists: (file) => existsSync(join(REPO, file)), inInclude: (file) => included.has(file) });
}

/**
 * THE FIRST LEG (#3574): `rstest run` over exactly the files the last run failed, so a session sees the failure it is fixing in
 * seconds. A red first leg ends the step, as every command in `ts` does. A PASSING one is not the step's result: the affected run
 * still follows and alone decides the step, so the stamp is never made by a subset of a subset.
 * @param {ReturnType<typeof lastRunFailures>} plan
 * @param {(command: string, args: string[], where: { cwd: string, stdio: import("node:child_process").StdioOptions }) => Promise<{ status: number | null }>} run
 * @returns {Promise<{ status: number | null }>}
 */
export async function runFailuresFirst({ name, files, dropped }: ReturnType<typeof lastRunFailures>, run: (command: string, args: string[], where: { cwd: string; stdio: import("node:child_process").StdioOptions; }) => Promise<{ status: number | null; }>): Promise<{ status: number | null; }> {
  for (const { file, why } of dropped) console.log(`verify: ${file} failed in ${name} and is dropped from the failures-first run: ${why}`);
  if (files.length === 0) return { status: 0 };
  console.log(`verify: ${name} failed ${files.length} file${files.length === 1 ? "" : "s"}; running ${files.length === 1 ? "it" : "them"} before the affected set`);
  const { command, args } = pnpmCliInvocation(["exec", "rstest", "run", "--config", RSTEST_CONFIG, ...files.flatMap((file) => ["--include", file])]);
  const { status } = await run(command, args, { cwd: REPO, stdio: "inherit" });
  console.log(status === 0 ? "verify: those files pass now; the affected set follows" : "verify: those files still fail; the affected set was not started");
  return { status };
}

/**
 * `ts` must not block the event loop: a `spawnSync` here freezes
 * every one of them until `ts` returns, which made the two run one after the other with the step merely STARTED early
 * (#3333). `run` is a parameter so a test can see that every command goes through the non-blocking runner. THE FAILURES-FIRST LEG
 * IS FIRST, before `docs:coverage`, lint and typecheck, because what it is for is seconds to the red an author is fixing (#3574).
 * @param {{ base: string }} ctx
 * @param {(command: string, args: string[], where: { cwd: string, stdio: import("node:child_process").StdioOptions, env?: Record<string, string> }) => Promise<{ status: number | null }>} [run]
 * @param {(file: string) => ReturnType<typeof readRunSummary>} [readSummary]
 * @param {() => ReturnType<typeof lastRunFailures>} [lastRun]
 */
export function runTs({ base }: { base: string; }, run: (command: string, args: string[], where: { cwd: string; stdio: import("node:child_process").StdioOptions; env?: Record<string, string>; }) => Promise<{ status: number | null; }> = shAsync, readSummary: (file: string) => ReturnType<typeof readRunSummary> = readRunSummary, lastRun: () => ReturnType<typeof lastRunFailures> = lastRunFailures) {
  const where = { cwd: REPO, stdio: "inherit" as const };
  const pnpmAsync = (/** @type {string[]} */ pnpmArgs: string[]) => {
    const { command, args } = pnpmCliInvocation(pnpmArgs);
    return run(command, args, where);
  };
  return inOrderAsync([
    () => runFailuresFirst(lastRun(), run),
    () => pnpmAsync(["run", "docs:coverage"]),
    () => pnpmAsync(["run", "lint"]),
    () => pnpmAsync(["run", "typecheck"]),
    () => runAffectedSet({ base }, run, readSummary),
  ]);
}

/** A `SKIPPED` line is an honest skip and not a pass (the engineer brief), so it is its own status and reads red. */
async function runPython() {
  const result = await pnpm(["run", "test:python"], { stdio: ["ignore", "pipe", "inherit"] });
  const out = result.stdout;
  process.stdout.write(out);
  if (result.status !== 0) return "fail";
  return /^SKIPPED/m.test(out) ? "skipped" : "pass";
}

/** CI's `changeset` job, minus the Dependabot and queue branches that only a bot's pull request reaches. @param {{ base: string }} ctx */
async function runChangeset({ base }: { base: string; }) {
  return (await pnpm(["exec", "changeset", "status", `--since=${base}`])).status === 0 ? "pass" : "fail";
}

/**
 * CI's `acceptance` job: every report in agent-org's `CI_BODY_REPORTS` over the body, through `checkBody`, the call
 * `pr:open` makes, so the two cannot be spelled apart (#3209). It takes the diff rather than reading it from a merge
 * commit as the CLI does, and a plain branch has none: the CLI would print `MUTATION: UNCHECKED` here where CI refuses.
 * No body is not a pass: there is nothing to lint.
 * @param {{ body: string | null, files: string[] }} ctx
 */
function runAcceptance({ body, files }: { body: string | null; files: string[]; }) {
  if (body === null) {
    console.error("verify: no body to lint -- pass --draft-body=<path to the draft body>. A stamp without one is not green.");
    return "fail";
  }
  // Deleted files, and the old side of a rename, are in `files` and owe no mutant: CI's own reading excludes them.
  const present = files.filter((file) => existsSync(join(REPO, file)));
  const checked = checkBody(body, { diff: { ok: true, files: present } });
  for (const line of checked.lines) console.log(line);
  return checked.ok ? "pass" : "fail";
}

/** @param {{ body: string | null, files: string[] }} ctx */
async function runOwnedPaths({ body, files }: { body: string | null; files: string[]; }) {
  const dir = makeScratch("verify-owned-");
  try {
    writeFileSync(join(dir, "changed.txt"), files.join("\n"));
    writeFileSync(join(dir, "body.txt"), body ?? "");
    const diff = `--diff=${join(dir, "changed.txt")}`;
    const { status } = await shAsync(process.execPath, [toolBin(), "owned-path-signoff", diff, `--body=${join(dir, "body.txt")}`],
      { cwd: REPO, stdio: "inherit" });
    return status === 0 ? "pass" : "fail";
  } finally {
    removeScratch(dir);
  }
}

/** Where CI's second checkout comes from, and the name of the clone `verify` makes when no checkout is to hand. */
const AGENT_ORG_REMOTE = "a11ign/agent-org";
const AGENT_ORG_CACHE = "verify-agent-org";

/**
 * WHICH CHECKOUT OF THE TOOL THE HOST'S SUITE SLOT (`underTheHostsSlot`) READS, in order: `A11Y_AGENT_ORG_REPO` (explicit, and never
 * replaced by a guess), a sibling `../agent-org`, and otherwise a clone `verify` makes itself in the repository's
 * common git dir, shared by every worktree and never tracked. CI clones the tool with full history too (the suite
 * reads its merge-base), so the clone is full. A normal checkout has the tool at `.agent-org/host.json`'s path (a detached
 * release checkout), which is not a clone to stage from, which is why the first of these cannot be the only way (review of #3342).
 *
 * `refresh` is true for the clone `verify` made on an EARLIER run and for nothing else: the first two are the caller's and are never fetched or moved, and a clone made
 * a moment ago is already current. An old one is what #3931 is: it ages until a module `verify` requires is newer than it, and every session sharing it is refused.
 * @param {{ env: Record<string, string | undefined>, sibling: string, cache: string, isCheckout: (dir: string) => boolean }} where
 * @returns {{ dir: string, clone: boolean, refresh: boolean }}
 */
export function agentOrgSource({ env, sibling, cache, isCheckout }: { env: Record<string, string | undefined>; sibling: string; cache: string; isCheckout: (dir: string) => boolean; }): { dir: string; clone: boolean; refresh: boolean; } {
  if (env.A11Y_AGENT_ORG_REPO) return { dir: env.A11Y_AGENT_ORG_REPO, clone: false, refresh: false };
  if (isCheckout(sibling)) return { dir: sibling, clone: false, refresh: false };
  const clone = !isCheckout(cache);
  return { dir: cache, clone, refresh: !clone };
}

/** A fetch that hangs on a dead network must not hang `verify`: past this it counts as unreachable, which is said and survived. */
const FETCH_TIMEOUT_MS = 60_000;

/**
 * Brings the clone `verify` made to `origin/main` so a module `verify` requires is there when it is asked for (#3931). Two failures, two meanings: an origin that cannot be
 * reached is SAID and the clone used as it is (an offline `verify` is no worse than before this), while a clone that will not fast-forward is a refusal, because a diverged
 * clone is neither what was cloned nor what was released, and running the tool from it would be the silent use this exists to end.
 * @param {string} dir
 * @returns {{ ok: true, note: string } | { ok: false, refusal: string }}
 */
export function refreshAgentOrgClone(dir: string): { ok: true; note: string; } | { ok: false; refusal: string; } {
  const run = (/** @type {string[]} */ args: string[]) => spawnSync("git", args, { cwd: dir, encoding: "utf8", env: sandboxGitEnv(), timeout: FETCH_TIMEOUT_MS });
  const fetched = run(["fetch", "origin"]);
  if (fetched.status !== 0) {
    return { ok: true, note: `verify: could not fetch ${AGENT_ORG_REMOTE} into ${dir} (${(fetched.stderr || "no answer").trim()}); using the clone as it is, which may predate a module verify requires` };
  }
  const merged = run(["merge", "--ff-only", "origin/main"]);
  if (merged.status !== 0) {
    return { ok: false, refusal: `verify: ${dir} cannot be fast-forwarded to origin/main (${(merged.stderr || merged.stdout).trim()}), so it is not used. Delete it so the next run clones afresh, or set A11Y_AGENT_ORG_REPO.` };
  }
  return { ok: true, note: "" };
}

/**
 * The checkout to stage the tool from: cloned once if none is to hand, and brought to `origin/main` when it is the clone an earlier run made. Null (said aloud) when it cannot be had.
 * @param {{ repo?: string, env?: Record<string, string | undefined>, say?: { out: (line: string) => void, err: (line: string) => void } }} [where]
 */
export function provisionAgentOrg({ repo = REPO, env = process.env, say = { out: console.log, err: console.error } }: { repo?: string; env?: Record<string, string | undefined>; say?: { out: (line: string) => void; err: (line: string) => void; }; } = {}) {
  const isCheckout = (/** @type {string} */ dir: string) => existsSync(join(dir, ".git"));
  const commonDir = spawnSync("git", ["rev-parse", "--git-common-dir"], { cwd: repo, encoding: "utf8", env: sandboxGitEnv() }).stdout.trim();
  const cache = resolve(repo, commonDir, AGENT_ORG_CACHE);
  const { dir, clone, refresh } = agentOrgSource({ env, sibling: resolve(repo, "..", "agent-org"), cache, isCheckout });
  if (clone) {
    say.out(`verify: no a11ign/agent-org checkout beside this one; cloning ${AGENT_ORG_REMOTE} into ${dir} (once)`);
    rmSync(dir, { recursive: true, force: true });
    if (sh("gh", ["repo", "clone", AGENT_ORG_REMOTE, dir]).status !== 0) {
      say.err(`verify: could not clone ${AGENT_ORG_REMOTE}; clone it yourself and set A11Y_AGENT_ORG_REPO`);
      return null;
    }
  }
  if (!isCheckout(dir)) {
    say.err(`verify: A11Y_AGENT_ORG_REPO=${dir} is not a git checkout of ${AGENT_ORG_REMOTE}`);
    return null;
  }
  const refreshed = refresh ? refreshAgentOrgClone(dir) : null;
  if (refreshed && !refreshed.ok) {
    say.err(refreshed.refusal);
    return null;
  }
  if (refreshed?.ok && refreshed.note) say.err(refreshed.note);
  return dir;
}

/**
 * A hybrid `node_modules` for a worktree that has none (`selection-skipped.ts` makes one; the `agentOrg` step that first needed it is gone, #3885): every entry links to where the author's tree gets it, and
 * `@a11ign/*` is relinked with the SAME relative targets, so inside the clone they reach the clone's own `packages/`
 * and not the author's (docs/operational-lessons.md#resolves-to-dist-does-not-say-whose). No build runs: CI's job has none.
 * @param {{ from: string, to: string }} dirs
 */
export function linkNodeModules({ from, to }: { from: string; to: string; }) {
  mkdirSync(join(to, "@a11ign"), { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (entry.name === "@a11ign") continue;
    const path = join(from, entry.name);
    symlinkSync(entry.isSymbolicLink() ? resolve(from, readlinkSync(path)) : path, join(to, entry.name));
  }
  for (const link of readdirSync(join(from, "@a11ign"))) {
    symlinkSync(readlinkSync(join(from, "@a11ign", link)), join(to, "@a11ign", link));
  }
  return { status: 0 };
}

/**
 * Like `sh`, without blocking.
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd: string, stdio: import("node:child_process").StdioOptions, env?: Record<string, string> }} where
 * @returns {Promise<{ status: number | null, stdout: string }>} `stdout` is what a piped one wrote, and "" when it was not piped
 */
export function shAsync(command: string, args: string[], { cwd, stdio, env = {} }: { cwd: string; stdio: import("node:child_process").StdioOptions; env?: Record<string, string>; }): Promise<{ status: number | null; stdout: string; }> {
  return new Promise((done) => {
    const child = spawn(command, args, { cwd, env: sandboxGitEnv(env), stdio });
    liveChildren.add(child);
    let stdout = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.on("error", (cause) => {
      liveChildren.delete(child);
      console.error(`verify: could not start ${command}: ${cause.message}`);
      done({ status: null, stdout });
    });
    child.on("close", (status) => {
      liveChildren.delete(child);
      done({ status, stdout });
    });
  });
}

/** Commands run in order, stopping at the first that fails. @param {Array<() => { status: number | null } | Promise<{ status: number | null }>>} commands */
async function inOrderAsync(commands: Array<() => { status: number | null; } | Promise<{ status: number | null; }>>) {
  for (const command of commands) if ((await command()).status !== 0) return "fail";
  return "pass";
}

/**
 * @param {string} id
 * @param {StepContext} ctx
 */
export type StepContext = { ciYml: string, base: string, body: string | null, files: string[] };
function runStep(id: string, ctx: StepContext) {
  const runners: Record<string, () => string | Promise<string>> = {
    changed: () => "pass",
    ts: () => runTs(ctx),
    python: () => runPython(),
    rulesFitness: async () => ((await pnpm(["run", "rules-check"])).status === 0 ? "pass" : "fail"),
    changeset: () => runChangeset(ctx),
    acceptance: () => runAcceptance(ctx),
    ownedPaths: () => runOwnedPaths(ctx),
  };
  return runners[id]();
}

/** @param {string[]} args */
function git(args: string[]) {
  return spawnSync("git", args, { cwd: REPO, encoding: "utf8", env: sandboxGitEnv() }).stdout.trim();
}

function stampPath() {
  return resolve(REPO, git(["rev-parse", "--git-path", STAMP_FILE]));
}

/** @returns {Stamp | null} */
export function readStamp(path = stampPath()): Stamp | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (cause) {
    throw new Error(`${path} is not JSON; delete it and run verify again`, { cause });
  }
}

/** @param {string | undefined} bodyFile */
function readBody(bodyFile: string | undefined) {
  return bodyFile ? readFileSync(bodyFile, "utf8") : null;
}

/**
 * The result of every step, in `gate`'s order, ALL of them, so an author sees every red at once as CI shows them.
 * @param {{ classification: Record<string, unknown>, ctx: StepContext }} run
 */
async function runAllSteps({ classification, ctx }: { classification: Record<string, unknown>; ctx: StepContext; }) {
  /** @type {Stamp["steps"]} */
  const results: Stamp["steps"] = {};
  const plan = stepsToRun(classification);
  for (const step of plan) {
    const started = Date.now();
    const what = step.run ? "..." : "-- CI would skip it for this diff";
    process.stdout.write(`\nverify: ${step.id} ${what}\n`);
    const outcome = await outcomeOf(step, { ctx, started });
    process.stdout.write(outcome.output);
    results[step.id] = { status: outcome.status, ms: outcome.ms };
    process.stdout.write(`verify: ${step.id} ${outcome.status.toUpperCase()} (${minutes(outcome.ms)})\n`);
  }
  return results;
}

/** @param {{ id: string, run: boolean }} step @param {{ ctx: StepContext, started: number }} where */
async function outcomeOf(step: { id: string; run: boolean; }, { ctx, started }: { ctx: StepContext; started: number; }) {
  if (!step.run) return { status: "not-needed", ms: 0, output: "" };
  return { status: await runStep(step.id, ctx), ms: Date.now() - started, output: "" };
}

/**
 * The tool's suite-slot module in `dir`, or undefined. Either spelling: agent-org renames its modules (agent-org#435, #4389) and `verify` must not
 * refuse the day a checkout moves from `.mjs` to `.ts` (#4404).
 */
export function suiteSlotsFile(dir: string): string | undefined {
  return ["src/suite-slots.mjs", "src/suite-slots.ts"].map((relative) => join(dir, relative)).find((file) => existsSync(file));
}

/**
 * THE WHOLE RUN TAKES ONE OF THE HOST'S 2 SUITE SLOTS, AT `nice -n 15 ionice -c 3`, AND TAKES IT BEFORE ITS FIRST STEP (#3536, chairman via `ceo`, 2026-10-04). Nothing limited how many full
 * suites ran at once on the agent host: the 1-minute load was over its 16 cores in 26 of 36 samples and one gate tick took 6 min 44 s. `verify` runs ITSELF under the slot, so the one slot
 * covers every step, and the child it starts is `verify` again with `SLOT_ENV` set so it does not queue behind itself.
 *
 * THE IMPLEMENTATION IS THE TOOL'S, ONE COPY AND ONE SLOT COUNT, read from the checkout `provisionAgentOrg` finds, never copied here and never the tool the host runs
 * (a release older than the module would have no `suite-slots.mjs`). A checkout without it is a REFUSAL naming it, and so is a missing `flock`: a limit that silently does not
 * apply is worse than none. On a runner (`CI` set) there is no slot and the tool is not even loaded, as CI is not this host.
 *
 * @returns {Promise<number | null>} verify's exit code when it ran (or refused) here, or null when THIS process is the one to do the work
 */
async function underTheHostsSlot(): Promise<number | null> {
  if (process.env.CI) return null;
  const dir = provisionAgentOrg();
  const file = dir && suiteSlotsFile(dir);
  if (!file) {
    console.error(`verify: ${dir ? join(dir, "src/suite-slots.{mjs,ts}") : "the agent-org checkout"} is missing, so verify is NOT run: the host-wide limit on concurrent suites (#3536) lives there, and running without it is refused. `
      + "Pull the latest `main` into that checkout, or set A11Y_AGENT_ORG_REPO to one that has it.");
    return 2;
  }
  const slots = await import(pathToFileURL(file).href);
  if (slots.insideSlot(process.env)) return null;
  try {
    return await slots.runUnderSlot({ command: process.execPath, args: [...process.execArgv, ...process.argv.slice(1)], label: `pnpm run verify (${REPO})` });
  } catch (cause) {
    if (!(cause instanceof slots.SuiteSlotRefusal)) throw cause;
    console.error(cause instanceof Error ? cause.message : String(cause));
    return 2;
  }
}

async function main() {
  refuseUnknownFlags(["--base", "--draft-body", "--check"], { entry: import.meta.url, command: "pnpm run verify" });
  const base = flagValue(process.argv, "base") ?? process.env.A11Y_TEST_BASE ?? "origin/main";
  const body = readBody(flagValue(process.argv, "draft-body"));
  const head = git(["rev-parse", "HEAD"]);
  if (process.argv.includes("--check")) {
    const stamp = readStamp();
    return report(stampVerdict({ stamp, head, body }), stamp?.base ?? base);
  }
  const slotted = await underTheHostsSlot();
  if (slotted !== null) return slotted;
  privateRunTmp();

  const files = changedFiles([`${base}...HEAD`], { repoRoot: REPO });
  if (files.length === 0) {
    console.error(`verify: "git diff ${base}...HEAD" returned nothing -- an empty diff or a wrong --base. CI refuses the same way.`);
    return 2;
  }
  const started = Date.now();
  const dirty = git(["status", "--porcelain"]) !== "";
  const packages = knownPackages(REPO);
  const classification = classify(files, packages, { repoRoot: REPO, getPackedFiles: packedFiles });
  const ctx = { ciYml: readFileSync(join(REPO, ".github/workflows/ci.yml"), "utf8"), base, body, files };
  const steps = await runAllSteps({ classification, ctx });
  const wallMs = Date.now() - started;
  const endedDirty = dirty || git(["status", "--porcelain"]) !== "";
  const stamp = { head, dirty: endedDirty, bodyHash: bodyHash(body), steps, wallMs, base, at: new Date().toISOString() };
  writeFileSync(stampPath(), `${JSON.stringify(stamp, null, 2)}\n`);
  process.stdout.write(`\nverify: ${minutes(wallMs)} wall, against CI's median ${minutes(CI_MEDIAN_MS)} `
    + "(a measurement, not a target)\n");
  return report(stampVerdict({ stamp, head, body }), base);
}

/** @param {{ green: boolean, reasons: string[] }} verdict @param {string} base */
function report({ green, reasons }: { green: boolean; reasons: string[]; }, base: string) {
  process.stdout.write(green ? `verify: GREEN for this head and body -- ${stampWording(base)}; the tree-wide guards run in CI only\n`
    : `verify: RED\n${reasons.map((reason) => `  - ${reason}`).join("\n")}\n`);
  return green ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  process.exit(await main());
}
