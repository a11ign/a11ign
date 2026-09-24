// THE REAL CLI PROCESS, AN AUTHENTICATED RUN (ADR 0038, PR 7): every refusal, and the containment, against a fake worker.
//
// This is the row's clause 6 at the level a person meets it: a run that is refused ends in a NAMED error, a non-zero exit, and NO
// report — nothing on stdout, no `runs/witness` file, nothing sent to the worker — and a run that succeeds writes and prints
// nothing that holds the credential. The judge needs a Python scorer this suite cannot assume, so the success case asserts
// what happens BEFORE it: the redaction is disclosed, and the artifact (written before judging, exactly so a bad run leaves
// something to send) is scrubbed on disk.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "../../../..");
const FAKE_USER = "canaryuser6d3f2a";
const FAKE_SECRET = "canarysecretb81c94";
const ORIGIN = "https://app.example.test";
const FLOWS = `
version: 1
origin: ${ORIGIN}
flows:
  login:
    steps:
      - goto: /login
      - fill: { field: "Email address", from-env: APP_USER }
      - fill: { field: "Password", from-env: APP_PASSWORD }
      - press: "Sign in"
      - expect: { heading: "Dashboard" }
`;
const URL_UNDER_TEST = `${ORIGIN}/orders`;

interface Workspace { dir: string; flows: string; artifactRoot: string; event: string }
function workspace(): Workspace {
  const dir = mkdtempSync(join(tmpdir(), "authenticated-run-"));
  const flows = join(dir, "flows.yml");
  const event = join(dir, "event.json");
  writeFileSync(flows, FLOWS);
  return { dir, flows, artifactRoot: join(dir, "artifacts"), event };
}
const written = (w: Workspace): string[] => (existsSync(join(w.artifactRoot, "witness")) ? readdirSync(join(w.artifactRoot, "witness")) : []);

/** A worker on loopback that records what it is sent and answers with `respond`. */
async function fakeWorker(respond: (body: { url: string }) => { status: number; body: unknown }) {
  const requests: Array<Record<string, unknown>> = [];
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      if (req.method === "GET" && req.url === "/health") { res.writeHead(200, { "content-type": "application/json" }); return void res.end(JSON.stringify({ ok: true, ready: true })); }
      const body = JSON.parse(raw || "{}") as { url: string };
      requests.push(body);
      const answer = respond(body);
      res.writeHead(answer.status, { "content-type": "application/json" });
      res.end(JSON.stringify(answer.body));
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, requests, close: () => new Promise<void>((done) => { server.close(() => done()); server.closeAllConnections(); }) };
}

interface Ran { code: number | null; out: string; err: string }
function witness(w: Workspace, args: string[], env: Record<string, string | undefined> = {}): Promise<Ran> {
  return new Promise((done) => {
    const child = spawn(process.execPath, ["--import", "tsx", "packages/cli/src/cli.ts", ...args], {
      cwd: ROOT,
      env: { ...process.env, A11Y_RUNS_ROOT: w.artifactRoot, APP_USER: FAKE_USER, APP_PASSWORD: FAKE_SECRET, JUDGE_BACKEND: "local", A11Y_WORKER: undefined,
        GITHUB_ACTIONS: undefined, GITHUB_EVENT_PATH: undefined, ...env } as NodeJS.ProcessEnv,
    });
    let out = ""; let err = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("close", (code) => done({ code, out, err }));
  });
}

const auth = (w: Workspace, worker: string, extra: string[] = []) =>
  [URL_UNDER_TEST, "--worker", worker, "--flows", w.flows, "--login-flow", "login", "--no-axe", "--json", ...extra];

const CLEAN = ["Dashboard", "Orders, heading level 1", "Sign out, link"];
const okResponse = (transcript: string[]) => ({ status: 200, body: { url: URL_UNDER_TEST, screenReader: "NVDA", transcript, authApplied: true, structure: { headings: [], landmarks: [], formFields: [] } } });

/** The row's clause 6: named error, non-zero exit, and NO report. */
function assertNoReport(ran: Ran, w: Workspace, fault: string) {
  assert.equal(ran.code, 2, `${fault}: expected exit 2, got ${ran.code}\n${ran.err}`);
  assert.match(ran.err, new RegExp(`fault: ${fault}`), ran.err);
  assert.equal(ran.out, "", "no report, no JSON, nothing on stdout");
  assert.deepEqual(written(w), [], "no runs/witness file");
}

