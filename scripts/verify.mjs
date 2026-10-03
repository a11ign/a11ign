#!/usr/bin/env node
// @ts-check
// command: `pnpm run verify` -- the ONE local command that equals CI, and a stamp that says so for this head (#3210)
//
// WHY THIS EXISTS. The chairman measured the first-run pass rate at 35% (41 of 63 pull requests red on their first
// completed run, #928) and read the cause: authors ran "the affected files", CI runs the changed files
// transitively, every tree-wide guard and the whole agent-org suite. A partial local run is not "passing", and
// nothing let an author tell the difference. This runs what CI's `gate` waits for.
//
// IT REUSES CI'S CODE AND DOES NOT COPY IT. Which jobs apply is `ci-changed.mjs`'s `classify`, imported. Which
// tests the `ts` job runs is `select-changed-tests.mjs`, reached through `test-changed.mjs` (the local half of the
// same selection; it spawns the selector `reusable-build-test.yml` calls). The agentOrg job's ref and the files it
// copies are READ from `ci.yml` rather than typed here. And the population is `gate`'s own `needs` list, read from
// `ci.yml`: every job in it is a step below or an entry of CI_ONLY with a reason, and
// `verify-matches-ci.test.ts` fails the day a job is added to CI and to neither.
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
// WALL TIME is printed beside CI's median as a measurement and not a target (chairman, #3210). If this is slower
// than CI, that is the next row, not a reason to drop a step.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { changedFiles } from "../packages/guards/src/changed-files.mjs";
import { sandboxGitEnv } from "../packages/guards/src/git-env.mjs";
import { refuseUnknownFlags, flagValue } from "../packages/worker-fleet/src/cli-flags.mjs";
import { checkBody } from "agent-org/src/pr-open.mjs";
import { classify, knownPackages, packedFiles, readWorkspaceDependencyGraph } from "./ci-changed.mjs";
// NEVER a bare `pnpm` spawn -- unsafe on Windows (CVE-2024-27980), and this repo's own guard refuses one.
import { pnpmCliInvocation } from "./npm-cli-executable.mjs";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const STAMP_FILE = "verify-stamp.json";

/** Median wall time of CI's `ci` run (6.2 minutes, the chairman's measurement on #3210/#928), for comparison only. */
const CI_MEDIAN_MS = 372_000;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SHORT_SHA = 9;

/**
 * Every job of `ci.yml` that `gate` needs and that runs here. `runsWhen` is the `classify` key that makes CI run
 * the job, or null when CI runs it on every pull request: `guardSweep` carries no `changed` output at all, so a bare
 * diff of a docs file still runs the whole tree-wide population (#2348), and so does this.
 */
export const STEPS = [
  { id: "changed", runsWhen: null },
  { id: "ts", runsWhen: "ts" },
  { id: "python", runsWhen: "python" },
  { id: "rulesFitness", runsWhen: "rulesFitness" },
  { id: "changeset", runsWhen: "changeset" },
  { id: "guardSweep", runsWhen: null },
  { id: "agentOrg", runsWhen: null },
  { id: "acceptance", runsWhen: null },
  { id: "ownedPaths", runsWhen: null },
];

/**
 * What `gate` waits for and `verify` does NOT run, each with its reason, so a reader can see the gap rather than
 * infer it. A job that needs a secret, a runner OS or the merge queue cannot run here; saying so beats a silent gap.
 */
export const CI_ONLY = {
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
 *   wallMs: number }} Stamp
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

