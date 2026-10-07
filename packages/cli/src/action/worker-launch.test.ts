// HOW THE ACTION STARTS THE CAPTURE WORKER (#3829): by a path the layer's `IS_MAIN` accepts, and a poll that ends when the process does.
//
// `@a11ign/screenreader-worker`'s server.mjs listens only `if (IS_MAIN)`, with `IS_MAIN = import.meta.url === pathToFileURL(process.argv[1]).href`.
// Node resolves a link BEFORE it sets `import.meta.url` and leaves `argv[1]` as typed, and under pnpm `node_modules/@a11ign/*` IS a link, so the
// bare path exits silently without listening — empty stdout, empty stderr, and a 15-minute poll against a dead pid in 3 of 4 release runs.
//
// This reads `action.yml` and RUNS the launch-and-poll lines of the "Capture and judge" step under bash, against a stub server carrying the
// layer's own `IS_MAIN` expression, laid out the way pnpm lays it out (a real directory and a link to it). So what is tested is the YAML a
// consumer gets, and the stub is the one thing standing in for a package this workspace does not contain.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parse } from "yaml";

const ROOT = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "../../../..");
const PACKAGE_SERVER = "node_modules/@a11ign/screenreader-worker/dist/server.mjs";
const MS_PER_SECOND = 1000;
const DEAD_WORKER_LIMIT_SECONDS = 30; // a dead pid ends the poll within a tick or two, not at the 3-minute budget
const POLL_BUDGET_MS = 90_000; // far under the 360 x (0.5 s + curl) the poll would otherwise spend, far over a healthy start

interface Step { name?: string; env?: Record<string, string>; run?: string }
const action = parse(readFileSync(resolve(ROOT, "action.yml"), "utf8")) as { runs: { steps: Step[] } };
const capture = action.runs.steps.find((candidate) => candidate.name === "Capture and judge");
assert.ok(capture?.run, "no step named Capture and judge");

/** From the realpath line to the `worker ready` echo: the launch and the poll, and none of the capture that follows. */
function launchAndPoll(): string {
  const run = capture?.run as string;
  const start = run.indexOf("worker_js=$(");
  const endMarker = 'echo "worker ready"';
  const end = run.indexOf(endMarker);
  assert.ok(start >= 0 && end > start, "the launch lines moved: this test slices from `worker_js=$(` to `echo \"worker ready\"`");
  return run.slice(start, end + endMarker.length);
}

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((done) => probe.listen(0, "127.0.0.1", done));
  const { port } = probe.address() as { port: number };
  await new Promise((done) => probe.close(done));
  return port;
}

/** The layer's entry-point test, verbatim, then a /health that says ready. */
const STUB_WORKER = `import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
const IS_MAIN = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (IS_MAIN) createServer((_, res) => res.end('{"ok":true,"ready":true}')).listen(Number(process.env.A11Y_PORT), "127.0.0.1");
`;

/** pnpm's layout: the package's files in a real directory, and `node_modules/@a11ign/screenreader-worker` a link to it. */
function laidOut(serverSource: string): string {
  const project = mkdtempSync(join(tmpdir(), "worker-launch-"));
  const real = join(project, ".store", "screenreader-worker");
  mkdirSync(join(real, "dist"), { recursive: true });
  writeFileSync(join(real, "dist", "server.mjs"), serverSource);
  mkdirSync(join(project, "node_modules", "@a11ign"), { recursive: true });
  symlinkSync(real, join(project, "node_modules", "@a11ign", "screenreader-worker"), "dir");
  return project;
}

async function runStep(project: string) {
  const port = await freePort();
  const started = Date.now();
  const ran = spawnSync("bash", ["-eo", "pipefail", "-c", launchAndPoll()], {
    cwd: project, encoding: "utf8", timeout: POLL_BUDGET_MS,
    env: { PATH: process.env.PATH ?? "", RUNNER_TEMP: project, A11Y_WORKER: `http://127.0.0.1:${port}`, A11Y_PORT: String(port) },
  });
  return { code: ran.status, out: ran.stdout, err: ran.stderr, seconds: (Date.now() - started) / MS_PER_SECOND };
}

test("the step carries A11Y_WORKER, which the poll reads, and no bare path to the package's server.mjs survives", () => {
  assert.equal(capture?.env?.A11Y_WORKER, "http://127.0.0.1:8765");
  const bare = new RegExp(`node\\s+${PACKAGE_SERVER.replace(/[./]/g, "\\$&")}`);
  assert.doesNotMatch(capture?.run as string, bare, "the worker is launched by a link: IS_MAIN is false and it never listens (#3829)");
  assert.match(readFileSync(resolve(ROOT, "package.json"), "utf8"), /"worker": ".*realpathSync\('node_modules\/@a11ign\/screenreader-worker\/dist\/server\.mjs'\)/);
});

test("POSITIVE CONTROL: through a pnpm-style link the bare path exits silently without listening, so the layout does bite", async () => {
  const project = laidOut(STUB_WORKER);
  try {
    const port = await freePort();
    const bare = spawnSync("node", [PACKAGE_SERVER], { cwd: project, encoding: "utf8", timeout: POLL_BUDGET_MS, env: { PATH: process.env.PATH ?? "", A11Y_PORT: String(port) } });
    assert.equal(bare.status, 0, "IS_MAIN false is a clean exit, which is why the run's logs were empty");
    assert.equal(bare.stdout + bare.stderr, "");
  } finally { rmSync(project, { recursive: true, force: true }); }
});

test("launched through the link by the step's own lines, the worker listens and the poll sees it ready", async () => {
  const project = laidOut(STUB_WORKER);
  try {
    const result = await runStep(project);
    assert.equal(result.code, 0, result.err);
    assert.match(result.out, /worker ready/);
  } finally { rmSync(project, { recursive: true, force: true }); }
});

test("a worker that exits before it is ready ends the poll at once, printing its status and its output", async () => {
  const project = laidOut(`console.log("about to fail"); console.error("no NVDA"); process.exit(3);\n`);
  try {
    const result = await runStep(project);
    assert.equal(result.code, 1);
    assert.match(result.err, /exited with status 3 before it became ready/);
    assert.doesNotMatch(result.err, /never became ready/);
    assert.match(result.out, /about to fail/);
    assert.match(result.out, /no NVDA/);
    assert.ok(result.seconds < DEAD_WORKER_LIMIT_SECONDS, `the poll ran ${result.seconds} s against a dead pid`);
  } finally { rmSync(project, { recursive: true, force: true }); }
});

test("a worker that stays up but never answers still fails with the old message once the budget is spent", () => {
  const poll = capture?.run as string;
  assert.match(poll, /seq 1 360/);
  assert.match(poll, /The capture worker never became ready\. Last \/health: \$health/);
});
