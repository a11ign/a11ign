// THE CROSS-ORIGIN IDENTITY-PROVIDER FIXTURE (#4086, #4084 outcome 1): a sign-in that leaves the origin, and a token that lives only in page memory.
//
// Two claims, each with a control that shows the reading able to differ:
//   1. OVER HTTP, no browser: `/login` leads to the IdP origin, a correct submit returns to the APP origin with a code, a wrong password
//      does not, and no response from either origin sets a cookie. The CONTROL is the `storage: "local"` variant, whose served script
//      DOES name `localStorage`, so the scan for browser storage is shown able to find it; and a server that sets a cookie, so the
//      cookie recorder is shown able to see one.
//   2. IN REAL CHROMIUM: the fixture signs a browser in and the page reads `Account`, and a state saved by `context.storageState()` and
//      loaded into a FRESH context shows the sign-in page. The CONTROL is `storage: "local"`, loaded the same way, which shows `Account`.
//
// SKIPS the browser half, with its reason, where no Chromium starts here. The skip prints on every run, so "skipped" is never read as "passed".
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { chromium, type Browser, type BrowserContext } from "playwright";

import { startCrossOriginIdp } from "./fixtures/cross-origin-idp.mjs";

type Fixture = Awaited<ReturnType<typeof startCrossOriginIdp>>;
type Seen = { url: string; status: number; setCookie: string[]; body: string };

const STORAGE_NAMES = ["document.cookie", "localStorage", "sessionStorage"];

/** Fetch without following redirects, and keep what was seen. The recorder is how "no response sets a cookie" is read. */
async function recorded(seen: Seen[], url: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, { redirect: "manual", ...init });
  seen.push({ url, status: response.status, setCookie: response.headers.getSetCookie(), body: await response.clone().text() });
  return response;
}

const formBody = (fields: Record<string, string>): RequestInit => ({
  method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields),
});

/** Walk the whole sign-in over HTTP the way a browser does, recording every response. Returns the callback location, if a code came back. */
async function signInOverHttp(fixture: Fixture, password: string, seen: Seen[]): Promise<{ authorize: Response; submit: Response }> {
  const login = await recorded(seen, `${fixture.appUrl}/login`);
  const authorizeUrl = login.headers.get("location") ?? "";
  const authorize = await recorded(seen, authorizeUrl);
  const hidden = Object.fromEntries(new URL(authorizeUrl).searchParams);
  const submit = await recorded(seen, `${fixture.idpUrl}/authorize`, formBody({ ...hidden, email: fixture.email, password }));
  return { authorize, submit };
}

const cookiesSet = (seen: Seen[]) => seen.flatMap((entry) => entry.setCookie);
const storageNamedIn = (seen: Seen[], origin: string) => STORAGE_NAMES.filter((name) => seen.some((entry) => entry.url.startsWith(origin) && entry.body.includes(name)));

