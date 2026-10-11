// A SCAN RE-CHECKS IT IS STILL SIGNED IN BEFORE EVERY AUDITED PAGE (#4996, #4084 v3 login phase 1).
//
// The cases run `pageContext` (the rule layer's own entry, the one `captureAndScan` calls per page) in a REAL Chromium against a site
// that drops the session on chosen sign-ins, and count, on the SITE, how many passwords it was handed: the count is the evidence for
// "re-logs in once", not the code's own bookkeeping. The report cases then take what a signed-out page throws through `runPageList`,
// `markNotAudited` and the roll-up, which is the shape `--json` and the human report print.
//
// The decision cases at the top need NO browser: the page is read through `recheckedSignIn`'s `read` seam, so they run where Chromium
// cannot start, which is the only place the mutation below can be shown. The cases against a real site are the same three scenarios.
//
// SKIPS the browser cases, with the reason printed, where no Chromium starts (`axeAvailable`, the product's own probe).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { markNotAudited, pageContext, PageSignedOutError, recheckedSignIn, type ReadPage } from "./cli.js";
import type { Page } from "playwright";
import { AuthError } from "./auth/auth-faults.js";
import { LOGIN_EXIT_CODES } from "./auth/login-outcomes.js";
import { multiPageJson, rollUpLines, runPageList } from "./multi-page.js";
import { axeAvailable } from "./scan/axe.js";
import type { AuthRequest } from "./auth/refusals.js";

const USER = "canaryuser71c3";
const SECRET = "canarysecret9e04";
const ENV = { APP_USER: USER, APP_PASSWORD: SECRET };

const CAN_RUN = await axeAvailable().catch(() => false);
const SKIP = CAN_RUN ? undefined : "no browser can be launched for the rule layer here (`npx playwright install chromium`); the per-page re-check was NOT exercised";

const html = (title: string, body: string) => `<!doctype html><html lang="en"><head><title>${title}</title></head><body><main>${body}</main></body></html>`;
const ORDERS = html("Orders", `<h1>Orders</h1><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">`);
const LOGIN_WALL = html("Sign in", `<h1>Sign in</h1><form method="post" action="/login"><label>Email address <input name="user"></label>
  <label>Password <input name="password" type="password"></label><button type="submit">Sign in</button></form>`);

/**
 * A site whose session is honoured until `drops(n)` says the n-th sign-in's session is gone by the time a page is requested AGAIN:
 * each sign-in lands on /orders once (the login's own redirect) and the scan then navigates to the page it was asked for.
 */
async function site(drops: (signIn: number) => boolean) {
  let signIns = 0;
  let pageLoadsSinceSignIn = 0;
  const server: Server = createServer((req, res) => {
    const send = (status: number, body: string, headers: Record<string, string> = {}) => { res.writeHead(status, { "content-type": "text/html", ...headers }); res.end(body); };
    if (req.url === "/login" && req.method === "POST") {
      let raw = "";
      req.on("data", (chunk) => { raw += chunk; });
      req.on("end", () => {
        const form = new URLSearchParams(raw);
        if (form.get("user") === USER && form.get("password") === SECRET) {
          signIns += 1;
          pageLoadsSinceSignIn = 0;
          send(302, "", { location: "/orders", "set-cookie": "session=ok; Path=/" });
        } else send(200, html("Sign in", "<h1>Sign in</h1><p>Wrong login.</p>"));
      });
    } else if (req.url === "/login") send(200, LOGIN_WALL);
    else if (req.url?.startsWith("/orders")) {
      pageLoadsSinceSignIn += 1;
      const dropped = drops(signIns) && pageLoadsSinceSignIn > 1;
      if (/session=ok/.test(req.headers.cookie ?? "") && !dropped) send(200, ORDERS);
      else send(302, "", { location: "/login" });
    } else send(404, html("Not found", "<h1>Not found</h1>"));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    signIns: () => signIns,
    close: () => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }),
  };
}

const AUTH: AuthRequest = {
  login: [
    { goto: "/login" },
    { fill: { field: "Email address", fromEnv: "APP_USER" } },
    { fill: { field: "Password", fromEnv: "APP_PASSWORD" } },
    { press: { control: "Sign in" } },
    { expect: { kind: "heading", name: "Orders", timeoutSeconds: 10 } },
  ],
};

