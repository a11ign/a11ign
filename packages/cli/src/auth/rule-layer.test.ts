// THE RULE LAYER LOGS IN FOR ITSELF (ADR 0038, PR 5), against a REAL browser and the REAL axe.
//
// The claim to prove is not "the interpreter runs" (`interpreter.test.ts` does that over a fake) but the one the ADR is
// about: axe would otherwise examine the LOGIN WALL and report on it as the product. So the control comes first — with no
// login the scan of a protected page describes the sign-in page — and then the same scan with the login describes the
// page behind it, where a violation exists that the login wall does not have.
//
// SKIPS, with its reason, where no browser can be launched (CI's `ts` job has none). `axeAvailable` is the repo's own
// "can the rule layer run here" probe, so the skip is the same decision the product makes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { pageContext } from "../cli.js";
import { AuthError } from "./auth-faults.js";
import { ruleLayerSignIn } from "./rule-layer.js";
import { axeAvailable, scanWithAxe } from "../scan/axe.js";
import type { AuthRequest } from "./refusals.js";

const FAKE_USER = "canaryuser6d3f2a";
const FAKE_SECRET = "canarysecretb81c94";
const ENV = { APP_USER: FAKE_USER, APP_PASSWORD: FAKE_SECRET };

const CAN_RUN = await axeAvailable().catch(() => false);
const SKIP = CAN_RUN ? undefined : "no browser can be launched for the rule layer here (`npx playwright install chromium`); the rule layer's login was NOT exercised";

const html = (title: string, body: string) => `<!doctype html><html lang="en"><head><title>${title}</title></head><body><main>${body}</main></body></html>`;

// An <img> with no alt: axe's `image-alt`. It exists ONLY on the page behind the login.
const DASHBOARD = html("Orders", `<h1>Dashboard</h1><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">`);
const LOGIN_WALL = html("Sign in", `<h1>Sign in</h1><form method="post" action="/login"><label>Email address <input name="user"></label>
  <label>Password <input name="password" type="password"></label><button type="submit">Sign in</button></form>`);

async function site() {
  const posted: Array<{ user: string; password: string }> = [];
  const server: Server = createServer((req, res) => {
    const signedIn = /(?:^|;\s*)session=ok/.test(req.headers.cookie ?? "");
    const send = (status: number, body: string, headers: Record<string, string> = {}) => { res.writeHead(status, { "content-type": "text/html", ...headers }); res.end(body); };
    if (req.url === "/login" && req.method === "POST") {
      let raw = "";
      req.on("data", (chunk) => { raw += chunk; });
      req.on("end", () => {
        const form = new URLSearchParams(raw);
        const entry = { user: form.get("user") ?? "", password: form.get("password") ?? "" };
        posted.push(entry);
        if (entry.user === FAKE_USER && entry.password === FAKE_SECRET) send(302, "", { location: "/orders", "set-cookie": "session=ok; Path=/" });
        else send(200, html("Sign in", "<h1>Sign in</h1><p>Wrong login.</p>"));
      });
    } else if (req.url === "/login") send(200, LOGIN_WALL);
    else if (req.url === "/orders") {
      if (signedIn) send(200, DASHBOARD);
      else send(302, "", { location: "/login" });
    } else send(404, html("Not found", "<h1>Not found</h1>"));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, posted, close: () => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }) };
}

const LOGIN: AuthRequest["login"] = [
  { goto: "/login" },
  { fill: { field: "Email address", fromEnv: "APP_USER" } },
  { fill: { field: "Password", fromEnv: "APP_PASSWORD" } },
  { press: { control: "Sign in" } },
  { expect: { kind: "heading", name: "Dashboard", timeoutSeconds: 10 } },
];

