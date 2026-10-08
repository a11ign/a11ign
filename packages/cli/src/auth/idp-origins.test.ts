// A LOGIN THAT PASSES THROUGH A DECLARED IDENTITY-PROVIDER ORIGIN (#4088, #4084 outcome 1).
//
// `idp-origins:` lets a login be on an origin besides the app's, and nothing else changes: an undeclared origin is `left-origin` with
// the sentence it always had, nothing is typed into one, and the login must END on the app. Every reading here has the SAME flow with
// the declaration removed beside it, so "works" and "still refused" are shown by one browser and one flow.
//
//   1. The FAKE DRIVER (an app origin, a declared IdP origin, a third origin): the allowance's edges, one test each.
//   2. REAL CHROMIUM on #4086's fixture, through the CLI's real run (flows text, `resolveAuthentication`, `ruleLayerSignIn`, the shipped Playwright driver). SKIPS, with its reason printed,
//      where no Chromium starts here.
//
// The worker's half is `src/auth-flow-idp.test.ts` in its repository, which holds the SAME sentences below as literals.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { chromium, type Browser } from "playwright";

import { type FlowStep } from "./flows.js";
import { signIn, type AuthDriver, type AuthPlan, type AxNode } from "./interpreter.js";
import { openPlaywrightDriver } from "./playwright-driver.js";
import { resolveAuthentication } from "./resolve.js";
import { ruleLayerSignIn } from "./rule-layer.js";
import { startCrossOriginIdp } from "./fixtures/cross-origin-idp.mjs";

const APP = "https://app.example.test";
const IDP = "https://idp.example.test";
const THIRD = "https://third.example.test";
const ACCOUNT_URL = `${APP}/account`;
const ENV = { IDP_USER: "idp-user-canary-1f", IDP_PASSWORD: "idp-password-canary-9c" };

const expectAccount: FlowStep = { expect: { kind: "heading", name: "Account", timeoutSeconds: 1 } };
const LOGIN: FlowStep[] = [
  { goto: "/login" },
  { fill: { field: "Email", fromEnv: "IDP_USER" } },
  { fill: { field: "Password", fromEnv: "IDP_PASSWORD" } },
  { press: { control: "Sign in" } },
  expectAccount,
];

type SiteOptions = {
  /** The IdP, after a correct submit, sends the browser on to another origin instead of back to the app. */
  hopsTo?: string;
  /** The page moves to the third origin on its own, after the check that follows the `goto`: a late redirect. */
  driftsToThird?: boolean;
  /** The app's Account page has a button that leaves for the IdP (a sign-out through the provider). */
  signOutLeavesForIdp?: boolean;
};

/** The sentence a person reads, and that BOTH interpreters must print for the same refusal. */
const leftOriginSentence = (where: string, now: string) =>
  `the login did not complete (left-origin) at ${where}: the page is on ${now}, not ${APP}. A redirect to an identity provider is SSO, which v1 does not do: use a dedicated test account without MFA or SSO.`;

/** An app, a declared identity provider that signs in with a form, and a third origin; typed values and the order of pages are recorded. */
function fakeSite(options: SiteOptions = {}) {
  let origin = "null";
  let path = "";
  let signedIn = false;
  let drifting = false;
  const typed: Array<{ origin: string; field: string }> = [];
  const visited: string[] = [];
  const nodesFor = (): Array<[string, string]> => {
    if (origin === IDP || origin === THIRD) return path.startsWith("/authorize") ? [["heading", "Log in to continue"], ["textbox", "Email"], ["textbox", "Password"], ["button", "Sign in"]] : [];
    if (origin === APP && path === "/account" && signedIn) return [["heading", "Account"], ...(options.signOutLeavesForIdp ? [["button", "Sign out"] as [string, string]] : [])];
    return [];
  };
  const nodes = (): AxNode[] => nodesFor().map(([role, name], i) => ({ id: String(i + 1), role, name, backendId: i + 1, ignored: false }));
  const moveTo = (to: string, at: string) => { origin = to; path = at; visited.push(`${to}${at}`); };
  const driver: AuthDriver = {
    navigate: async (url) => {
      const target = new URL(url);
      if (target.origin === APP && target.pathname === "/login") moveTo(IDP, "/authorize"); // the app's /login redirects to the provider
      else moveTo(target.origin, target.pathname);
      drifting = options.driftsToThird === true && target.pathname === "/login";
      return { ok: true };
    },
    origin: async () => {
      const answer = origin;
      if (drifting) { drifting = false; moveTo(THIRD, "/authorize"); }
      return answer;
    },
    url: async () => `${origin}${path}`,
    axNodes: async () => nodes(),
    frameSources: async () => [],
    inputType: async (handle) => (nodes()[handle - 1]?.name === "Password" ? "password" : "text"),
    fill: async (handle, text) => { assert.ok(text.length > 0); typed.push({ origin, field: nodes()[handle - 1]?.name ?? "?" }); },
    choose: async () => false,
    isChecked: async () => false,
    click: async (handle) => {
      const name = nodes()[handle - 1]?.name;
      if (name === "Sign in" && origin === IDP) { signedIn = options.hopsTo === undefined; moveTo(options.hopsTo ?? APP, options.hopsTo === undefined ? "/account" : "/callback"); }
      if (name === "Sign out") moveTo(IDP, "/logout");
    },
    setCookies: async () => undefined,
    setLocalStorage: async () => undefined,
    close: async () => undefined,
  };
  return { driver, typed, visited };
}