const withEnv = async <T>(run: () => Promise<T>): Promise<T> => {
  Object.assign(process.env, ENV);
  try { return await run(); } finally { for (const key of Object.keys(ENV)) delete process.env[key]; }
};

const scanPage = (origin: string, n: number, auth: AuthRequest) =>
  withEnv(() => pageContext(`${origin}/orders?page=${n}`, "run", null, { auth }));

// ---- the decision, without a browser: a fake page, a sign-in that counts itself, and a tree that says what the page shows ----

const APP = "https://app.test";
const SIGNED_IN_TREE = [{ id: "1", role: "heading", name: "Orders", ignored: false }];
const WALL_TREE = [{ id: "1", role: "heading", name: "Sign in", ignored: false }];

/** A scan of pages, each arriving signed in or not as `arrivals` says in order; every sign-in (first or re-) takes the next. */
function scripted(arrivals: readonly boolean[]) {
  let signIns = 0;
  let current = true;
  const fakePage = {} as Page;
  const read: ReadPage = async () => ({ nodes: current ? SIGNED_IN_TREE : WALL_TREE, url: `${APP}${current ? "/orders" : "/login"}` });
  const signInOnce = async (): Promise<void> => { current = arrivals[signIns] ?? true; signIns += 1; };
  const scan = (auth: AuthRequest, n: number) => recheckedSignIn({ plan: auth, url: `${APP}/orders?page=${n}`, signInOnce, read })(fakePage);
  return { scan, signIns: () => signIns };
}

test("POSITIVE CONTROL (decision): a three-page scan that stays signed in audits all three with one sign-in each", async () => {
  const run = scripted([true, true, true]);
  const auth: AuthRequest = { ...AUTH };
  for (const n of [1, 2, 3]) await run.scan(auth, n);
  assert.equal(run.signIns(), 3);
});

test("NEGATIVE CONTROL (decision), once: the session dropped before page two re-logs in once and audits page two", async () => {
  const run = scripted([true, false, true, true]);
  const auth: AuthRequest = { ...AUTH };
  await run.scan(auth, 1);
  await run.scan(auth, 2); // resolves: page two is audited
  await run.scan(auth, 3);
  assert.equal(run.signIns(), 4, "one re-login, on page two only");
});

test("NEGATIVE CONTROL (decision), again: dropped twice, page two is NOT AUDITED as signed out and the third try is never made", async () => {
  const run = scripted([true, false, false, true]);
  const auth: AuthRequest = { ...AUTH };
  await run.scan(auth, 1);
  await assert.rejects(run.scan(auth, 2), (error: unknown) => error instanceof PageSignedOutError && /session was lost|after the scan had audited a page/.test(error.message));
  assert.equal(run.signIns(), 3, "page one once, page two twice: one re-login and no more");
});

test("a session that the login's own page reports lost (auth-session-lost) is a failed check even when the tree still shows the heading", async () => {
  const auth: AuthRequest = { ...AUTH };
  const lost = async (): Promise<void> => { throw new AuthError("auth-session-lost", "the requested page showed the login form"); };
  const read: ReadPage = async () => ({ nodes: SIGNED_IN_TREE, url: `${APP}/orders` });
  await assert.rejects(recheckedSignIn({ plan: auth, url: `${APP}/orders`, signInOnce: lost, read })({} as Page), PageSignedOutError);
});

test("a check that holds on the identity provider's origin is not a signed-in page", async () => {
  const auth: AuthRequest = { ...AUTH };
  const read: ReadPage = async () => ({ nodes: SIGNED_IN_TREE, url: "https://idp.test/authorize" });
  await assert.rejects(recheckedSignIn({ plan: auth, url: `${APP}/orders`, signInOnce: async () => undefined, read })({} as Page), PageSignedOutError);
});

test("POSITIVE CONTROL: a three-page scan on a site that stays signed in audits all three, one sign-in each", { skip: SKIP, timeout: 120_000 }, async () => {
  const web = await site(() => false);
  const auth: AuthRequest = { ...AUTH };
  try {
    for (const n of [1, 2, 3]) {
      const page = await scanPage(web.origin, n, auth);
      assert.equal(page.title, "Orders");
      assert.ok(JSON.stringify(page.findings).includes("image-alt"), `page ${n} was audited as the signed-in page`);
    }
    assert.equal(web.signIns(), 3, "no page needed a second login");
  } finally { await web.close(); }
});

