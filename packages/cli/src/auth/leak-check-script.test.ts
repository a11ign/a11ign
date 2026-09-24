// THE WHOLE SCRIPT, `npm run auth:leak-check`, AGAINST A FAKE WORKER: the ADR's three commands and their exit codes.
//
// The real proof needs a Windows worker with NVDA (PR 6's acceptance, on a fleet machine). This is what can be proven
// without one: that the script serves its fixture, asks the worker for an authenticated capture the way the product
// does, and turns what comes back into the contract's exit codes. The fake worker is not canned. It LOGS IN over HTTP to
// the fixture the script started, with the credential it was given, fetches the signed-in page, and reports that page's
// text as announcements (headings, labels, and an edit field's value) — so `login-echo` really echoes the username and
// `login-quiet` really does not, and a fixture that stopped doing either would fail here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";

const FAKE_USER = "canaryuser6d3f2a";
const FAKE_SECRET = "canarysecretb81c94";
const ROOT = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "../../../..");

/** The page's text as a screen reader would give it: headings, labels, links, and a field's value. Crude and enough. */
function announcementsOf(html: string): string[] {
  const out: string[] = [];
  for (const [, tag, text] of html.matchAll(/<(h[1-6]|label|a|p)[^>]*>([^<]*)</g)) if (text.trim()) out.push(tag.startsWith("h") ? `${text.trim()}, heading` : text.trim());
  for (const [, value] of html.matchAll(/<input[^>]*type="text"[^>]*value="([^"]*)"/g)) out.push(`Username, edit, ${value}`);
  return out;
}

/** A worker on loopback that performs the login for real, over HTTP, against whatever fixture the request names. */
async function fakeWorker(options: { authApplied?: boolean; empty?: boolean } = {}) {
  const requests: Array<{ url: string; auth: unknown }> = [];
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", async () => {
      if (req.method === "GET" && req.url === "/health") { res.writeHead(200, { "content-type": "application/json" }); return void res.end(JSON.stringify({ ok: true, ready: true })); }
      const body = JSON.parse(raw || "{}") as { url: string; auth: { login: Array<Record<string, unknown>> } };
      requests.push({ url: body.url, auth: body.auth });
      const site = new URL(body.url).origin;
      const fixture = new URL(body.url).pathname.split("/")[1];
      const login = await fetch(`${site}/${fixture}/login`, {
        method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ user: FAKE_USER, password: FAKE_SECRET }),
      });
      const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
      const account = await (await fetch(body.url, { headers: { cookie } })).text();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        url: body.url, screenReader: "NVDA", transcript: options.empty ? [] : announcementsOf(account),
        ...(options.authApplied === false ? {} : { authApplied: true }),
      }));
    });
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, requests, close: () => new Promise<void>((done) => { server.close(() => done()); server.closeAllConnections(); }) };
}

interface Ran { code: number | null; out: string; err: string }

function runScript(args: string[], env: Record<string, string | undefined> = { FAKE_USER, FAKE_SECRET }): Promise<Ran> {
  return new Promise((done) => {
    const child = spawn(process.execPath, ["--import", "tsx", "scripts/auth-leak-check.mjs", ...args], {
      cwd: ROOT, env: { ...process.env, FAKE_USER: undefined, FAKE_SECRET: undefined, ...env } as NodeJS.ProcessEnv,
    });
    let out = ""; let err = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("close", (code) => done({ code, out, err }));
  });
}

const args = (fixture: string, stage: string, worker: string) =>
  ["--fixture", fixture, "--stage", stage, "--user-env", "FAKE_USER", "--secret-env", "FAKE_SECRET", "--worker", worker];

test("COMMAND 1: the quiet fixture, --stage written: exit 0 and a non-zero examined count", { timeout: 90_000 }, async () => {
  const worker = await fakeWorker();
  try {
    const ran = await runScript(args("login-quiet", "written", worker.url));
    assert.equal(ran.code, 0, ran.out + ran.err);
    assert.match(ran.out, /examined 1 file and [1-9]\d* announcements/);
    assert.match(ran.out, /CLEAN/);
    assert.equal(worker.requests.length, 1);
    // The request the script sent is the product's own: the login flow, with variable NAMES and never a value.
    const sent = JSON.stringify(worker.requests[0].auth);
    assert.ok(sent.includes('"fromEnv":"FAKE_USER"') && sent.includes('"fromEnv":"FAKE_SECRET"'));
    assert.ok(!sent.includes(FAKE_USER) && !sent.includes(FAKE_SECRET), "the request carries no credential value");
  } finally { await worker.close(); }
});