type Run = { ok: true } | { ok: false; reason: unknown; fault: unknown; message: string };

/** One run of `signIn` through the CLI's interpreter, reduced to the outcome and what was typed where. */
async function run(plan: AuthPlan, site: ReturnType<typeof fakeSite>): Promise<Run> {
  try {
    await signIn({ plan, url: ACCOUNT_URL, driver: site.driver, env: ENV, mark: () => undefined, bindTimeoutMs: 250 });
    return { ok: true };
  } catch (error) {
    const e = error as Error & { code?: string; fault?: string; reason?: string };
    return { ok: false, reason: e.reason, fault: e.fault ?? e.code, message: e.message };
  }
}

const refusedAs = (outcome: Run, sentence: string) => {
  assert.ok(!outcome.ok, "expected the run to be refused");
  if (!outcome.ok) {
    assert.equal(outcome.fault, "auth-login-failed");
    assert.equal(outcome.reason, "left-origin");
    assert.equal(outcome.message, sentence);
  }
};

describe("with the IdP declared, on the fake driver", () => {
  test("the login signs in through the IdP, types only into the declared origin, and ends on the app's Account page", async () => {
    const site = fakeSite();
    const outcome = await run({ login: LOGIN, idpOrigins: [IDP] }, site);
    assert.deepEqual(outcome, { ok: true });
    assert.deepEqual(site.typed, [{ origin: IDP, field: "Email" }, { origin: IDP, field: "Password" }]);
    assert.equal(site.visited.at(-1), `${APP}/account`);
  });

  test("CONTROL: the SAME flow with idp-origins removed ends left-origin at the first step, and types nothing", async () => {
    const site = fakeSite();
    const outcome = await run({ login: LOGIN }, site);
    refusedAs(outcome, leftOriginSentence("login step 1 (goto)", IDP));
    assert.deepEqual(site.typed, []);
  });

  test("a SECOND origin that is not declared ends left-origin though the first is: the IdP redirects on to a third origin", async () => {
    const site = fakeSite({ hopsTo: THIRD });
    const outcome = await run({ login: LOGIN, idpOrigins: [IDP] }, site);
    refusedAs(outcome, leftOriginSentence("login step 4 (press)", THIRD));
  });

  test("CONTROL for the second origin: declaring it too lets the same hop through that step, and the last step still wants the app", async () => {
    const outcome = await run({ login: LOGIN, idpOrigins: [IDP, THIRD] }, fakeSite({ hopsTo: THIRD }));
    assert.ok(!outcome.ok);
    if (!outcome.ok) {
      assert.equal(outcome.reason, "expect-not-met", "step 4 passed, so the refusal is at step 5 and is the missing heading, not the origin");
      assert.match(outcome.message, /at login step 5 \(expect\)/);
    }
  });

  test("a login that ends PARKED on the IdP is left-origin at its last step, not a pass", async () => {
    const parked: FlowStep[] = [{ goto: "/login" }, { expect: { kind: "heading", name: "Log in to continue", timeoutSeconds: 1 } }];
    const outcome = await run({ login: parked, idpOrigins: [IDP] }, fakeSite());
    refusedAs(outcome, leftOriginSentence("login step 2 (expect)", IDP));
  });

  test("an expect: in the MIDDLE of the login may be met on the declared IdP (the page the next step acts on)", async () => {
    const middle: FlowStep[] = [{ goto: "/login" }, { expect: { kind: "heading", name: "Log in to continue", timeoutSeconds: 1 } }, ...LOGIN.slice(1)];
    assert.deepEqual(await run({ login: middle, idpOrigins: [IDP] }, fakeSite()), { ok: true });
  });

  test("nothing is typed into an undeclared origin even when the page moves there on its own after the last check", async () => {
    const site = fakeSite({ driftsToThird: true });
    const outcome = await run({ login: LOGIN, idpOrigins: [IDP] }, site);
    refusedAs(outcome, leftOriginSentence("login step 2 (fill)", THIRD));
    assert.deepEqual(site.typed, []);
  });

  test("the allowance ends with the login: a flow step that lands on the declared IdP is left-origin", async () => {
    const flow: FlowStep[] = [{ press: { control: "Sign out" } }];
    const outcome = await run({ login: LOGIN, flow, idpOrigins: [IDP] }, fakeSite({ signOutLeavesForIdp: true }));
    refusedAs(outcome, leftOriginSentence("flow step 1 (press)", IDP));
  });
});