/** @param {{ base: string }} ctx */
function runTs({ base }) {
  return inOrder([
    () => pnpm(["run", "docs:coverage"]),
    () => pnpm(["run", "lint"]),
    () => pnpm(["run", "typecheck"]),
    () => sh("node", ["scripts/test-changed.mjs", `--base=${base}`]),
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

/** CI's `changeset` job, minus the Dependabot and queue branches that only a bot's pull request reaches. @param {{ base: string, branch: string }} ctx */
function runChangeset({ base, branch }) {
  if (branch === "release/version-packages") return "not-needed";
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
    return pnpm(["exec", "agent-org", "owned-path-signoff", diff, `--body=${join(dir, "body.txt")}`]).status === 0
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
 * reads its merge-base), so the clone is full. A normal checkout has the linked `agent-org` PACKAGE and not a Git
 * checkout of the tool, which is why the first of these cannot be the only way (review of #3342).
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
  fixture: join(root, "packages/lab/src/packaging/board-document-chrome-resolver.test.ts"),
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
 * @param {{ toolRepo: string, scratch: string, copied: string[], root?: string, stdio?: import("node:child_process").StdioOptions }} staging
 */
export function stageAgentOrg({ toolRepo, scratch, copied, root = REPO, stdio = "inherit" }) {
  const tarball = join(scratch, "tool.tar");
  const { toolDir: dest, fixture } = agentOrgPaths(root);
  const here = (/** @type {string} */ command, /** @type {string[]} */ args) => sh(command, args, { cwd: root, stdio });
  rmSync(dest, { recursive: true, force: true });
  const steps = [
    () => here("git", ["-C", toolRepo, "archive", "--format=tar", `--output=${tarball}`, "FETCH_HEAD", ...copied]),
    () => here("mkdir", ["-p", dest]),
    () => here("tar", ["-xf", tarball, "-C", dest]),
    () => here("rsync", ["-a", "--ignore-existing", "--exclude=*.test.ts", "--exclude=*.test.mjs",
      "packages/lab/src/packaging/", "packages/agent-org/src/packaging/"]),
    () => here("sed", ["-i", "s#from \"agent-org/src/board-document.mjs\"#from \"../../../agent-org/src/board-document.mjs\"#",
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
 * @param {{ cwd: string, log: number }} where
 * @returns {Promise<{ status: number | null }>}
 */
function shAsync(command, args, { cwd, log }) {
  return new Promise((done) => {
    const child = spawn(command, args, { cwd, env: sandboxGitEnv(), stdio: ["ignore", log, log] });
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
 * CI's `agentOrg` job, step for step, in a clone of `repo`'s head: the tool at the ref `ci.yml` names laid at
 * `packages/agent-org`, the project's packaging siblings beside its tests, one fixture's import respelled, and the
 * tool's own runner. Nothing is written under `repo`. `repo` is a parameter so a test can run it on a throwaway one.
 * @param {{ repo: string, toolRepo: string, ref: string, copied: string[], scratch: string, log: number }} job
 */
export async function runAgentOrgInClone({ repo, toolRepo, ref, copied, scratch, log }) {
  const { clone } = agentOrgLayout(scratch);
  const at = (/** @type {string} */ cwd) => ({ cwd, log });
  try {
    return await inOrderAsync([
      () => shAsync("git", ["-C", toolRepo, "fetch", "--quiet", "origin", ref], at(repo)),
      () => shAsync("git", ["worktree", "add", "--quiet", "--detach", clone, "HEAD"], at(repo)),
      () => linkNodeModules({ from: join(repo, "node_modules"), to: join(clone, "node_modules") }),
      () => stageAgentOrg({ toolRepo, scratch, copied, root: clone, stdio: ["ignore", log, log] }),
      () => shAsync("node", ["--import", "tsx", "--test", "packages/agent-org/src/**/*.test.ts",
        "packages/agent-org/src/**/*.test.mjs"], at(clone)),
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
  if (existsSync(clone)) await shAsync("git", ["worktree", "remove", "--force", clone], { cwd: repo, log });
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
 * @typedef {{ ciYml: string, base: string, branch: string, body: string | null, files: string[] }} StepContext
 * @param {string} id
 * @param {StepContext} ctx
 */
function runStep(id, ctx) {
  const runners = /** @type {Record<string, () => string>} */ ({
    changed: () => "pass",
    ts: () => runTs(ctx),
    python: () => runPython(),
    rulesFitness: () => (pnpm(["run", "rules-check"]).status === 0 ? "pass" : "fail"),
    changeset: () => runChangeset(ctx),
    guardSweep: () => (pnpm(["run", "guards:sweep"]).status === 0 ? "pass" : "fail"),
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
  return { status: runStep(step.id, ctx), ms: Date.now() - started, output: "" };
}

async function main() {
  refuseUnknownFlags(["--base", "--draft-body", "--check"], { entry: import.meta.url, command: "pnpm run verify" });
  const base = flagValue(process.argv, "base") ?? process.env.A11Y_TEST_BASE ?? "origin/main";
  const body = readBody(flagValue(process.argv, "draft-body"));
  const head = git(["rev-parse", "HEAD"]);
  if (process.argv.includes("--check")) return report(stampVerdict({ stamp: readStamp(), head, body }));

  const files = changedFiles([`${base}...HEAD`], { repoRoot: REPO });
  if (files.length === 0) {
    console.error(`verify: "git diff ${base}...HEAD" returned nothing -- an empty diff or a wrong --base. CI refuses the same way.`);
    return 2;
  }
  const started = Date.now();
  const dirty = git(["status", "--porcelain"]) !== "";
  const packages = knownPackages(REPO);
  const classification = classify(files, packages, readWorkspaceDependencyGraph(REPO, packages),
    { repoRoot: REPO, getPackedFiles: packedFiles });
  const ctx = { ciYml: readFileSync(join(REPO, ".github/workflows/ci.yml"), "utf8"), base, body, files,
    branch: git(["rev-parse", "--abbrev-ref", "HEAD"]) };
  const steps = await runAllSteps({ classification, ctx });
  const wallMs = Date.now() - started;
  const endedDirty = dirty || git(["status", "--porcelain"]) !== "";
  const stamp = { head, dirty: endedDirty, bodyHash: bodyHash(body), steps, wallMs, at: new Date().toISOString() };
  writeFileSync(stampPath(), `${JSON.stringify(stamp, null, 2)}\n`);
  process.stdout.write(`\nverify: ${minutes(wallMs)} wall, against CI's median ${minutes(CI_MEDIAN_MS)} `
    + "(a measurement, not a target)\n");
  return report(stampVerdict({ stamp, head, body }));
}

/** @param {{ green: boolean, reasons: string[] }} verdict */
function report({ green, reasons }) {
  process.stdout.write(green ? "verify: GREEN for this head and body\n"
    : `verify: RED\n${reasons.map((reason) => `  - ${reason}`).join("\n")}\n`);
  return green ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  process.exit(await main());
}
