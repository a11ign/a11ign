#!/usr/bin/env node
// @ts-check
// command: `pnpm run verify` -- the ONE local command that equals CI, and a stamp that says so for this head (#3210)
//
// WHY THIS EXISTS. The chairman measured the first-run pass rate at 35% (41 of 63 pull requests red on their first
// completed run, #928) and read the cause: authors ran "the affected files", CI runs the changed files
// transitively, every tree-wide guard and the whole agent-org suite. A partial local run is not "passing", and
// nothing let an author tell the difference. This runs what CI's `gate` waits for.
//
// IT REUSES CI'S CODE AND DOES NOT COPY IT. Which jobs apply is `ci-changed.mjs`'s `classify`, imported. The agentOrg
// job's ref and the files it copies are READ from `ci.yml` rather than typed here. And the population is `gate`'s own
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
// THE `agentOrg` STEP RUNS BESIDE `ts` (#3333). CI runs its jobs in parallel and this ran them one after another, which
// made it slower than CI on all three pull requests measured. The step works in a detached worktree of the head in a
// scratch directory, so nothing it writes is under the author's tree and the tree-walking guards inside `ts` never read
// it. The cost: it tests the COMMITTED head, so an author's uncommitted edit is not in it (a stamp on a dirty tree is
// never green anyway).
//
// THE `agentOrg` STEP SEES NO `~/.claude/projects`, AS CI'S RUNNER SEES NONE (#3368). Beside `ts` it took 5m46s where CI took
// about 4m: the tool's tests read the host's transcripts to find a session (3 GB here; one test spent 90 s in it), and 1m56s is
// what is left of it. Everything else of the home is linked, so no test sees another machine (`ciLikeHome`).
//
// WALL TIME is printed beside CI's median as a measurement and not a target (chairman, #3210). If this is slower
// than CI, that is the next row, not a reason to drop a step.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync, existsSync, globSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { changedFiles } from "../packages/guards/src/changed-files.mjs";
import { underFloor } from "../packages/guards/src/assert-glob-not-empty.mjs";
import { sandboxGitEnv } from "../packages/guards/src/git-env.mjs";
import { refuseUnknownFlags, flagValue } from "./cli-flags.mjs";
const { checkBody } = await toolModule("src/pr-open.mjs");
import { classify, knownPackages, packedFiles } from "./ci-changed.mjs";
// NEVER a bare `pnpm` spawn -- unsafe on Windows (CVE-2024-27980), and this repo's own guard refuses one.
import { pnpmCliInvocation } from "./npm-cli-executable.mjs";
import { toolModule, toolPath } from "./agent-org-newest-tag.mjs";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const STAMP_FILE = "verify-stamp.json";

/** Median wall time of CI's `ci` run (6.2 minutes, the chairman's measurement on #3210/#928), for comparison only. */
const CI_MEDIAN_MS = 372_000;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SHORT_SHA = 9;

/**
 * Every job of `ci.yml` that `gate` needs and that runs here. `runsWhen` is the `classify` key that makes CI run
 * the job, or null when CI runs it on every pull request: the agent-org suite, the body checks and the owned-path
 * sign-off carry no `changed` output, so a bare diff of a docs file still runs them (#2348), and so does this.
 */
export const STEPS = [
  { id: "changed", runsWhen: null },
  { id: "ts", runsWhen: "ts" },
  { id: "python", runsWhen: "python" },
  { id: "rulesFitness", runsWhen: "rulesFitness" },
  { id: "changeset", runsWhen: "changeset" },
  { id: "agentOrg", runsWhen: null },
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
    + "`changed` condition for them (#3572, chairman via ceo: the same line #3549 draws for the agent-org suite)",
  ansible: "needs ansible-core and the Galaxy collections, which CI installs fresh with pip and ansible-galaxy "
    + "and which are no dependency of this checkout; `changed` skips it for any diff outside packages/control/ansible",
  deliberateRefusals: "needs the pull request's number and a GitHub token: it compares the head with what GitHub "
    + "recorded (#294) and the body's Closes with what GitHub will close (#549), and no pull request exists before "
    + "pr:open (the body's own shape is checked by the `acceptance` step)",
};