test("NEGATIVE CONTROL, once: a session dropped before page two re-logs in ONCE and audits page two", { skip: SKIP, timeout: 120_000 }, async () => {
  const web = await site((signIn) => signIn === 2); // page one's login is sign-in 1; page two's first is 2 and drops; its re-login is 3
  const auth: AuthRequest = { ...AUTH };
  try {
    await scanPage(web.origin, 1, auth);
    const second = await scanPage(web.origin, 2, auth);
    assert.equal(second.title, "Orders", "page two was audited as the signed-in page, never as the sign-in page");
    assert.ok(JSON.stringify(second.findings).includes("image-alt"));
    assert.equal(web.signIns(), 3, "page one once, page two twice: exactly one re-login");
  } finally { await web.close(); }
});

test("NEGATIVE CONTROL, again: a session dropped twice reports page two NOT AUDITED: signed out, and audits nothing of the login page", { skip: SKIP, timeout: 120_000 }, async () => {
  const web = await site((signIn) => signIn >= 2); // every sign-in after page one's is gone on arrival
  const auth: AuthRequest = { ...AUTH };
  try {
    await scanPage(web.origin, 1, auth);
    await assert.rejects(scanPage(web.origin, 2, auth), (error: unknown) => {
      assert.ok(error instanceof PageSignedOutError, String(error));
      assert.equal(error.fault, "auth-session-lost");
      assert.match(error.message, /^not audited: signed out/);
      assert.ok(!error.message.includes(SECRET) && !error.message.includes(USER), "no credential value in the message");
      return true;
    });
    assert.equal(web.signIns(), 3, "one re-login and no more: page one once, page two twice");
  } finally { await web.close(); }
});

test("a scan whose FIRST page is signed out says so as 'at start', not as a session lost mid-scan", { skip: SKIP, timeout: 120_000 }, async () => {
  const web = await site(() => true);
  try {
    await assert.rejects(scanPage(web.origin, 1, { ...AUTH }), (error: unknown) => error instanceof PageSignedOutError && /on the first page/.test(error.message));
  } finally { await web.close(); }
});

test("a login that is REFUSED is not a lost session: the credential's own fault goes on unchanged", { skip: SKIP, timeout: 120_000 }, async () => {
  const web = await site(() => false);
  try {
    Object.assign(process.env, { ...ENV, APP_PASSWORD: "not the password" });
    const short: AuthRequest = { login: [...AUTH.login.slice(0, 4), { expect: { kind: "heading", name: "Orders", timeoutSeconds: 0.5 } }] };
    await assert.rejects(pageContext(`${web.origin}/orders`, "run", null, { auth: short }),
      (error: unknown) => error instanceof AuthError && !(error instanceof PageSignedOutError) && error.fault === "auth-login-failed");
  } finally { for (const key of Object.keys(ENV)) delete process.env[key]; await web.close(); }
});

test("the report: a signed-out page is NOT AUDITED in the list and in --json, the pages after it are not attempted, and the code is the lost-session one", async () => {
  const pages = await runPageList({
    urls: ["https://app.test/one", "https://app.test/two", "https://app.test/three"],
    captures: 3, maxPages: 5, surface: "cli", say: () => undefined,
    lease: async () => ({ release: async () => undefined }),
    capturePage: async (url) => {
      if (url.endsWith("/two")) throw new PageSignedOutError(url, "session-lost-mid-scan");
      return [{ audited: url }];
    },
  }).then(markNotAudited);
  assert.deepEqual(pages.map((page) => page.notAudited === true), [false, true, false]);
  assert.equal(pages[0]?.status, "captured");
  assert.equal(pages[1]?.status, "failed", "still failed, so every reader that treats failed as not measured keeps doing so");
  assert.deepEqual(pages[1]?.results, [], "nothing of the signed-out page is in the report");
  assert.equal(pages[2]?.notAttempted, true, "a page stopped by the loss is never marked as itself signed out");
  assert.match(rollUpLines(pages).join("\n"), /2\. https:\/\/app\.test\/two -- FAILED: not audited: signed out/);
  assert.equal(JSON.parse(JSON.stringify(multiPageJson(pages))).pages[1].notAudited, true);
  assert.equal(LOGIN_EXIT_CODES.sessionLost, 4);
  assert.notEqual(LOGIN_EXIT_CODES.sessionLost, 1, "distinct from the code for 'a page failed'");
});