test("COMMAND 2: the echoing fixture, --stage raw: EXACTLY exit 1", { timeout: 90_000 }, async () => {
  const worker = await fakeWorker();
  try {
    const ran = await runScript(args("login-echo", "raw", worker.url));
    assert.equal(ran.code, 1, ran.out + ran.err);
    assert.match(ran.out, /LEAK: FAKE_USER/);
    assert.ok(!(ran.out + ran.err).includes(FAKE_USER), "the output names the variable and never the value");
  } finally { await worker.close(); }
});

test("COMMAND 3: the echoing fixture, --stage written: exit 0 and a printed redaction count of at least 1", { timeout: 90_000 }, async () => {
  const worker = await fakeWorker();
  try {
    const ran = await runScript(args("login-echo", "written", worker.url));
    assert.equal(ran.code, 0, ran.out + ran.err);
    assert.match(ran.out, /\b[1-9]\d* announcements? contained a value from your login and (were|was) redacted\./);
    assert.match(ran.out, /redaction count: [1-9]/);
    assert.ok(!(ran.out + ran.err).includes(FAKE_USER));
  } finally { await worker.close(); }
});

test("the quiet fixture QUIET and the echo fixture ECHO: the fake worker's own view of the two pages differs by the username", async () => {
  // Not the script: the FIXTURES, through the fake worker. If `login-quiet` ever started showing the username, or
  // `login-echo` stopped, the exit codes above would move for the wrong reason.
  const { startFixtureSite } = await import("../../../../scripts/auth-leak-fixtures.mjs");
  for (const [fixture, expected] of [["login-quiet", false], ["login-echo", true]] as const) {
    const site = await startFixtureSite({ fixture, user: FAKE_USER, secret: FAKE_SECRET });
    try {
      const login = await fetch(`${site.origin}/${fixture}/login`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ user: FAKE_USER, password: FAKE_SECRET }) });
      assert.equal(login.status, 302);
      const page = await (await fetch(`${site.origin}/${fixture}/account`, { headers: { cookie: (login.headers.get("set-cookie") ?? "").split(";")[0] } })).text();
      assert.equal(page.includes(FAKE_USER), expected, fixture);
      assert.ok(!page.includes(FAKE_SECRET));
      // The wall: without the session the account page bounces to the login, so "signed in" is the server's decision.
      const bounced = await fetch(`${site.origin}/${fixture}/account`, { redirect: "manual" });
      assert.equal(bounced.status, 302);
      // A wrong password is not signed in.
      const wrong = await fetch(`${site.origin}/${fixture}/login`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ user: FAKE_USER, password: "wrong" }) });
      assert.equal(wrong.status, 200);
    } finally { await site.close(); }
  }
});

test("EXIT 2 is 'could not examine', never a pass: no worker, no variable, a bad flag, an empty capture, a worker that did not log in", { timeout: 120_000 }, async () => {
  const dead = await runScript(args("login-quiet", "written", "http://127.0.0.1:1"));
  assert.equal(dead.code, 2, dead.out + dead.err);
  assert.match(dead.err, /Could not reach the capture worker/);
  const noVariable = await runScript(args("login-quiet", "written", "http://127.0.0.1:1"), { FAKE_USER });
  assert.equal(noVariable.code, 2);
  assert.match(noVariable.err, /FAKE_SECRET is not set/);
  const badFlag = await runScript(["--fixture", "login-quiet", "--stag", "raw"]);
  assert.equal(badFlag.code, 2);
  assert.match(badFlag.err, /unknown flag --stag.*did you mean --stage/s);
  const empty = await fakeWorker({ empty: true });
  try {
    const ran = await runScript(args("login-quiet", "written", empty.url));
    assert.equal(ran.code, 2, ran.out + ran.err);
    assert.match(ran.out, /COULD NOT EXAMINE/);
  } finally { await empty.close(); }
  const unacknowledged = await fakeWorker({ authApplied: false });
  try {
    const ran = await runScript(args("login-quiet", "raw", unacknowledged.url));
    assert.equal(ran.code, 2, "a worker that never said authApplied is auth-not-applied, and that is 'could not run'");
    assert.match(ran.err, /auth-not-applied/);
  } finally { await unacknowledged.close(); }
});