const withEnv = async <T>(env: Record<string, string>, run: () => Promise<T>): Promise<T> => {
  const before = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  try { return await run(); } finally {
    for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
};

test("THE CONTROL: with no login, axe scans the LOGIN WALL and never sees the page behind it", { skip: SKIP, timeout: 90_000 }, async () => {
  const web = await site();
  try {
    const result = await scanWithAxe(`${web.origin}/orders`);
    assert.equal(result.title, "Sign in", "the protected URL bounced to the login, and that is what was scanned");
    assert.ok(!JSON.stringify(result.findings).includes("image-alt"), "the dashboard's violation is invisible to a run that did not log in");
  } finally { await web.close(); }
});

test("WITH the login, axe scans the page BEHIND it, from the same environment", { skip: SKIP, timeout: 90_000 }, async () => {
  const web = await site();
  try {
    const url = `${web.origin}/orders`;
    const result = await scanWithAxe(url, { signIn: ruleLayerSignIn({ plan: { login: LOGIN }, url, env: ENV }) });
    assert.equal(result.title, "Orders");
    assert.ok(JSON.stringify(result.findings).includes("image-alt"), "the violation that exists only behind the login is found");
    assert.deepEqual(web.posted, [{ user: FAKE_USER, password: FAKE_SECRET }], "the rule layer typed the environment's values itself");
  } finally { await web.close(); }
});

test("pageContext: an authenticated run's rule layer reports the signed-in page, and its findings are a list, not null", { skip: SKIP, timeout: 90_000 }, async () => {
  const web = await site();
  try {
    const url = `${web.origin}/orders`;
    const context = await withEnv(ENV, () => pageContext(url, "run", null, { auth: { login: LOGIN } }));
    assert.equal(context.title, "Orders");
    assert.ok(Array.isArray(context.findings) && JSON.stringify(context.findings).includes("image-alt"));
  } finally { await web.close(); }
});

test("a login that FAILS in the rule layer is an ERROR, not 'the scan failed, continuing without it'", { skip: SKIP, timeout: 90_000 }, async () => {
  const web = await site();
  try {
    const url = `${web.origin}/orders`;
    const short = [...LOGIN.slice(0, 4), { expect: { kind: "heading" as const, name: "Dashboard", timeoutSeconds: 0.5 } }];
    await assert.rejects(withEnv({ ...ENV, APP_PASSWORD: "not the password" }, () => pageContext(url, "run", null, { auth: { login: short } })),
      (e: Error & { fault?: string }) => e.fault === "auth-login-failed");
    // And a missing variable is found before the browser is driven.
    await assert.rejects(pageContext(url, "run", null, { auth: { login: LOGIN } }),
      (e: Error & { fault?: string }) => e.fault === "auth-credential-missing" || e.fault === "auth-login-failed");
  } finally { await web.close(); }
});

test("a missing variable is found BEFORE the browser is driven: the page is never touched", async () => {
  const touched: string[] = [];
  const page = new Proxy({}, { get: (_target, property) => { touched.push(String(property)); throw new Error("the browser was driven"); } });
  await assert.rejects(ruleLayerSignIn({ plan: { login: LOGIN }, url: "http://127.0.0.1:1/orders", env: { APP_USER: FAKE_USER } })(page as never),
    (e: Error & { fault?: string }) => e.fault === "auth-credential-missing" && /APP_PASSWORD/.test(e.message));
  assert.deepEqual(touched, [], "nothing was asked of the page");
});

test("clause 10: a rule layer that fails for any OTHER reason on an authenticated run is UNCHECKED (null), never clean ([])", async () => {
  const scans: string[] = [];
  const explode = async (url: string) => { scans.push(url); throw new Error("the scanner crashed"); };
  const written: string[] = [];
  const realWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string) => { written.push(String(chunk)); return true; }) as never;
  try {
    const context = await pageContext("http://127.0.0.1:1/orders", "run", null, { auth: { login: LOGIN }, scan: explode as never });
    assert.equal(context.findings, null, "unchecked is null; an empty list would read as '0 violations'");
    assert.equal(context.title, "", "no title, not the login wall's: an unauthenticated fetch of a protected page would name the wall");
    assert.deepEqual(context.coverage, {});
    assert.equal(scans.length, 1, "the scan WAS attempted, so this is not the layer being skipped");
    assert.ok(written.some((line) => line.includes("axe-core scan failed (continuing without it)")));
  } finally { process.stderr.write = realWrite; }
});

test("an authenticated run whose rule layer is OFF reports no title rather than the login wall's", async () => {
  const web = await site();
  try {
    const context = await pageContext(`${web.origin}/orders`, "none", null, { auth: { login: LOGIN } });
    assert.equal(context.title, "");
    assert.equal(context.findings, null);
    // The control: WITHOUT auth the same call fetches the title, and the protected URL's title is the wall's.
    assert.equal((await pageContext(`${web.origin}/orders`, "none", null)).title, "Sign in");
  } finally { await web.close(); }
});

test("an AuthError from the scan is rethrown by pageContext, whatever the layer thinks of its own failures", async () => {
  const refused = async () => { throw new AuthError("auth-login-failed", "the login did not complete"); };
  await assert.rejects(pageContext("http://127.0.0.1:1/orders", "run", null, { auth: { login: LOGIN }, scan: refused as never }),
    (e: Error & { fault?: string }) => e instanceof AuthError && e.fault === "auth-login-failed");
});

test("with no auth the rule layer is exactly what it was: the scan gets no signIn hook", async () => {
  let received: unknown = "unset";
  const spy = async (_url: string, options: unknown) => { received = options; return { findings: [], title: "t", coverage: {}, browserChannel: "chromium" as const }; };
  await pageContext("http://127.0.0.1:1/x", "run", null, { scan: spy as never });
  assert.deepEqual(received, {}, "an unauthenticated scan is called with no options at all");
  await pageContext("http://127.0.0.1:1/x", "run", null, { auth: { login: LOGIN }, scan: spy as never });
  assert.equal(typeof (received as { signIn?: unknown }).signIn, "function");
});