const cleanly = async (run: (w: Workspace) => Promise<void>) => {
  const w = workspace();
  try { await run(w); } finally { rmSync(w.dir, { recursive: true, force: true }); }
};

test("REMOTE WORKER + AN AUTH REQUEST: the named error, exit 2, no report, nothing written, and the error reads as the ADR prints it", { timeout: 60_000 }, async () => {
  await cleanly(async (w) => {
    const ran = await witness(w, auth(w, "http://192.0.2.10:8765"));
    assertNoReport(ran, w, "auth-refused-remote-worker");
    assert.match(ran.err, /The worker at 192\.0\.2\.10:8765 is remote, and this run needs to log in/);
    assert.match(ran.err, /What happened: the run asked for authentication and its worker is not on this machine\./);
    assert.match(ran.err, /See: docs\/adr\/0038-authenticated-capture\.md, Constraint 1\./);
  });
});

test("every resolution refusal ends the run before the worker is asked for anything: missing, too short, wrong origin, half the flags, the judge, a public repository", { timeout: 240_000 }, async () => {
  await cleanly(async (w) => {
    const worker = await fakeWorker(() => okResponse(CLEAN));
    try {
      assertNoReport(await witness(w, auth(w, worker.url), { APP_PASSWORD: undefined }), w, "auth-credential-missing");
      assertNoReport(await witness(w, auth(w, worker.url), { APP_USER: "admin" }), w, "auth-credential-too-short");
      assertNoReport(await witness(w, auth(w, worker.url), { JUDGE_BACKEND: "anthropic" }), w, "auth-refused-judge-backend");
      writeFileSync(w.event, JSON.stringify({ repository: { private: false } }));
      assertNoReport(await witness(w, auth(w, worker.url), { GITHUB_ACTIONS: "true", GITHUB_EVENT_PATH: w.event }), w, "auth-refused-public-repository");
      const otherSite = await witness(w, [`https://production.example.test/orders`, "--worker", worker.url, "--flows", w.flows, "--login-flow", "login", "--no-axe"]);
      assert.equal(otherSite.code, 2, otherSite.err);
      assert.match(otherSite.err, /rule: origin-pinned/);
      assert.equal(otherSite.out, "");
      const half = await witness(w, [URL_UNDER_TEST, "--worker", worker.url, "--flows", w.flows, "--no-axe"]);
      assert.equal(half.code, 2, half.err);
      assert.match(half.err, /--flows needs --login-flow/);
      assert.equal(worker.requests.length, 0, "the worker was never asked for anything: every refusal came first");
      assert.deepEqual(written(w), []);
    } finally { await worker.close(); }
  });
});

test("the override lets a non-local judge through resolution and the vendor is named on stderr BEFORE the judge runs", { timeout: 60_000 }, async () => {
  await cleanly(async (w) => {
    const worker = await fakeWorker(() => okResponse(CLEAN));
    try {
      const ran = await witness(w, auth(w, worker.url, ["--send-authenticated-transcript-to-judge-vendor"]), { JUDGE_BACKEND: "anthropic", ANTHROPIC_API_KEY: "x" });
      assert.match(ran.err, /the transcript will be sent to the judge vendor "anthropic"/);
      assert.equal(worker.requests.length >= 1, true, "past resolution: the capture was asked for");
      assert.doesNotMatch(ran.err, /auth-refused-judge-backend/);
    } finally { await worker.close(); }
  });
});

test("A RESPONSE WITHOUT authApplied is auth-not-applied: exit 2, no report, nothing written", { timeout: 60_000 }, async () => {
  await cleanly(async (w) => {
    const worker = await fakeWorker(() => ({ status: 200, body: { url: URL_UNDER_TEST, screenReader: "NVDA", transcript: ["Sign in, heading level 1"] } }));
    try {
      assertNoReport(await witness(w, auth(w, worker.url)), w, "auth-not-applied");
      assert.equal(worker.requests.length, 1, "the local worker WAS sent the request; only its answer is refused");
    } finally { await worker.close(); }
  });
});