/** Probe once: a browser that cannot start is a stated skip, never a pass. */
const launched: { browser?: Browser; reason?: string } = await chromium.launch().then(
  (browser) => ({ browser }),
  (error: unknown) => ({ reason: `no Chromium starts here (${String(error).split("\n")[0]}); the sign-in through a real browser was NOT exercised` }),
);
const SKIP = launched.reason;
console.log(SKIP === undefined ? "idp-origins: real Chromium started, the browser tests run" : `idp-origins: SKIPPING the real-browser tests: ${SKIP}`);

const flowsFileFor = (fixture: { appUrl: string; idpUrl: string }, declared: boolean) => `
version: 1
origin: ${fixture.appUrl}
${declared ? `idp-origins:\n  - ${fixture.idpUrl}\n` : ""}flows:
  login:
    steps:
      - goto: /login
      - fill: { field: "Email", from-env: IDP_USER }
      - fill: { field: "Password", from-env: IDP_PASSWORD }
      - press: "Sign in"
      - expect: { heading: "Account" }
`;

/**
 * The CLI's REAL run, up to the browser: the flows file's TEXT goes through `resolveAuthentication` (so `planFrom` decides what the
 * plan holds), and the plan it returns goes through `ruleLayerSignIn` and the shipped `openPlaywrightDriver`. Nothing is built by hand
 * between the file and the page, which is what a plan that drops `idp-origins:` would be caught by.
 */
async function resolvedPlan(fixture: { appUrl: string; idpUrl: string; email: string; password: string }, declared: boolean): Promise<{ plan: AuthPlan; env: Record<string, string> }> {
  const env = { IDP_USER: fixture.email, IDP_PASSWORD: fixture.password };
  const before = process.env.JUDGE_BACKEND;
  process.env.JUDGE_BACKEND = "local";
  try {
    const resolved = await resolveAuthentication({
      args: { flows: "login.yml", loginFlow: "login", authState: null, sendAuthenticatedTranscriptToJudgeVendor: false },
      urls: [`${fixture.appUrl}/account`], task: "Read and understand this page", axe: true, countCaptures: async () => 1, env,
      readText: async () => flowsFileFor(fixture, declared), isPdf: () => false,
    });
    return { plan: (resolved as NonNullable<typeof resolved>).auth, env };
  } finally { if (before === undefined) delete process.env.JUDGE_BACKEND; else process.env.JUDGE_BACKEND = before; }
}

/** Sign in in a FRESH context and read the heading the requested page shows afterwards. `reload: true` removes the driver's `url()`, so the old behaviour stands. */
async function headingAfterSignIn(fixture: Awaited<ReturnType<typeof startCrossOriginIdp>>, { declared, reload }: { declared: boolean; reload: boolean }): Promise<string> {
  const context = await (launched.browser as Browser).newContext();
  try {
    const page = await context.newPage();
    const { plan, env } = await resolvedPlan(fixture, declared);
    const url = `${fixture.appUrl}/account`;
    if (reload) {
      const shipped = await openPlaywrightDriver(page);
      await signIn({ plan, url, driver: { ...shipped, url: undefined }, env, mark: () => undefined });
    } else {
      await ruleLayerSignIn({ plan, url, env })(page);
    }
    return (await page.getByRole("heading").first().textContent()) ?? "";
  } finally { await context.close(); }
}

describe("in a real Chromium, on #4086's fixture", () => {
  after(async () => { await launched.browser?.close(); });

  test("IdP declared: the run signs in through the second origin and the requested page reads Account", { skip: SKIP }, async () => {
    const fixture = await startCrossOriginIdp();
    try { assert.equal(await headingAfterSignIn(fixture, { declared: true, reload: false }), "Account"); } finally { await fixture.stop(); }
  });

  test("CONTROL: the same declared run through a driver that cannot say where it is RELOADS the page, and the memory-only token is gone", { skip: SKIP }, async () => {
    const fixture = await startCrossOriginIdp();
    try { assert.equal(await headingAfterSignIn(fixture, { declared: true, reload: true }), "Sign in"); } finally { await fixture.stop(); }
  });

  test("CONTROL: the storage: local fixture survives the reload, so the reload is the whole difference", { skip: SKIP }, async () => {
    const fixture = await startCrossOriginIdp({ storage: "local" });
    try { assert.equal(await headingAfterSignIn(fixture, { declared: true, reload: true }), "Account"); } finally { await fixture.stop(); }
  });

  test("FALSIFIER: the same run with the IdP undeclared ends auth-login-failed / left-origin", { skip: SKIP }, async () => {
    const fixture = await startCrossOriginIdp();
    try {
      await assert.rejects(headingAfterSignIn(fixture, { declared: false, reload: false }), (error: Error & { reason?: string }) => {
        assert.equal(error.reason, "left-origin");
        assert.match(error.message, new RegExp(`the page is on ${fixture.idpUrl}, not ${fixture.appUrl}`));
        return true;
      });
    } finally { await fixture.stop(); }
  });
});