/**
 * The jobs `gate` needs, read off `ci.yml`'s text. EMPTY means the block was not found, which a test pins against.
 * @param {string} ciYml
 */
export function jobsGateNeeds(ciYml) {
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
export function unaccountedJobs(needed, steps = STEPS, ciOnly = CI_ONLY) {
  const ran = new Set(steps.map((step) => step.id));
  return needed.filter((job) => !ran.has(job) && !(typeof ciOnly[job] === "string" && ciOnly[job].trim() !== ""));
}

/**
 * Which steps CI would run for this classification. A step with no `runsWhen` always runs.
 * @param {Record<string, unknown>} classification
 */
export function stepsToRun(classification, steps = STEPS) {
  return steps.map((step) => ({ ...step, run: step.runsWhen === null || classification[step.runsWhen] === true }));
}

/** @param {string | null} body */
export function bodyHash(body) {
  return body === null ? "none" : createHash("sha256").update(body).digest("hex");
}

/**
 * @typedef {{ head: string, dirty: boolean, bodyHash: string, steps: Record<string, { status: string, ms: number }>,
 *   wallMs: number, base?: string }} Stamp
 */

/**
 * IS THIS STAMP GREEN FOR THE HEAD AND BODY IN HAND? A stamp for another head or body is red, so is one made on a
 * dirty tree, and so is a partial run: a step missing from it is not green, and neither is a step CI would never
 * skip reading `not-needed`.
 * @param {{ stamp: Stamp | null, head: string, body: string | null, steps?: typeof STEPS }} reading
 * @returns {{ green: boolean, reasons: string[] }}
 */
export function stampVerdict({ stamp, head, body, steps = STEPS }) {
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
function minutes(ms) {
  const seconds = Math.round(ms / MS_PER_SECOND);
  const rest = String(seconds % SECONDS_PER_MINUTE).padStart(2, "0");
  return `${Math.floor(seconds / SECONDS_PER_MINUTE)}m${rest}s`;
}

/**
 * The ref and the files CI's `agentOrg` job copies, READ from `ci.yml` so a change there reaches this step.
 * @param {string} ciYml
 * @returns {{ ref: string, copied: string[] } | null}
 */
export function agentOrgStaging(ciYml) {
  const ref = /AGENT_ORG_REF:\s*(\S+)/.exec(ciYml)?.[1];
  const copy = /cp -r ([^\n]+?) \.\.\/packages\/agent-org\//.exec(ciYml)?.[1];
  return ref && copy ? { ref, copied: copy.split(/\s+/) } : null;
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {import("node:child_process").SpawnSyncOptions} [options]
 */
function sh(command, args, options = {}) {
  return spawnSync(command, args, { cwd: REPO, stdio: "inherit", encoding: "utf8", env: sandboxGitEnv(), ...options });
}

/** @param {string[]} pnpmArgs */
function pnpm(pnpmArgs, options = {}) {
  const { command, args } = pnpmCliInvocation(pnpmArgs);
  return sh(command, args, options);
}

/** Commands run in order, stopping at the first that fails. @param {Array<() => { status: number | null }>} commands */
function inOrder(commands) {
  for (const command of commands) if (command().status !== 0) return "fail";
  return "pass";
}

/**
 * The rstest include of the affected run and the floor under it, ONE pair used for the check and for `--include`: they are
 * `test:all`'s own glob and `--min` (package.json), so a count that falls is a moved path and not a smaller suite. A
 * `--changed` run that matches no file exits 0 and says nothing (measured: `--include nothing/**` with `--changed=HEAD~1`),
 * so a wrong include would read exactly like a diff no test reaches, and this floor is what tells them apart (#2165, #3572).
 */
export const AFFECTED_INCLUDE = "packages/*/src/**/*.test.ts";
export const AFFECTED_MIN_FILES = 159;
const RSTEST_CONFIG = "scripts/rstest/rstest.config.mjs";

/**
 * The words the stamp says, in ONE place: the verify output and `--check` both print it, and a test pins that it carries
 * "affected set" and the base. NOT "the suite passed": the run was a subset.
 * @param {string} base
 */
export function stampWording(base) {
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
export function affectedVerdict({ short, exit, summary, base }) {
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
export function readRunSummary(file) {
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
export async function runAffectedSet({ base }, run, readSummary = readRunSummary) {
  const settle = (/** @type {Parameters<typeof affectedVerdict>[0]} */ reading) => {
    const verdict = affectedVerdict(reading);
    console.log(verdict.line);
    return { status: verdict.status === "pass" ? 0 : 1 };
  };
  const short = underFloor([AFFECTED_INCLUDE], AFFECTED_MIN_FILES);
  if (short.length > 0) return settle({ short, exit: null, summary: null, base });
  const scratch = mkdtempSync(join(tmpdir(), "verify-affected-"));
  const summaryFile = join(scratch, "summary.json");
  try {
    const { command, args } = pnpmCliInvocation(["exec", "rstest", "run", "--config", RSTEST_CONFIG,
      "--include", AFFECTED_INCLUDE, `--changed=${base}`]);
    const { status } = await run(command, args, { cwd: REPO, stdio: "inherit", env: { A11Y_RSTEST_SUMMARY_FILE: summaryFile } });
    return settle({ short, exit: status, summary: readSummary(summaryFile), base });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
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
export function runRecordDir(env = process.env) {
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
export function newestRunRecord({ dir = runRecordDir(), worktree = basename(REPO) } = {}) {
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
export function failuresFirstPlan({ last, exists, inInclude }) {
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
export async function runFailuresFirst({ name, files, dropped }, run) {
  for (const { file, why } of dropped) console.log(`verify: ${file} failed in ${name} and is dropped from the failures-first run: ${why}`);
  if (files.length === 0) return { status: 0 };
  console.log(`verify: ${name} failed ${files.length} file${files.length === 1 ? "" : "s"}; running ${files.length === 1 ? "it" : "them"} before the affected set`);
  const { command, args } = pnpmCliInvocation(["exec", "rstest", "run", "--config", RSTEST_CONFIG, ...files.flatMap((file) => ["--include", file])]);
  const { status } = await run(command, args, { cwd: REPO, stdio: "inherit" });
  console.log(status === 0 ? "verify: those files pass now; the affected set follows" : "verify: those files still fail; the affected set was not started");
  return { status };
}

/**
 * `ts` must not block the event loop: `agentOrg` runs beside it as a chain of promises, and a `spawnSync` here freezes
 * every one of them until `ts` returns, which made the two run one after the other with the step merely STARTED early
 * (#3333). `run` is a parameter so a test can see that every command goes through the non-blocking runner. THE FAILURES-FIRST LEG
 * IS FIRST, before `docs:coverage`, lint and typecheck, because what it is for is seconds to the red an author is fixing (#3574).
 * @param {{ base: string }} ctx
 * @param {(command: string, args: string[], where: { cwd: string, stdio: import("node:child_process").StdioOptions, env?: Record<string, string> }) => Promise<{ status: number | null }>} [run]
 * @param {(file: string) => ReturnType<typeof readRunSummary>} [readSummary]
 * @param {() => ReturnType<typeof lastRunFailures>} [lastRun]
 */
export function runTs({ base }, run = shAsync, readSummary = readRunSummary, lastRun = lastRunFailures) {
  const where = { cwd: REPO, stdio: /** @type {const} */ ("inherit") };
  const pnpmAsync = (/** @type {string[]} */ pnpmArgs) => {
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
function runPython() {
  const result = pnpm(["run", "test:python"], { stdio: ["ignore", "pipe", "inherit"] });
  const out = String(result.stdout ?? "");
  process.stdout.write(out);
  if (result.status !== 0) return "fail";
  return /^SKIPPED/m.test(out) ? "skipped" : "pass";
}

/** CI's `changeset` job, minus the Dependabot and queue branches that only a bot's pull request reaches. @param {{ base: string }} ctx */
function runChangeset({ base }) {
  return pnpm(["exec", "changeset", "status", `--since=${base}`]).status === 0 ? "pass" : "fail";
}

/**
 * CI's `acceptance` job: every report in agent-org's `CI_BODY_REPORTS` over the body, through `checkBody`, the call
 * `pr:open` makes, so the two cannot be spelled apart (#3209). It takes the diff rather than reading it from a merge
 * commit as the CLI does, and a plain branch has none: the CLI would print `MUTATION: UNCHECKED` here where CI refuses.
 * No body is not a pass: there is nothing to lint.
 * @param {{ body: string | null, files: string[] }} ctx
 */
function runAcceptance({ body, files }) {
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
function runOwnedPaths({ body, files }) {
  const dir = mkdtempSync(join(tmpdir(), "verify-owned-"));
  try {
    writeFileSync(join(dir, "changed.txt"), files.join("\n"));
    writeFileSync(join(dir, "body.txt"), body ?? "");
    const diff = `--diff=${join(dir, "changed.txt")}`;
    return sh(process.execPath, [toolPath("src/bin.mjs"), "owned-path-signoff", diff, `--body=${join(dir, "body.txt")}`]).status === 0
      ? "pass" : "fail";
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Where CI's second checkout comes from, and the name of the clone `verify` makes when no checkout is to hand. */
const AGENT_ORG_REMOTE = "a11ign/agent-org";
const AGENT_ORG_CACHE = "verify-agent-org";

/**
 * WHICH CHECKOUT OF THE TOOL THE `agentOrg` STEP READS, in order: `A11Y_AGENT_ORG_REPO` (explicit, and never
 * replaced by a guess), a sibling `../agent-org`, and otherwise a clone `verify` makes itself in the repository's
 * common git dir, shared by every worktree and never tracked. CI clones the tool with full history too (the suite
 * reads its merge-base), so the clone is full. A normal checkout has the tool at `.agent-org/host.json`'s path (a detached
 * release checkout), which is not a clone to stage from, which is why the first of these cannot be the only way (review of #3342).
 * @param {{ env: Record<string, string | undefined>, sibling: string, cache: string, isCheckout: (dir: string) => boolean }} where
 * @returns {{ dir: string, clone: boolean }}
 */
export function agentOrgSource({ env, sibling, cache, isCheckout }) {
  if (env.A11Y_AGENT_ORG_REPO) return { dir: env.A11Y_AGENT_ORG_REPO, clone: false };
  if (isCheckout(sibling)) return { dir: sibling, clone: false };
  return { dir: cache, clone: !isCheckout(cache) };
}

/** The checkout to stage the tool from, cloning it once if none is to hand; null (said aloud) when it cannot be had. */
function provisionAgentOrg() {
  const isCheckout = (/** @type {string} */ dir) => existsSync(join(dir, ".git"));
  const cache = resolve(REPO, git(["rev-parse", "--git-common-dir"]), AGENT_ORG_CACHE);
  const { dir, clone } = agentOrgSource({
    env: process.env, sibling: resolve(REPO, "..", "agent-org"), cache, isCheckout,
  });
  if (clone) {
    console.log(`verify: no a11ign/agent-org checkout beside this one; cloning ${AGENT_ORG_REMOTE} into ${dir} (once)`);
    rmSync(dir, { recursive: true, force: true });
    if (sh("gh", ["repo", "clone", AGENT_ORG_REMOTE, dir]).status !== 0) {
      console.error(`verify: could not clone ${AGENT_ORG_REMOTE}; clone it yourself and set A11Y_AGENT_ORG_REPO`);
      return null;
    }
  }
  if (!isCheckout(dir)) {
    console.error(`verify: A11Y_AGENT_ORG_REPO=${dir} is not a git checkout of ${AGENT_ORG_REMOTE}`);
    return null;
  }
  return dir;
}

/** What the staging step writes, under `root`: the tool's directory, and the one fixture whose import it respells. */
const agentOrgPaths = (/** @type {string} */ root) => ({
  toolDir: join(root, "packages/agent-org"),
  fixture: join(root, "packages/guards/src/board-document-chrome-resolver.test.ts"),
});

/**
 * WHERE THE `agentOrg` STEP WORKS: a detached worktree of the author's head, in a scratch directory OUTSIDE the author's
 * tree. The step lays the tool at `packages/agent-org` and edits one fixture's import, and the tree-walking guards
 * inside `ts` read the author's `packages/`: staged in place the two could not overlap (#3333). Everything it writes is
 * under `clone`, so `ts` runs beside it, and the `git status --porcelain` read at the end of a run has nothing to find.
 * @param {string} scratch
 */
export function agentOrgLayout(scratch) {
  const clone = join(scratch, "tree");
  return { clone, ...agentOrgPaths(clone) };
}

/**
 * Lays the tool out as `packages/agent-org` under `root`, the way CI's `agentOrg` job does, and leaves NOTHING of its
 * test suite out: what the staged copy runs is what the tool's own tests are, so a file dropped here is a test CI runs
 * and `verify` does not. `root` is a parameter so a test can stage into a throwaway tree and read the result (#3329).
 * @param {{ toolRepo: string, scratch: string, copied: string[], root?: string, stdio?: import("node:child_process").StdioOptions, commit?: string }} staging
 */
export function stageAgentOrg({ toolRepo, scratch, copied, root = REPO, stdio = "inherit", commit = "FETCH_HEAD" }) {
  const tarball = join(scratch, "tool.tar");
  const { toolDir: dest, fixture } = agentOrgPaths(root);
  const here = (/** @type {string} */ command, /** @type {string[]} */ args) => sh(command, args, { cwd: root, stdio });
  rmSync(dest, { recursive: true, force: true });
  const steps = [
    () => here("git", ["-C", toolRepo, "archive", "--format=tar", `--output=${tarball}`, commit, ...copied]),
    () => here("mkdir", ["-p", dest]),
    () => here("tar", ["-xf", tarball, "-C", dest]),
    // The clone is tracked files only, and `packages/lab/` is a LAYER since #3505 (untracked, laid): the fixtures the rsync copies come from the lab at its pinned tag.
    () => here("node", ["scripts/lay-layer.mjs", "lab"]),
    () => here("rsync", ["-a", "--ignore-existing", "--exclude=*.test.ts", "--exclude=*.test.mjs",
      "packages/lab/src/packaging/", "packages/agent-org/src/packaging/"]),
    // The same `sed` as ci.yml's `agentOrg` job: the project reaches the tool through `toolModule`, the tool's own tests read a static relative import.
    () => here("sed", ["-i", "s#^const {\\(.*\\)} = await toolModule(\"src/board-document.mjs\");#import {\\1} from \"../../agent-org/src/board-document.mjs\";#",
      fixture]),
    () => here("git", ["add", "--force", "--intent-to-add", "packages/agent-org"]),
  ];
  return { status: inOrder(steps) === "pass" ? 0 : 1 };
}

/**
 * A hybrid `node_modules` for the clone, which has none: every entry links to where the author's tree gets it, and
 * `@a11ign/*` is relinked with the SAME relative targets, so inside the clone they reach the clone's own `packages/`
 * and not the author's (docs/operational-lessons.md#resolves-to-dist-does-not-say-whose). No build runs: CI's job has none.
 * @param {{ from: string, to: string }} dirs
 */
export function linkNodeModules({ from, to }) {
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
 * Like `sh`, without blocking, and with output into `log`: a step that runs beside another must not interleave its
 * lines with it, so the output is printed whole at the step's turn.
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd: string, stdio: import("node:child_process").StdioOptions, env?: Record<string, string> }} where
 * @returns {Promise<{ status: number | null }>}
 */
export function shAsync(command, args, { cwd, stdio, env = {} }) {
  return new Promise((done) => {
    const child = spawn(command, args, { cwd, env: sandboxGitEnv(env), stdio });
    child.on("error", (cause) => {
      console.error(`verify: could not start ${command}: ${cause.message}`);
      done({ status: null });
    });
    child.on("close", (status) => done({ status }));
  });
}

/** Commands run in order, stopping at the first that fails. @param {Array<() => { status: number | null } | Promise<{ status: number | null }>>} commands */
async function inOrderAsync(commands) {
  for (const command of commands) if ((await command()).status !== 0) return "fail";
  return "pass";
}

/**
 * A HOME THAT HAS EVERYTHING THE REAL ONE HAS EXCEPT THE TRANSCRIPTS, which is what a CI runner's is. The tool's tests read
 * `~/.claude/projects` for the session they are asked about (`instanceCacheRead`), and on a host that has run agents for
 * weeks that is 3 GB of JSONL: one test spent 90 s of the step in it (#3368, measured with `--cpu-prof`: `readFileSync` and
 * the record parser, nothing else). Every other entry is LINKED, so corepack's pnpm, a browser or `codex` are found where
 * they are today and no test changes from run to run; an empty HOME was tried and failed 8 tests that look there.
 * @param {{ home: string, into: string }} dirs
 * @returns {string} `into`, to be the child's HOME
 */
export function ciLikeHome({ home, into }) {
  const claude = join(home, ".claude");
  mkdirSync(join(into, ".claude"), { recursive: true });
  const link = (/** @type {string} */ from, /** @type {string} */ to, /** @type {string[]} */ except) => {
    if (!existsSync(from)) return;
    for (const entry of readdirSync(from)) if (!except.includes(entry)) symlinkSync(join(from, entry), join(to, entry));
  };
  link(home, into, [".claude"]);
  link(claude, join(into, ".claude"), ["projects"]);
  return into;
}

/**
 * Fetches the tool's `ref` and answers with the COMMIT it was, so what is archived later is that commit and not whatever
 * `FETCH_HEAD` says by then: the checkout is shared (every session's `verify` and the tool's own workers fetch into
 * it), a plain `git fetch origin` rewrites `FETCH_HEAD` with its first line a branch, and the archive minutes later
 * was of an old one -- 39 failures of tests the tool had since deleted. Fetching by the ID is what makes it ours.
 * @param {{ toolRepo: string, ref: string, log: number }} where
 * @returns {{ status: number | null, commit: string }}
 */
export function pinTool({ toolRepo, ref, log }) {
  const git = (/** @type {string[]} */ ...args) =>
    spawnSync("git", ["-C", toolRepo, ...args], { encoding: "utf8", env: sandboxGitEnv(), stdio: ["ignore", "pipe", log] });
  const commit = git("ls-remote", "origin", ref).stdout.split(/\s/)[0] || ref;
  return { status: git("fetch", "--quiet", "origin", commit).status, commit };
}

/**
 * CI's `agentOrg` job, step for step, in a clone of `repo`'s head: the tool at the ref `ci.yml` names laid at
 * `packages/agent-org`, the project's packaging siblings beside its tests, one fixture's import respelled, and the
 * tool's own runner. Nothing is written under `repo`. `repo` is a parameter so a test can run it on a throwaway one.
 * The runner gets `AGENT_ORG_TOOL_REPO` = the checkout the tool was laid out FROM, as `ci.yml` exports it: the laid-out copy sits inside the clone's
 * own repository, and the tool's pin ratchets refuse a directory that is not a repository of its own (#3536: without it `agentOrg` was red here).
 * @param {{ repo: string, toolRepo: string, ref: string, copied: string[], scratch: string, log: number }} job
 */
export async function runAgentOrgInClone({ repo, toolRepo, ref, copied, scratch, log }) {
  const { clone } = agentOrgLayout(scratch);
  let commit = ref;
  const at = (/** @type {string} */ cwd) => ({ cwd, stdio: /** @type {import("node:child_process").StdioOptions} */ (["ignore", log, log]) });
  try {
    return await inOrderAsync([
      () => { const pinned = pinTool({ toolRepo, ref, log }); commit = pinned.commit; return pinned; },
      () => shAsync("git", ["worktree", "add", "--quiet", "--detach", clone, "HEAD"], at(repo)),
      () => linkNodeModules({ from: join(repo, "node_modules"), to: join(clone, "node_modules") }),
      () => stageAgentOrg({ toolRepo, scratch, copied, root: clone, stdio: ["ignore", log, log], commit }),
      () => shAsync("node", ["--import", "tsx", "--test", "packages/agent-org/src/**/*.test.ts",
        "packages/agent-org/src/**/*.test.mjs"], { ...at(clone), env: { HOME: ciLikeHome({ home: homedir(), into: join(scratch, "home") }), AGENT_ORG_TOOL_REPO: toolRepo } }),
    ]);
  } finally {
    await removeClone({ repo, clone, log });
  }
}

/**
 * The link directory goes first and by itself: removing it with the worktree would be asking git not to follow links
 * into the author's `node_modules`, and what it does there is its own business. `git worktree remove` names OUR clone;
 * a bare `git worktree prune` would also take every other session's entry whose directory is momentarily away.
 * @param {{ repo: string, clone: string, log: number }} where
 */
async function removeClone({ repo, clone, log }) {
  rmSync(join(clone, "node_modules"), { recursive: true, force: true });
  if (existsSync(clone)) await shAsync("git", ["worktree", "remove", "--force", clone], { cwd: repo, stdio: ["ignore", log, log] });
}

/**
 * Starts CI's `agentOrg` job and returns at once with a promise for `{ status, output }`, so it runs beside `ts`. Its
 * output is held and printed at its place in `gate`'s order. @param {string} ciYml
 */
async function runAgentOrg(ciYml) {
  const staging = agentOrgStaging(ciYml);
  if (!staging) {
    return { status: "fail", output: "verify: ci.yml's agentOrg job no longer has the AGENT_ORG_REF and `cp -r` lines this step reads\n" };
  }
  const toolRepo = provisionAgentOrg();
  if (!toolRepo) return { status: "fail", output: "" };
  const scratch = mkdtempSync(join(tmpdir(), "verify-agent-org-"));
  const logPath = join(scratch, "agentOrg.log");
  const log = openSync(logPath, "w");
  try {
    const status = await runAgentOrgInClone({ repo: REPO, toolRepo, ref: staging.ref, copied: staging.copied, scratch, log });
    return { status, output: readFileSync(logPath, "utf8") };
  } finally {
    closeSync(log);
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * @typedef {{ ciYml: string, base: string, body: string | null, files: string[] }} StepContext
 * @param {string} id
 * @param {StepContext} ctx
 */
function runStep(id, ctx) {
  const runners = /** @type {Record<string, () => string | Promise<string>>} */ ({
    changed: () => "pass",
    ts: () => runTs(ctx),
    python: () => runPython(),
    rulesFitness: () => (pnpm(["run", "rules-check"]).status === 0 ? "pass" : "fail"),
    changeset: () => runChangeset(ctx),
    acceptance: () => runAcceptance(ctx),
    ownedPaths: () => runOwnedPaths(ctx),
  });
  return runners[id]();
}

/** @param {string[]} args */
function git(args) {
  return spawnSync("git", args, { cwd: REPO, encoding: "utf8", env: sandboxGitEnv() }).stdout.trim();
}

function stampPath() {
  return resolve(REPO, git(["rev-parse", "--git-path", STAMP_FILE]));
}

/** @returns {Stamp | null} */
export function readStamp(path = stampPath()) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (cause) {
    throw new Error(`${path} is not JSON; delete it and run verify again`, { cause });
  }
}

/** @param {string | undefined} bodyFile */
function readBody(bodyFile) {
  return bodyFile ? readFileSync(bodyFile, "utf8") : null;
}

/**
 * `agentOrg` is the one step that runs BESIDE the others (#3333): it works in a clone of the head and writes nothing
 * the others read, where staged in the author's tree it had to wait for `ts`. Started before the first step and
 * collected at its own place, with its output held until then. Its `ms` is its own wall time and not the wait.
 * @param {Array<{ id: string, run: boolean }>} plan
 * @param {StepContext} ctx
 * @returns {Map<string, Promise<{ status: string, ms: number, output: string }>>}
 */
function startBesideSteps(plan, ctx) {
  const beside = new Map();
  if (plan.some((step) => step.id === "agentOrg" && step.run)) {
    const started = Date.now();
    // Caught here: nobody awaits it until its turn, and a rejection with no handler would end the run during `ts`.
    const result = runAgentOrg(ctx.ciYml).catch((cause) => ({ status: "fail", output: `verify: agentOrg threw ${cause.stack}\n` }));
    beside.set("agentOrg", result.then((outcome) => ({ ...outcome, ms: Date.now() - started })));
  }
  return beside;
}

/**
 * The result of every step, in `gate`'s order, ALL of them, so an author sees every red at once as CI shows them.
 * @param {{ classification: Record<string, unknown>, ctx: StepContext }} run
 */
async function runAllSteps({ classification, ctx }) {
  /** @type {Stamp["steps"]} */
  const results = {};
  const plan = stepsToRun(classification);
  const beside = startBesideSteps(plan, ctx);
  for (const step of plan) {
    const started = Date.now();
    const what = !step.run ? "-- CI would skip it for this diff" : beside.has(step.id) ? "... (started beside ts)" : "...";
    process.stdout.write(`\nverify: ${step.id} ${what}\n`);
    const outcome = await outcomeOf(step, { beside, ctx, started });
    process.stdout.write(outcome.output);
    results[step.id] = { status: outcome.status, ms: outcome.ms };
    process.stdout.write(`verify: ${step.id} ${outcome.status.toUpperCase()} (${minutes(outcome.ms)})\n`);
  }
  return results;
}

/** @param {{ id: string, run: boolean }} step @param {{ beside: Map<string, Promise<{ status: string, ms: number, output: string }>>, ctx: StepContext, started: number }} where */
async function outcomeOf(step, { beside, ctx, started }) {
  if (!step.run) return { status: "not-needed", ms: 0, output: "" };
  const apart = beside.get(step.id);
  if (apart) return apart;
  return { status: await runStep(step.id, ctx), ms: Date.now() - started, output: "" };
}

/**
 * THE WHOLE RUN TAKES ONE OF THE HOST'S 2 SUITE SLOTS, AT `nice -n 15 ionice -c 3`, AND TAKES IT BEFORE ITS FIRST STEP (#3536, chairman via `ceo`, 2026-10-04). Nothing limited how many full
 * suites ran at once on the agent host: the 1-minute load was over its 16 cores in 26 of 36 samples and one gate tick took 6 min 44 s. `verify` runs ITSELF under the slot, so the one slot
 * covers `ts` and the `agentOrg` step beside it however many steps run side by side, and the child it starts is `verify` again with `SLOT_ENV` set so it does not queue behind itself.
 *
 * THE IMPLEMENTATION IS THE TOOL'S, ONE COPY AND ONE SLOT COUNT, read from the same checkout the `agentOrg` step uses (`provisionAgentOrg`), never copied here and never the tool the host runs
 * (a release older than the module would have no `suite-slots.mjs`). A checkout without it is a REFUSAL naming it, and so is a missing `flock`: a limit that silently does not
 * apply is worse than none. On a runner (`CI` set) there is no slot and the tool is not even loaded, as CI is not this host.
 *
 * @returns {Promise<number | null>} verify's exit code when it ran (or refused) here, or null when THIS process is the one to do the work
 */
async function underTheHostsSlot() {
  if (process.env.CI) return null;
  const dir = provisionAgentOrg();
  const file = dir && join(dir, "src/suite-slots.mjs");
  if (!file || !existsSync(file)) {
    console.error(`verify: ${file ?? "the agent-org checkout"} is missing, so verify is NOT run: the host-wide limit on concurrent suites (#3536) lives there, and running without it is refused. `
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
function report({ green, reasons }, base) {
  process.stdout.write(green ? `verify: GREEN for this head and body -- ${stampWording(base)}; the tree-wide guards run in CI only\n`
    : `verify: RED\n${reasons.map((reason) => `  - ${reason}`).join("\n")}\n`);
  return green ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  process.exit(await main());
}