test("an authenticated request turns automatic pressing OFF on the wire, whatever was asked, and says so", { timeout: 60_000 }, async () => {
  await cleanly(async (w) => {
    const worker = await fakeWorker(() => okResponse(CLEAN));
    try {
      const ran = await witness(w, auth(w, worker.url, ["--probe-forms"]));
      const sent = worker.requests[0] as { probeForms: boolean; probeNavigation: boolean; probeFocus: boolean; auth: { login: unknown[] } };
      assert.equal(sent.probeForms, false, "--probe-forms was given, and an authenticated run presses only what its files name");
      assert.equal(sent.probeNavigation, false, "the first link is off (it may be Sign out)");
      assert.equal(sent.probeFocus, true, "Tab activates nothing, so it is unchanged");
      assert.equal(sent.auth.login.length, 5);
      assert.ok(!JSON.stringify(sent).includes(FAKE_USER) && !JSON.stringify(sent).includes(FAKE_SECRET), "the request carries the variable NAMES and no value");
      assert.match(ran.err, /automatic pressing and link-following are off; this run will press only what your flows and forms config name\./);
      assert.match(ran.err, /this run will perform 1 login \(one per capture; more if a capture has to be repeated\)/);
    } finally { await worker.close(); }
  });
});

test("CONTAINMENT: a value the page echoed is redacted, the count is disclosed, and NOTHING on disk or on either stream holds it", { timeout: 60_000 }, async () => {
  await cleanly(async (w) => {
    const echoed = [...CLEAN, `Username, edit, ${FAKE_USER}`, `Signed in with ${FAKE_SECRET}`];
    const worker = await fakeWorker(() => okResponse(echoed));
    try {
      const ran = await witness(w, auth(w, worker.url));
      assert.match(ran.err, /2 announcements contained a value from your login and were redacted\./);
      const files = written(w);
      assert.equal(files.length, 1, "the artifact is written before judging, so a run that later fails still leaves it");
      const artifact = readFileSync(join(w.artifactRoot, "witness", files[0]), "utf8");
      assert.ok(!artifact.includes(FAKE_USER) && !artifact.includes(FAKE_SECRET), "the artifact on disk holds no credential");
      assert.ok(artifact.includes("Username, edit, ‹credential›"));
      assert.ok(!(ran.out + ran.err).includes(FAKE_USER) && !(ran.out + ran.err).includes(FAKE_SECRET), "neither stream holds one");
    } finally { await worker.close(); }
  });
});

test("CONTAINMENT: a spelled-out credential in the transcript ends the run — auth-credential-in-artifact, exit 2, NOTHING written or printed", { timeout: 60_000 }, async () => {
  await cleanly(async (w) => {
    const worker = await fakeWorker(() => okResponse([...CLEAN, ...FAKE_USER.split("")]));
    try {
      const ran = await witness(w, auth(w, worker.url));
      assertNoReport(ran, w, "auth-credential-in-artifact");
      assert.match(ran.err, /Nothing was written and nothing was printed/);
      assert.match(ran.err, /spelled out one character at a time/);
      assert.ok(!ran.err.includes(FAKE_USER), "the refusal names the variable and never the value");
    } finally { await worker.close(); }
  });
});

test("a run that asks for no authentication is unchanged: no flows, no notices, no scrub, and the transcript is kept as it was", { timeout: 60_000 }, async () => {
  await cleanly(async (w) => {
    const worker = await fakeWorker(() => ({ status: 200, body: { url: URL_UNDER_TEST, screenReader: "NVDA", transcript: [...CLEAN, FAKE_USER, "Home"], structure: { headings: [], landmarks: [], formFields: [] } } }));
    try {
      const ran = await witness(w, [URL_UNDER_TEST, "--worker", worker.url, "--no-axe", "--json"]);
      assert.doesNotMatch(ran.err, /authenticated run:|contained a value from your login/);
      const files = written(w);
      assert.equal(files.length, 1);
      const artifact = readFileSync(join(w.artifactRoot, "witness", files[0]), "utf8");
      assert.ok(artifact.includes(FAKE_USER), "with no login there is nothing to scrub: a page that says a string keeps saying it");
      const sent = worker.requests[0] as Record<string, unknown>;
      assert.ok(!("auth" in sent), "no auth field on an ordinary request");
    } finally { await worker.close(); }
  });
});