describe("over HTTP, with no browser", () => {
  let fixture: Fixture;
  before(async () => { fixture = await startCrossOriginIdp(); });
  after(async () => { await fixture.stop(); });

  test("the two origins differ: that is the whole point of the fixture", () => {
    assert.notEqual(new URL(fixture.appUrl).origin, new URL(fixture.idpUrl).origin);
    assert.notEqual(new URL(fixture.appUrl).port, new URL(fixture.idpUrl).port);
  });

  test("the app's /login leads to the IdP origin, and the authorize page is a form with Email, Password and Sign in", async () => {
    const seen: Seen[] = [];
    const login = await recorded(seen, `${fixture.appUrl}/login`);
    assert.equal(login.status, 302);
    assert.equal(new URL(login.headers.get("location") ?? "").origin, new URL(fixture.idpUrl).origin);
    const authorize = await recorded(seen, login.headers.get("location") ?? "");
    const body = seen[1]?.body ?? "";
    assert.equal(authorize.status, 200);
    for (const control of [">Email <", ">Password <", ">Sign in</button>"]) assert.ok(body.includes(control), `the authorize page has ${control}`);
  });

  test("a correct submit comes back to the APP origin with a code", async () => {
    const { submit } = await signInOverHttp(fixture, fixture.password, []);
    const back = new URL(submit.headers.get("location") ?? "");
    assert.equal(submit.status, 302);
    assert.equal(back.origin, new URL(fixture.appUrl).origin);
    assert.equal(back.pathname, "/callback");
    assert.match(back.searchParams.get("code") ?? "", /^[0-9a-f]{24}$/);
  });

  test("CONTROL: a wrong password does not come back, and says so on the IdP's own page", async () => {
    const seen: Seen[] = [];
    const { submit } = await signInOverHttp(fixture, "not the password", seen);
    assert.equal(submit.status, 401);
    assert.equal(submit.headers.get("location"), null);
    assert.ok(seen.at(-1)?.body.includes("Wrong email or password."));
  });

  test("a code is good once: the second exchange is refused", async () => {
    const { submit } = await signInOverHttp(fixture, fixture.password, []);
    const code = new URL(submit.headers.get("location") ?? "").searchParams.get("code");
    const exchange = () => fetch(`${fixture.idpUrl}/token`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
    assert.equal((await exchange()).status, 200);
    assert.equal((await exchange()).status, 400);
  });

  test("NO response from either origin carries Set-Cookie, and the served app script names no browser storage", async () => {
    const seen: Seen[] = [];
    await signInOverHttp(fixture, fixture.password, seen);
    await signInOverHttp(fixture, "wrong", seen);
    for (const path of ["/", "/account", "/callback?code=x", "/nothing-here"]) await recorded(seen, `${fixture.appUrl}${path}`);
    await recorded(seen, `${fixture.idpUrl}/userinfo`);
    assert.ok(seen.length >= 10, "the scan looked at a population, not an empty list");
    assert.deepEqual(cookiesSet(seen), []);
    assert.deepEqual(storageNamedIn(seen, fixture.appUrl), []);
    assert.ok(seen.some((entry) => entry.url.startsWith(fixture.appUrl) && entry.body.includes("<script>")), "POSITIVE CONTROL for the scan: an app response carries a script to scan");
  });
});

describe("the controls show each scan able to fail", () => {
  test("the storage: local variant's served script names localStorage, and still sets no cookie", async () => {
    const fixture = await startCrossOriginIdp({ storage: "local" });
    try {
      const seen: Seen[] = [];
      await signInOverHttp(fixture, fixture.password, seen);
      await recorded(seen, `${fixture.appUrl}/account`);
      assert.deepEqual(storageNamedIn(seen, fixture.appUrl), ["localStorage"]);
      assert.deepEqual(cookiesSet(seen), []);
    } finally { await fixture.stop(); }
  });

  test("a server that sets a cookie is SEEN by the recorder", async () => {
    const server = createServer((_req, res) => { res.writeHead(200, { "set-cookie": "session=ok; Path=/" }); res.end(); });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const seen: Seen[] = [];
      await recorded(seen, `http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
      assert.deepEqual(cookiesSet(seen), ["session=ok; Path=/"]);
    } finally { server.close(); server.closeAllConnections(); }
  });
});

/** Probe once: a browser that cannot start is a stated skip, never a pass. */
const launched: { browser?: Browser; reason?: string } = await chromium.launch().then(
  (browser) => ({ browser }),
  (error: unknown) => ({ reason: `no Chromium starts here (${String(error).split("\n")[0]}); the sign-in through a real browser was NOT exercised` }),
);
const SKIP = launched.reason;
console.log(SKIP === undefined ? "cross-origin-idp: real Chromium started, the browser tests run" : `cross-origin-idp: SKIPPING the real-browser tests: ${SKIP}`);

/** Sign a fresh context in through the fixture's own login form, the way a person would. Returns the page reading `Account`. */
async function signedInContext(browser: Browser, fixture: Fixture): Promise<BrowserContext> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${fixture.appUrl}/login`);
  assert.equal(new URL(page.url()).origin, new URL(fixture.idpUrl).origin, "the login form is on the IdP's origin");
  await page.getByLabel("Email").fill(fixture.email);
  await page.getByLabel("Password").fill(fixture.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("heading", { name: "Account" }).waitFor({ timeout: 10_000 });
  assert.equal(new URL(page.url()).origin, new URL(fixture.appUrl).origin, "the sign-in came back to the app");
  return context;
}

/** Save the state, load it into a FRESH context, and read the heading the protected page shows there. */
async function headingAfterReload(browser: Browser, fixture: Fixture, signedIn: BrowserContext): Promise<{ heading: string; state: Awaited<ReturnType<BrowserContext["storageState"]>> }> {
  const state = await signedIn.storageState();
  const fresh = await browser.newContext({ storageState: state });
  try {
    const page = await fresh.newPage();
    await page.goto(`${fixture.appUrl}/account`);
    await page.getByRole("heading").first().waitFor({ timeout: 10_000 });
    await page.waitForLoadState("networkidle");
    return { heading: (await page.getByRole("heading").first().textContent()) ?? "", state };
  } finally { await fresh.close(); }
}

describe("in a real Chromium", () => {
  after(async () => { await launched.browser?.close(); });

  test("memory: the page reads Account after sign-in, and a saved state loads as SIGNED OUT with nothing in it to carry the session", { skip: SKIP }, async () => {
    const fixture = await startCrossOriginIdp();
    const signedIn = await signedInContext(launched.browser as Browser, fixture);
    try {
      const { heading, state } = await headingAfterReload(launched.browser as Browser, fixture, signedIn);
      assert.equal(heading, "Sign in", "the fresh context shows the sign-in page, not Account");
      assert.deepEqual(state.cookies, []);
      assert.deepEqual(state.origins, [], "no localStorage on any origin");
    } finally { await signedIn.close(); await fixture.stop(); }
  });

  test("CONTROL, storage: local: the SAME flow, loaded the same way, shows Account", { skip: SKIP }, async () => {
    const fixture = await startCrossOriginIdp({ storage: "local" });
    const signedIn = await signedInContext(launched.browser as Browser, fixture);
    try {
      const { heading, state } = await headingAfterReload(launched.browser as Browser, fixture, signedIn);
      assert.equal(heading, "Account");
      assert.deepEqual(state.cookies, []);
      assert.equal(state.origins[0]?.localStorage.some((entry) => entry.name === "token"), true);
    } finally { await signedIn.close(); await fixture.stop(); }
  });
});
