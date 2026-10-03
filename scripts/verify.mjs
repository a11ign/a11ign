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
// WALL TIME is printed beside CI's median as a measurement and not a target (chairman, #3210). If this is slower
// than CI, that is the next row, not a reason to drop a step.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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

/**
 * Files of the agent-org suite that CI SKIPS and this host does not, each with the reason. `live-tree-independence`
 * clones `/home/agent/repos/a11y-witness` at two fixed commits and skips itself when that clone is absent, which it
 * is on a CI runner and is not here, so on this host it runs, and it fails (measured 2026-10-03, alone and with the
 * suite, at a head it cannot read: 4 `acceptance-commands` tests red at both commits). Leaving it in would make
 * `verify` red for every author for a reason CI never sees, and a gate people learn to ignore teaches them to
 * ignore the next one. It is left out of the STAGED COPY only, named on every run, and filed as #3329.
 */
export const HOST_ONLY_AGENT_ORG_TESTS = {
  "live-tree-independence.test.ts": "CI has no /home/agent/repos/a11y-witness clone and skips it; here it runs and fails",
};

const AGENT_ORG_DIR = join(REPO, "packages/agent-org");
const AGENT_ORG_FIXTURE = join(REPO, "packages/lab/src/packaging/board-document-chrome-resolver.test.ts");

/**
 * CI's `agentOrg` job, step for step, on a throwaway copy of the tool at the ref `ci.yml` names. It is a copy of
 * `a11ign/agent-org` placed at `packages/agent-org` and an edit of one fixture's import, so both are undone in
 * `finally`: the fixture is restored from a byte copy (never `git checkout --`, which would take the author's own
 * uncommitted edit with it) and the staged directory is removed.
 * @param {string} ciYml
 */
function runAgentOrg(ciYml) {
  const staging = agentOrgStaging(ciYml);
  const toolRepo = process.env.A11Y_AGENT_ORG_REPO ?? resolve(REPO, "..", "agent-org");
  if (!staging || !existsSync(join(toolRepo, ".git"))) {
    console.error(staging ? `verify: no a11ign/agent-org checkout at ${toolRepo} (set A11Y_AGENT_ORG_REPO)`
      : "verify: ci.yml's agentOrg job no longer has the AGENT_ORG_REF and `cp -r` lines this step reads");
    return "fail";
  }
  const scratch = mkdtempSync(join(tmpdir(), "verify-agent-org-"));
  const fixtureCopy = join(scratch, "fixture.test.ts");
  cpSync(AGENT_ORG_FIXTURE, fixtureCopy);
  try {
    return inOrder([
      () => sh("git", ["-C", toolRepo, "fetch", "--quiet", "origin", staging.ref]),
      () => stageAgentOrg({ toolRepo, scratch, copied: staging.copied }),
      () => sh("node", ["--import", "tsx", "--test", "packages/agent-org/src/**/*.test.ts",
        "packages/agent-org/src/**/*.test.mjs"]),
    ]);
  } finally {
    cpSync(fixtureCopy, AGENT_ORG_FIXTURE);
    sh("git", ["reset", "-q", "--", "packages/agent-org"], { stdio: "ignore" });
    rmSync(AGENT_ORG_DIR, { recursive: true, force: true });
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** Removes the staged copy's host-only files and says so, so the omission is read on every run and not remembered. */
function leaveOutHostOnlyTests() {
  for (const [file, reason] of Object.entries(HOST_ONLY_AGENT_ORG_TESTS)) {
    rmSync(join(AGENT_ORG_DIR, "src/packaging", file), { force: true });
    console.log(`verify: agentOrg leaves out ${file} -- ${reason}`);
  }
  return { status: 0 };
}

/** @param {{ toolRepo: string, scratch: string, copied: string[] }} staging */
function stageAgentOrg({ toolRepo, scratch, copied }) {
  const tarball = join(scratch, "tool.tar");
  rmSync(AGENT_ORG_DIR, { recursive: true, force: true });
  const steps = [
    () => sh("git", ["-C", toolRepo, "archive", "--format=tar", `--output=${tarball}`, "FETCH_HEAD", ...copied]),
    () => sh("mkdir", ["-p", AGENT_ORG_DIR]),
    () => sh("tar", ["-xf", tarball, "-C", AGENT_ORG_DIR]),
    () => leaveOutHostOnlyTests(),
    () => sh("rsync", ["-a", "--ignore-existing", "--exclude=*.test.ts", "--exclude=*.test.mjs",
      "packages/lab/src/packaging/", "packages/agent-org/src/packaging/"]),
    () => sh("sed", ["-i", "s#from \"agent-org/src/board-document.mjs\"#from \"../../../agent-org/src/board-document.mjs\"#",
      AGENT_ORG_FIXTURE]),
    () => sh("git", ["add", "--force", "--intent-to-add", "packages/agent-org"]),
  ];
  return { status: inOrder(steps) === "pass" ? 0 : 1 };
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
    agentOrg: () => runAgentOrg(ctx.ciYml),
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
 * The result of every step, run in `gate`'s order, ALL of them, so an author sees every red at once as CI shows them.
 * @param {{ classification: Record<string, unknown>, ctx: StepContext }} run
 */
function runAllSteps({ classification, ctx }) {
  /** @type {Stamp["steps"]} */
  const results = {};
  for (const step of stepsToRun(classification)) {
    const started = Date.now();
    process.stdout.write(`\nverify: ${step.id} ${step.run ? "..." : "-- CI would skip it for this diff"}\n`);
    const status = step.run ? runStep(step.id, ctx) : "not-needed";
    results[step.id] = { status, ms: Date.now() - started };
    process.stdout.write(`verify: ${step.id} ${status.toUpperCase()} (${minutes(results[step.id].ms)})\n`);
  }
  return results;
}

function main() {
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
  const steps = runAllSteps({ classification, ctx });
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
  process.exit(main());
}
