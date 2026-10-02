/**
 * #2975 (cut-over 4 of 6): THE TOOL IS RUN FROM WHERE IT LIVES, AND EVERY WORKFLOW JOB THAT RUNS IT HAS BEEN GIVEN IT.
 *
 * `scripts/agent-org.mjs` finds the tool (`a11ign/agent-org`) and runs one of its programs; `.github/actions/agent-org` puts that tool on a
 * runner and writes the host declaration it reads. Three things can silently stop being true, and each is pinned below:
 *
 *   1. THE LAUNCHER GUESSES. It must refuse by name when the tool is not where the declaration says (chairman, 2026-09-24: no fallback), and it
 *      must pass the arguments, the exit code and `AGENT_ORG_HOST` through, because a program that "ran" with the wrong exit code is the defect
 *      the cut-over exists to avoid.
 *   2. A JOB RUNS THE LAUNCHER WITH NO TOOL BESIDE IT. A job that calls `node scripts/agent-org.mjs ...` and never used the composite action
 *      fails at the first run, on a runner nobody is watching. The population is DERIVED from the workflow files, not named.
 *   3. A WORKFLOW REACHES BACK INTO `packages/agent-org/`, which row #2976 deletes.
 *
 * EACH GUARD'S POSITIVE CONTROL IS IN THIS FILE: a synthetic workflow the SAME function refuses, and an assertion that the real population is
 * not empty, so "no offenders" cannot be a statement about nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { ToolNotFound, toolDirectory, toolProgram } from "../../../../scripts/agent-org.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const LAUNCHER = join(REPO_ROOT, "scripts/agent-org.mjs");
const COMPOSITE_USE = "./.github/actions/agent-org";
const EXIT_PROBE = 7;
const EXIT_REFUSED = 2;

/** A directory deleted when `body` returns, whether it throws or not. */
function inTemp<T>(body: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "agent-org-launcher-"));
  try {
    return body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A tool checkout holding one program, `probe.mjs`, which reports what the launcher handed it and exits `EXIT_PROBE`. */
function fixtureTool(dir: string) {
  const tool = join(dir, "tool");
  mkdirSync(join(tool, "src"), { recursive: true });
  writeFileSync(join(tool, "src/probe.mjs"),
    `console.log(JSON.stringify({ args: process.argv.slice(2), host: process.env.AGENT_ORG_HOST }));\nprocess.exit(${EXIT_PROBE});\n`);
  return tool;
}

function hostFile(dir: string, body: unknown) {
  const path = join(dir, "host.json");
  writeFileSync(path, typeof body === "string" ? body : JSON.stringify(body));
  return path;
}

/** The launcher as a process, with only the variables named here (no inherited `AGENT_ORG_*`). */
function launch(args: string[], env: Record<string, string>) {
  const clean = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" };
  return spawnSync(process.execPath, [LAUNCHER, ...args], { encoding: "utf8", env: { ...clean, ...env } });
}

test("the tool is found through `$AGENT_ORG_TOOL` first, then the host declaration's `tool` key", () => inTemp((dir) => {
  const tool = fixtureTool(dir);
  const other = join(dir, "other");
  mkdirSync(join(other, "src"), { recursive: true });
  const host = hostFile(dir, { tool: other });
  assert.equal(toolDirectory({ env: { AGENT_ORG_TOOL: tool, AGENT_ORG_HOST: host }, checkout: dir }), tool, "the variable outranks the file");
  assert.equal(toolDirectory({ env: { AGENT_ORG_HOST: host }, checkout: dir }), other, "the declaration's key, when no variable says");
  assert.equal(toolProgram("probe.mjs", { env: { AGENT_ORG_TOOL: tool }, checkout: dir }), join(tool, "src/probe.mjs"));
}));

test("a host file that names no tool, or a tool that is not there, REFUSES by name and never guesses a sibling directory", () => inTemp((dir) => {
  const noTool = hostFile(dir, { primary: "a11ign" });
  assert.throws(() => toolDirectory({ env: { AGENT_ORG_HOST: noTool }, checkout: dir }), (e: unknown) => e instanceof ToolNotFound && e.message.includes(noTool) && e.message.includes("`tool`"));
  assert.throws(() => toolDirectory({ env: { AGENT_ORG_HOST: hostFile(dir, { tool: "relative/path" }) }, checkout: dir }), ToolNotFound, "a relative tool is refused");
  assert.throws(() => toolDirectory({ env: { AGENT_ORG_HOST: hostFile(dir, "not json") }, checkout: dir }), /cannot be read as JSON/);
  assert.throws(() => toolDirectory({ env: { AGENT_ORG_TOOL: join(dir, "nowhere") }, checkout: dir }), /has no src\//);
  // The sibling directory a guess would find: it exists, and it must NOT be used.
  mkdirSync(join(dir, "agent-org/src"), { recursive: true });
  assert.throws(() => toolDirectory({ env: { AGENT_ORG_HOST: noTool }, checkout: join(dir, "checkout") }), ToolNotFound, "a sibling `agent-org` directory is not a declaration");
}));

test("a program name that climbs out of `src/`, or names nothing, is refused", () => inTemp((dir) => {
  const where = { env: { AGENT_ORG_TOOL: fixtureTool(dir) }, checkout: dir };
  assert.throws(() => toolProgram("../../etc/passwd", where), /not inside the tool's src/);
  assert.throws(() => toolProgram("absent.mjs", where), /does not exist in the tool checkout/);
  assert.ok(toolProgram("probe.mjs", where).endsWith("probe.mjs"), "the control: a real program resolves");
}));

test("the launcher passes the arguments and the EXIT CODE through, and sets `AGENT_ORG_HOST` only when the caller left it empty", () => inTemp((dir) => {
  const tool = fixtureTool(dir);
  const defaulted = launch(["probe.mjs", "--a=1", "b"], { AGENT_ORG_TOOL: tool });
  assert.equal(defaulted.status, EXIT_PROBE, defaulted.stderr);
  const seen = JSON.parse(defaulted.stdout);
  assert.deepEqual(seen.args, ["--a=1", "b"]);
  assert.equal(seen.host, join(REPO_ROOT, ".agent-org/host.json"), "the declaration this checkout carries");

  const explicit = launch(["probe.mjs"], { AGENT_ORG_TOOL: tool, AGENT_ORG_HOST: "/declared/by/the/caller.json" });
  assert.equal(JSON.parse(explicit.stdout).host, "/declared/by/the/caller.json", "the caller's own value is kept");
}));

test("the launcher exits 2, naming the cause, when there is no tool or no program", () => inTemp((dir) => {
  const missing = launch(["probe.mjs"], { AGENT_ORG_TOOL: join(dir, "nowhere") });
  assert.equal(missing.status, EXIT_REFUSED);
  assert.match(missing.stderr, /agent-org launcher: .*has no src\//);
  const none = launch([], { AGENT_ORG_TOOL: fixtureTool(dir) });
  assert.equal(none.status, EXIT_REFUSED);
  assert.match(none.stderr, /usage: node scripts\/agent-org\.mjs/);
}));

// --- the workflows ------------------------------------------------------------------------------------------------------------------------

type Step = { uses?: string; run?: string };
type Job = { steps?: Step[] };
type Workflow = { jobs?: Record<string, Job> };

const workflowFiles = () => readdirSync(join(REPO_ROOT, ".github/workflows")).filter((f) => f.endsWith(".yml")).sort();
const readWorkflow = (file: string) => readFileSync(join(REPO_ROOT, ".github/workflows", file), "utf8");

/** Jobs that run the launcher with no composite step before the first such run. Each entry names the file and job. */
function jobsRunningTheToolWithoutIt(name: string, text: string): string[] {
  const workflow = parse(text) as Workflow;
  return Object.entries(workflow.jobs ?? {}).flatMap(([jobName, job]) => {
    const steps = job.steps ?? [];
    const firstRun = steps.findIndex((s) => /scripts\/agent-org\.mjs/.test(s.run ?? ""));
    if (firstRun < 0) return [];
    const provided = steps.findIndex((s) => s.uses === COMPOSITE_USE);
    return provided >= 0 && provided < firstRun ? [] : [`${name}#${jobName}`];
  });
}

/** Lines that are not comments and name the deleted directory. */
function liveReachesIntoTheOldCopy(text: string): string[] {
  return text.split("\n").filter((l) => !l.trimStart().startsWith("#") && l.includes("packages/agent-org/"));
}

const TOOLLESS = `
jobs:
  runs-the-tool:
    steps:
      - uses: actions/checkout@v4
      - run: node scripts/agent-org.mjs merge-guard.mjs
  provided-too-late:
    steps:
      - run: node scripts/agent-org.mjs merge-guard.mjs
      - uses: ${COMPOSITE_USE}
  fine:
    steps:
      - uses: ${COMPOSITE_USE}
      - run: node scripts/agent-org.mjs merge-guard.mjs
  does-not-run-it:
    steps:
      - run: echo hello
`;

test("CONTROL: the guard refuses a job with no composite step and one that has it AFTER the first run, and passes the others", () => {
  assert.deepEqual(jobsRunningTheToolWithoutIt("x.yml", TOOLLESS), ["x.yml#runs-the-tool", "x.yml#provided-too-late"]);
});

test("every workflow job that runs the launcher got the tool first", () => {
  const files = workflowFiles();
  const running = files.flatMap((f) => {
    const jobs = (parse(readWorkflow(f)) as Workflow).jobs ?? {};
    return Object.entries(jobs).filter(([, job]) => (job.steps ?? []).some((s) => /scripts\/agent-org\.mjs/.test(s.run ?? ""))).map(([n]) => `${f}#${n}`);
  });
  // The population is not empty, and it holds the jobs this row repointed: an emptiness assertion with its control beside it.
  for (const known of ["ci.yml#deliberateRefusals", "ci.yml#ownedPaths", "reusable-acceptance.yml#run", "trunk.yml#closeRows", "auto-arm.yml#sweep"]) {
    assert.ok(running.includes(known), `${known} is expected to run the launcher; found ${running.length} jobs`);
  }
  assert.deepEqual(files.flatMap((f) => jobsRunningTheToolWithoutIt(f, readWorkflow(f))), []);
});

test("CONTROL: the reach detector finds a live line and skips a comment", () => {
  assert.deepEqual(liveReachesIntoTheOldCopy("run: node packages/agent-org/src/x.mjs\n# node packages/agent-org/src/y.mjs\n"), ["run: node packages/agent-org/src/x.mjs"]);
});

test("no workflow runs a program from `packages/agent-org/`, which row #2976 deletes", () => {
  const offenders = workflowFiles().flatMap((f) => liveReachesIntoTheOldCopy(readWorkflow(f)).map((l) => `${f}: ${l.trim()}`));
  assert.deepEqual(offenders, []);
});

// --- the composite action -----------------------------------------------------------------------------------------------------------------

type Action = { inputs?: Record<string, { default?: string }>; runs?: { using?: string; steps?: Array<{ shell?: string; run?: string }> } };
const action = parse(readFileSync(join(REPO_ROOT, ".github/actions/agent-org/action.yml"), "utf8")) as Action;

test("the composite action fetches one ref OUTSIDE the workspace, declares the project, and exports both variables the launcher reads", () => {
  assert.equal(action.runs?.using, "composite");
  assert.equal(action.inputs?.ref?.default, "main", "ADR 0040 decision 3: the tool tracks main; the ref is the one place to hold it still");
  const [step] = action.runs?.steps ?? [];
  assert.equal(step?.shell, "bash");
  const run = step?.run ?? "";
  assert.match(run, /set -euo pipefail/);
  assert.match(run, /tool="\$\{RUNNER_TEMP:\?\}\/agent-org-tool"/, "outside the workspace, and `:?` so an empty variable cannot make the path `/agent-org-tool`");
  assert.match(run, /\$\{GITHUB_WORKSPACE:\?\}/);
  assert.match(run, /echo "AGENT_ORG_TOOL=\$tool" >> "\$GITHUB_ENV"/);
  assert.match(run, /echo "AGENT_ORG_HOST=\$host" >> "\$GITHUB_ENV"/);
});

test("the host declaration the action writes keeps every key of the repository's own and rewrites only the checkout, the tool and the clones", (t) => {
  const jq = spawnSync("jq", ["--version"], { encoding: "utf8" });
  if (jq.status !== 0) return t.skip("jq is not installed here; the ubuntu runner has it");
  const run = action.runs?.steps?.[0]?.run ?? "";
  const filter = /jq --arg workspace [^\n]*\\\n\s*'([^']+)'/.exec(run)?.[1];
  assert.ok(filter, "the jq filter was found in the action's own text");
  const result = spawnSync("jq", ["--arg", "workspace", "/runner/work/repo", "--arg", "tool", "/runner/tmp/agent-org-tool", filter, join(REPO_ROOT, ".agent-org/host.json")], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const written = JSON.parse(result.stdout);
  const own = JSON.parse(readFileSync(join(REPO_ROOT, ".agent-org/host.json"), "utf8"));
  assert.equal(written.projects.find((p: { id: string }) => p.id === own.primary).checkout, "/runner/work/repo");
  assert.equal(written.tool, "/runner/tmp/agent-org-tool");
  assert.deepEqual(written.clones, { "agent-org": "/runner/tmp/agent-org-tool" });
  assert.deepEqual({ ...written, projects: null, tool: null, clones: null }, { ...own, projects: null, tool: null, clones: null }, "every other key is the repository's own");
});
