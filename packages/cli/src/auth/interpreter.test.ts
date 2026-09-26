// THE CLI'S INTERPRETER, AND ITS PARITY WITH THE WORKER'S (ADR 0038, "The rule layer logs in for itself").
//
// There are two interpreters because there cannot be one (the worker is plain `.mjs`, and neither package imports
// the other in production). So this file is the lock, in two parts. Every scenario through `signIn` runs through BOTH over
// ONE fake browser, and the two must reach the SAME outcome: the same typed values, the same clicks, the same marks, the
// same fault and reason. And the three pure helpers the interpreters share (`controlsNamed`, `expectationMet`,
// `requiredEnvNames`) are called on BOTH sides over one table of node sets and plans, and must agree on every row. A
// behaviour only one of them has is a defect in the other, and this is where it shows.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  challengeVendor as workerChallengeVendor,
  controlsNamed as workerControlsNamed,
  cookieParam as workerCookieParam,
  expectationMet as workerExpectationMet,
  FRAME_SOURCES_EXPRESSION as WORKER_FRAME_SOURCES_EXPRESSION,
  loadStateEntries as workerLoadStateEntries,
  requiredEnvNames as workerRequiredEnvNames,
  SET_LOCAL_STORAGE_FUNCTION as WORKER_SET_LOCAL_STORAGE_FUNCTION,
  signIn as workerSignIn,
  stateEntriesFor as workerStateEntriesFor,
  stateShapeProblem as workerStateShapeProblem,
  validateAuthRequest,
  withLoadedState,
} from "@a11ign/nvda-worker/auth-flow";
import {
  challengeVendor, controlsNamed, cookieParam, expectationMet, FRAME_SOURCES_EXPRESSION, requiredEnvNames, SET_LOCAL_STORAGE_FUNCTION,
  signIn as cliSignIn, type AuthDriver, type AuthPlan, type AxNode,
} from "./interpreter.js";
import type { FlowStep } from "./flows.js";
import { stateEntriesFor, type StateCookie, type StorageState } from "./scrub.js";
import { parseStorageState, stateShapeProblem } from "./state-file.js";

const ORIGIN = "https://app.example.test";
const URL_UNDER_TEST = `${ORIGIN}/orders`;
const FAKE_USER = "canaryuser6d3f2a";
const FAKE_SECRET = "canarysecretb81c94";
const ENV = { APP_USER: FAKE_USER, APP_PASSWORD: FAKE_SECRET };
const BIND_MS = 250;

const expectDashboard: FlowStep = { expect: { kind: "heading", name: "Dashboard", timeoutSeconds: 1 } };
const LOGIN: FlowStep[] = [
  { goto: "/login" },
  { fill: { field: "Email address", fromEnv: "APP_USER" } },
  { fill: { field: "Password", fromEnv: "APP_PASSWORD" } },
  { press: { control: "Sign in" } },
  expectDashboard,
];

/**
 * The iframe `src`s the vendors' widgets are served from, SHAPED as the route measured returns them (`frameSources()`: the
 * `src` of each iframe the main document renders). **These are vendor-SHAPED, not a widget served from the vendor's origin:**
 * no request is made to any of these hosts. The hosts are the ones each vendor's Content-Security-Policy page documents.
 */
const WIDGET_SOURCES = {
  recaptcha: "https://www.google.com/recaptcha/api2/anchor?ar=1&k=6LcSITEKEY&co=aHR0cHM6Ly9hcHAuZXhhbXBsZS50ZXN0OjQ0Mw..&size=normal",
  hcaptcha: "https://newassets.hcaptcha.com/captcha/v1/0a1b2c3/static/hcaptcha.html#frame=checkbox&id=0abc&host=app.example.test",
  turnstile: "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/turnstile/if/ov2/av0/rcv/0abc/0x4AAAAAAA/light/fbE/new/normal/auto/",
} as const;

type FakeOptions = {
  password?: string; redirectOnSignIn?: string; driftAfterClick?: boolean;
  requestedPageShows?: "login-form" | "login-redirect" | "change-password";
  /** The right password is accepted and a verification-code prompt is shown instead of the app (an MFA challenge). */
  codePromptAfterPassword?: boolean;
  /** The `src` of every iframe each page RENDERS; `elsewhere` is every other page (`/twins`, `/down`). A page not named has none. */
  frames?: { login?: string[]; dashboard?: string[]; elsewhere?: string[] };
  /** The login page's text mentions a CAPTCHA (a cookie-policy table) but renders no widget. */
  loginPageSays?: "captcha-in-text";
  /** A challenge interstitial stands where the login form should be: nothing on it can be bound. */
  interstitialAtLogin?: boolean;
  frameReadFails?: boolean;
  /** The requested page is behind a session: without the `sid` cookie (and, if asked, the `token` in `localStorage`) it is the login wall, or an off-origin identity provider. */
  sessionRequired?: "login-wall" | "idp";
  storageRequired?: boolean;
};

/** What a saved state carries. NONE of these values may appear in a mark or an error message. */
const STATE_SESSION = "sessionvalue-4f9a1c07";
const STATE_TOKEN = "tokenvalue-7be2d915";
const OTHER_SITE_COOKIE = "othersitecookie-1122aa";
const OTHER_SITE_STORAGE = "othersitestorage-3344bb";
const STATE_PATH = "/state/saved.json";
const STATE: StorageState = {
  cookies: [
    { name: "sid", value: STATE_SESSION, domain: "app.example.test", path: "/", httpOnly: true, secure: true, sameSite: "Lax" },
    { name: "theme", value: "dark", domain: "app.example.test" },
    { name: "other", value: OTHER_SITE_COOKIE, domain: "other.example.org" },
  ],
  origins: [
    { origin: ORIGIN, localStorage: [{ name: "token", value: STATE_TOKEN }] },
    { origin: "https://other.example.org", localStorage: [{ name: "token", value: OTHER_SITE_STORAGE }] },
  ],
};
/** The same file after the session ended: the cookie is still there and no longer names a live session. */
const STALE_STATE: StorageState = { ...STATE, cookies: [{ ...STATE.cookies[0], value: "endedsession-00000000" }, ...STATE.cookies.slice(1)] };
const STATE_VALUES = [STATE_SESSION, STATE_TOKEN, OTHER_SITE_COOKIE, OTHER_SITE_STORAGE, "endedsession-00000000"];

/** The login page: the form, or a challenge interstitial in its place, or the form with a cookie-policy table that only SAYS captcha. */
function loginPage(options: FakeOptions, node: (role: string, name: string) => AxNode): AxNode[] {
  if (options.interstitialAtLogin) return [node("heading", "Just a moment...")];
  const form = [node("textbox", "Email address"), node("textbox", "Password"), node("button", "Sign in"), node("heading", "Sign in")];
  if (options.loginPageSays !== "captcha-in-text") return form;
  return [...form, node("StaticText", "Google re CAPTCHA"), node("StaticText", "Description of GRECAPTCHA set by Google")];
}

/** What a saved state loads INTO: the cookie jar and `localStorage` a page later reads, logged as they are set. */
function fakeSession(options: FakeOptions, log: string[]) {
  const jar: StateCookie[] = [];
  const storage = new Map<string, string>();
  return {
    holdsSession: () => jar.some((c) => c.name === "sid" && c.value === STATE_SESSION) && (!options.storageRequired || storage.get("token") === STATE_TOKEN),
    setCookies: async (cookies: readonly StateCookie[]) => { log.push(`setCookies:${cookies.map((c) => c.name).join(",")}`); jar.push(...cookies); },
    setLocalStorage: async (entries: readonly { name: string; value: string }[]) => {
      log.push(`setLocalStorage:${entries.map((e) => e.name).join(",")}`);
      for (const e of entries) storage.set(e.name, e.value);
    },
    loaded: () => ({ cookies: jar.map((c) => c.name), storage: [...storage.keys()] }),
    /** Where the requested page sends a browser that holds no session, or undefined when it may in. */
    bounce(url: string): { page: string; origin: string } | undefined {
      if (!options.sessionRequired || url !== URL_UNDER_TEST || this.holdsSession()) return undefined;
      return options.sessionRequired === "idp" ? { page: "https://idp.example.test/authorize", origin: "https://idp.example.test" } : { page: `${ORIGIN}/login`, origin: ORIGIN };
    },
  };
}

/** A tiny site: a login form, a dashboard, an off-origin identity provider, a verification-code prompt, a form with a password-type PIN. */
function fakeBrowser(options: FakeOptions = {}) {
  const password = options.password ?? FAKE_SECRET;
  /** A same-origin redirect: the requested page sends a session that did not hold to `/login`. */
  const redirected = (url: string) => (url === URL_UNDER_TEST && options.requestedPageShows === "login-redirect" ? `${ORIGIN}/login` : url);
  let page = "about:blank";
  let origin = "null";
  /** After the Sign-in click the page will move off-origin on its own, but only AFTER the next origin check: a late redirect. */
  let drifting = false;
  const typed: Array<{ field: string; text: string }> = [];
  const clicks: string[] = [];
  /** Every call that reaches the browser about the page or the state, in order: what the parity test compares beyond the outcome. */
  const log: string[] = [];
  const session = fakeSession(options, log);
  const nodes = (): AxNode[] => {
    let next = 0;
    const node = (role: string, name: string, extra: Partial<AxNode> = {}): AxNode => {
      next += 1;
      return { id: String(next), role, name, backendId: next, ignored: false, ...extra };
    };
    if (page.endsWith("/login")) return loginPage(options, node);
    if (page.endsWith("/orders") && options.requestedPageShows === "login-form") return [node("textbox", "Email address"), node("textbox", "Password"), node("button", "Sign in"), node("heading", "Sign in")];
    if (page.endsWith("/orders") && options.requestedPageShows === "change-password") return [node("heading", "Change password"), node("textbox", "Password"), node("button", "Save")];
    if (page.endsWith("/dashboard") || page.endsWith("/orders")) return [node("heading", "Dashboard"), node("link", "Sign out")];
    if (page.endsWith("/twins")) {
      const billing = node("group", "Billing");
      const shipping = node("group", "Shipping");
      return [billing, shipping, node("textbox", "Address", { parentId: billing.id }), node("textbox", "Address", { parentId: shipping.id })];
    }
    if (page.endsWith("/pin")) return [node("textbox", "PIN")];
    if (page.endsWith("/verify")) return [node("heading", "Verify your identity"), node("textbox", "Verification code"), node("button", "Verify")];
    if (page.endsWith("/authorize")) return [node("heading", "Dashboard")]; // the identity provider has a heading of the same name
    if (page.endsWith("/prefs")) return [node("checkbox", "Remember me"), node("combobox", "Country")];
    return [];
  };
  const named = (handle: number) => nodes().find((n) => n.backendId === handle)!;
  const driver: AuthDriver & { purge(origin: string): Promise<void> } = {
    navigate: async (url) => {
      log.push(`navigate:${url.slice(ORIGIN.length)}`);
      const bounced = session.bounce(url);
      if (bounced) { page = bounced.page; origin = bounced.origin; return { ok: true }; }
      page = redirected(url); origin = new URL(url).origin; return { ok: !url.endsWith("/down") };
    },
    origin: async () => {
      const answer = origin;
      if (drifting) { drifting = false; page = "https://idp.example.test/authorize"; origin = "https://idp.example.test"; }
      return answer;
    },
    axNodes: async () => nodes(),
    frameSources: async () => {
      if (options.frameReadFails) throw new Error("Execution context was destroyed");
      if (page.endsWith("/login")) return options.frames?.login ?? [];
      return (page.endsWith("/dashboard") ? options.frames?.dashboard : options.frames?.elsewhere) ?? [];
    },
    inputType: async (handle) => (["PIN", "Password"].includes(named(handle).name) ? "password" : "text"),
    fill: async (handle, text) => { typed.push({ field: named(handle).name, text }); },
    choose: async (_handle, option) => option === "United Kingdom",
    isChecked: async () => false,
    click: async (handle) => {
      const target = named(handle);
      clicks.push(target.name);
      if (target.name !== "Sign in") return;
      if (options.driftAfterClick) { drifting = true; return; }
      if (options.redirectOnSignIn) { page = `${options.redirectOnSignIn}/authorize`; origin = options.redirectOnSignIn; return; }
      if (typed.filter((t) => t.field === "Password").pop()?.text !== password) return;
      page = options.codePromptAfterPassword ? `${ORIGIN}/verify` : `${ORIGIN}/dashboard`;
    },
    setCookies: session.setCookies,
    setLocalStorage: session.setLocalStorage,
    purge: async () => undefined,
    close: async () => undefined,
  };
  return { typed, clicks, driver, log, loaded: session.loaded };
}

type Outcome = { log: string[]; loaded: unknown } & (
  { ok: true; typed: unknown; clicks: string[]; events: string[] } | { ok: false; fault: unknown; reason: unknown; message: string });

/** Run one scenario through one implementation and reduce it to what must be the SAME in both. */
async function through(implementation: "cli" | "worker", scenario: { login?: FlowStep[]; flow?: FlowStep[]; upTo?: number; browser?: FakeOptions; env?: Record<string, string | undefined>; state?: StorageState }): Promise<Outcome> {
  const browser = fakeBrowser(scenario.browser);
  const events: string[] = [];
  const marks: unknown[] = [];
  const mark = (event: string, detail: Record<string, unknown>) => { events.push(`${event}:${JSON.stringify(detail.name ?? detail.steps ?? "")}`); marks.push({ event, detail }); };
  const env = scenario.env ?? ENV;
  const secrets = [FAKE_USER, FAKE_SECRET, ...STATE_VALUES];
  const wire = { login: scenario.login ?? LOGIN, flow: scenario.flow, upTo: scenario.upTo, ...(scenario.state ? { state: { path: STATE_PATH } } : {}) };
  const seen = { log: browser.log, loaded: browser.loaded };
  try {
    if (implementation === "cli") {
      const state = scenario.state ? stateEntriesFor(scenario.state, ORIGIN) : undefined;
      await cliSignIn({ plan: wire as AuthPlan, url: URL_UNDER_TEST, driver: browser.driver, env, mark, bindTimeoutMs: BIND_MS, state });
    } else {
      const plan = withLoadedState(validateAuthRequest(wire, URL_UNDER_TEST), URL_UNDER_TEST, () => JSON.stringify(scenario.state));
      await workerSignIn({ plan, url: URL_UNDER_TEST, driver: browser.driver as never, env, mark, bindTimeoutMs: BIND_MS });
    }
    assert.ok(!secrets.some((secret) => JSON.stringify(marks).includes(secret)), `${implementation}: a mark carried a value`);
    return { ok: true, typed: browser.typed, clicks: browser.clicks, events, log: seen.log, loaded: seen.loaded() };
  } catch (error) {
    const e = error as Error & { fault?: string; code?: string; reason?: string };
    assert.ok(!secrets.some((secret) => e.message.includes(secret)), `${implementation}: an error carried a value`);
    return { ok: false, fault: e.fault ?? e.code, reason: e.reason, message: e.message, log: seen.log, loaded: seen.loaded() };
  }
}

/** Both implementations, same scenario: equal outcomes, and the caller's own expectation on top. */
async function both(scenario: Parameters<typeof through>[1]): Promise<Outcome> {
  const [cli, worker] = [await through("cli", scenario), await through("worker", scenario)];
  assert.equal(cli.ok, worker.ok, `the two interpreters disagree: cli ${JSON.stringify(cli)} vs worker ${JSON.stringify(worker)}`);
  assert.deepEqual(cli.log, worker.log, "the two interpreters drove the browser differently (page loads and state calls, in order)");
  assert.deepEqual(cli.loaded, worker.loaded, "the two interpreters loaded different state into the browser");
  if (cli.ok && worker.ok) {
    assert.deepEqual(cli.typed, worker.typed, "typed values differ");
    assert.deepEqual(cli.clicks, worker.clicks, "clicks differ");
    assert.deepEqual(cli.events, worker.events, "marks differ");
  } else if (!cli.ok && !worker.ok) {
    assert.equal(cli.fault, worker.fault, `faults differ: ${cli.message} | ${worker.message}`);
    assert.equal(cli.reason, worker.reason, `reasons differ: ${cli.message} | ${worker.message}`);
    // `FlowsError` appends " (rule: <rule>)" to its message, a suffix the worker's own errors do not carry; the sentence
    // BEFORE it is what the person reads, and it must be the same whichever layer refused.
    const sentence = (message: string) => message.replace(/ \(rule: [\w-]+\)$/, "");
    assert.equal(sentence(cli.message), sentence(worker.message), "the messages differ: the person sees a different sentence depending on which layer failed");
  }
  return cli;
}

const failsAs = (outcome: Outcome, fault: string, reason?: string) => {
  assert.ok(!outcome.ok, "expected a failure");
  if (!outcome.ok) {
    assert.equal(outcome.fault, fault, outcome.message);
    if (reason) assert.equal(outcome.reason, reason, outcome.message);
  }
};

test("a login runs to the dashboard and types the environment's values — identically in both", async () => {
  const outcome = await both({});
  assert.ok(outcome.ok);
  if (outcome.ok) {
    assert.deepEqual(outcome.typed, [{ field: "Email address", text: FAKE_USER }, { field: "Password", text: FAKE_SECRET }]);
    assert.deepEqual(outcome.clicks, ["Sign in"]);
    assert.equal(outcome.events[outcome.events.length - 1].startsWith("authApplied"), true);
  }
});

test("a wrong password is expect-not-met, naming the step, in both", async () => {
  const outcome = await both({ browser: { password: "something else" } });
  failsAs(outcome, "auth-login-failed", "expect-not-met");
  assert.match(String((outcome as { message: string }).message), /login step 5 \(expect\).*no heading "Dashboard"/);
});

test("a code prompt after the right password is expect-not-met, and reads exactly like a wrong password, in both", async () => {
  // THE POINT (known-gaps §51): the tool cannot tell an MFA challenge from a wrong password. The site accepted the password
  // and asked for a code instead of showing the app, and the run reports what it reports for a wrong one: the same fault, the
  // same reason and the same sentence, which names the `expect:` that was not met and never the page it saw instead.
  const prompted = await both({ browser: { codePromptAfterPassword: true } });
  const wrong = await both({ browser: { password: "something else" } });
  failsAs(prompted, "auth-login-failed", "expect-not-met");
  assert.match(String((prompted as { message: string }).message), /login step 5 \(expect\).*no heading "Dashboard"/);
  assert.equal((prompted as { message: string }).message, (wrong as { message: string }).message, "the message tells a code prompt from a wrong password, and known-gaps §51 says the tool cannot");
});

test("an unaddressable control is unbindable-field and says it is a 4.1.2 finding, in both", async () => {
  const outcome = await both({ login: [{ goto: "/login" }, { fill: { field: "E-mail", fromEnv: "APP_USER" } }, expectDashboard] });
  failsAs(outcome, "auth-login-failed", "unbindable-field");
  assert.match(String((outcome as { message: string }).message), /no control is named "E-mail".*4\.1\.2/s);
});

test("two controls with one name need within: or nth:, in both", async () => {
  const flow = (fill: Extract<FlowStep, { fill: unknown }>["fill"]): FlowStep[] => [{ goto: "/twins" }, { fill }];
  failsAs(await both({ flow: flow({ field: "Address", value: "1 High St" }) }), "auth-login-failed", "unbindable-field");
  for (const ref of [{ field: "Address", within: "Billing" }, { field: "Address", nth: 2 }]) {
    const outcome = await both({ flow: flow({ ...ref, value: "1 High St" }) });
    assert.ok(outcome.ok, JSON.stringify(ref));
  }
  failsAs(await both({ flow: flow({ field: "Address", nth: 3, value: "x" }) }), "auth-login-failed", "unbindable-field");
});

test("a redirect off the origin after a press is left-origin, and SSO is named, in both", async () => {
  const outcome = await both({ browser: { redirectOnSignIn: "https://idp.example.test" } });
  failsAs(outcome, "auth-login-failed", "left-origin");
  assert.match(String((outcome as { message: string }).message), /idp\.example\.test.*SSO.*dedicated test account/s);
});

test("CONTROL: a redirect that stays on the SAME origin is not left-origin — the reading is about the origin, not the redirect, in both", async () => {
  // The same press, the same `/authorize` page with the same "Dashboard" heading as the identity provider above. Only the
  // origin differs, so it is the only thing that can make one of them `left-origin` and this one a signed-in run.
  const outcome = await both({ browser: { redirectOnSignIn: ORIGIN } });
  assert.ok(outcome.ok, JSON.stringify(outcome));
});

test("a heading on ANOTHER SITE does not satisfy an expect: a late off-origin redirect is left-origin, in both", async () => {
  // The redirect lands after the post-press origin check, so only `expect`'s own check can see it. Without that check the
  // identity provider's "Dashboard" heading satisfies the expect, and the run is reported signed in.
  const outcome = await both({ browser: { driftAfterClick: true } });
  failsAs(outcome, "auth-login-failed", "left-origin");
});

// A CAPTCHA IS NAMED, NEVER ANSWERED (#2564). The check runs only where a step ALREADY failed, so each scenario below is
// one of: a failure a widget explains (three vendors, two ways to fail), or a case that must NOT be explained as one.
const CHALLENGE_VENDORS = [["recaptcha", "reCAPTCHA"], ["hcaptcha", "hCaptcha"], ["turnstile", "Cloudflare Turnstile"]] as const;

test("a login that stops at a widget fails as auth-challenge-detected, naming the vendor and the step, for each vendor, in both", async () => {
  for (const [key, vendor] of CHALLENGE_VENDORS) {
    const outcome = await both({ browser: { password: "not accepted while the widget is unsolved", frames: { login: [WIDGET_SOURCES[key]] } } });
    failsAs(outcome, "auth-challenge-detected");
    const message = (outcome as { message: string }).message;
    assert.match(message, new RegExp(`login step 5 \\(expect\\).*${vendor}`, "s"), key);
    assert.match(message, /never answers one/, `${key}: the sentence says it names and does not solve`);
    assert.match(message, /expect-not-met: no heading "Dashboard"/, `${key}: the reason the step failed is kept`);
  }
});

test("a challenge that replaces the login form (nothing to bind) is auth-challenge-detected, not unbindable-field, in both", async () => {
  const outcome = await both({ browser: { interstitialAtLogin: true, frames: { login: [WIDGET_SOURCES.turnstile] } } });
  failsAs(outcome, "auth-challenge-detected");
  assert.match((outcome as { message: string }).message, /login step 2 \(fill\).*Cloudflare Turnstile.*unbindable-field: no control is named "Email address"/s);
});

test("POSITIVE CONTROL: a page with no widget keeps the shipped failure, auth-login-failed / expect-not-met, in both", async () => {
  failsAs(await both({ browser: { password: "something else" } }), "auth-login-failed", "expect-not-met");
  failsAs(await both({ browser: { interstitialAtLogin: true } }), "auth-login-failed", "unbindable-field");
});

test("POSITIVE CONTROL: a page that only SAYS captcha in its text is not a challenge, in both", async () => {
  // The real shape is a cookie-policy table ("Google re CAPTCHA ... Description of GRECAPTCHA set by Google",
  // packages/evidence/src/fixtures-exhausted-887.json): the words are there and no widget is.
  failsAs(await both({ browser: { password: "something else", loginPageSays: "captcha-in-text" } }), "auth-login-failed", "expect-not-met");
});

test("POSITIVE CONTROL: a widget on a page whose expect: IS met does not trip, and the run is applied, in both", async () => {
  // A dashboard carrying a reCAPTCHA v3 badge, or an invisible Turnstile, passes. Detection explains a failure and never makes one.
  const outcome = await both({ browser: { frames: { login: [WIDGET_SOURCES.recaptcha], dashboard: [WIDGET_SOURCES.recaptcha, WIDGET_SOURCES.turnstile] } } });
  assert.ok(outcome.ok, "the widget must not turn a met expect: into a failure");
  if (outcome.ok) assert.equal(outcome.events[outcome.events.length - 1].startsWith("authApplied"), true);
});

test("a frame the check cannot match falls through to the shipped failure: a vendor it does not know, or a frame with no src, in both", async () => {
  // The limit is a test and not a hope. `recaptcha.net`, Arkose and a site's own challenge are not named.
  for (const source of ["https://www.recaptcha.net/recaptcha/api2/anchor?k=x", "https://client-api.arkoselabs.com/fc/gc/", "https://app.example.test/challenge", ""]) {
    failsAs(await both({ browser: { password: "something else", frames: { login: [source] } } }), "auth-login-failed", "expect-not-met");
  }
});

test("only a step that failed for lack of a control is explained: an ambiguous control or an unloadable goto keeps its own reason, in both", async () => {
  const widget = { frames: { login: [WIDGET_SOURCES.hcaptcha], elsewhere: [WIDGET_SOURCES.hcaptcha] } };
  const flow = (fill: Extract<FlowStep, { fill: unknown }>["fill"]): FlowStep[] => [{ goto: "/twins" }, { fill }];
  failsAs(await both({ flow: flow({ field: "Address", value: "1 High St" }), browser: widget }), "auth-login-failed", "unbindable-field");
  failsAs(await both({ login: [{ goto: "/login" }, { goto: "/down" }, expectDashboard], browser: widget }), "auth-login-failed", "expect-not-met");
});

test("a frame list that cannot be read leaves the original failure standing and says why it could not look, in both", async () => {
  const outcome = await both({ browser: { password: "something else", frameReadFails: true } });
  failsAs(outcome, "auth-login-failed", "expect-not-met");
  assert.match((outcome as { message: string }).message, /no heading "Dashboard".*frames could not be read to check for a CAPTCHA: Execution context was destroyed/s);
});

test("the frame read keeps a frame only if it is RENDERED, and the two copies of the expression are one string", () => {
  assert.equal(WORKER_FRAME_SOURCES_EXPRESSION, FRAME_SOURCES_EXPRESSION, "the worker's copy and the CLI's have drifted");
  const frame = (src: string, rects: number, visibility = "visible") => ({ src, getClientRects: () => ({ length: rects }), visibility });
  const read = (frames: unknown[]) => new Function("document", "getComputedStyle", `return ${FRAME_SOURCES_EXPRESSION};`)(
    { querySelectorAll: (selector: string) => { assert.equal(selector, "iframe"); return frames; } },
    (element: { visibility: string }) => ({ visibility: element.visibility }),
  );
  assert.deepEqual(read([frame("https://a.test/shown", 1), frame("https://a.test/display-none", 0), frame("https://a.test/hidden", 1, "hidden")]),
    ["https://a.test/shown"], "a frame with no client rects (display: none) or visibility: hidden is not a challenge in front of the user");
});

test("THE HELPERS, through both: challengeVendor names the same vendor for every source, worker and CLI", () => {
  const sources: string[][] = [
    [], [""], ["not a url"], [WIDGET_SOURCES.recaptcha], [WIDGET_SOURCES.hcaptcha], [WIDGET_SOURCES.turnstile],
    ["https://recaptcha.google.com/recaptcha/api2/bframe?k=x"], ["https://hcaptcha.com/1/api.js"], ["https://js.hcaptcha.com/x"],
    ["http://www.google.com/recaptcha/api2/anchor"], ["https://www.google.com/maps/embed?pb=x"], ["https://www.google.com/"],
    ["https://evilhcaptcha.com/x"], ["https://hcaptcha.com.evil.test/x"], ["https://challenges.cloudflare.com.evil.test/x"],
    ["https://www.recaptcha.net/recaptcha/api2/anchor"], ["https://WWW.GOOGLE.COM/recaptcha/api2/anchor"],
    [WIDGET_SOURCES.turnstile, WIDGET_SOURCES.hcaptcha],
  ];
  for (const list of sources) {
    assert.equal(workerChallengeVendor(list), challengeVendor(list), `challengeVendor disagrees for ${JSON.stringify(list)}`);
  }
  const answers = new Set(sources.map((list) => challengeVendor(list)));
  assert.deepEqual([...answers].sort(), [undefined, "Cloudflare Turnstile", "hCaptcha", "reCAPTCHA"].sort(), "the table must cover every vendor and a miss");
  assert.equal(challengeVendor(["https://www.google.com/maps/embed?pb=x"]), undefined, "google.com is not reCAPTCHA off the /recaptcha/ path");
  assert.equal(challengeVendor(["https://hcaptcha.com.evil.test/x"]), undefined, "a host that merely starts with a vendor's name is not the vendor");
});

test("after a successful login the requested URL serves the login form: auth-session-lost, in place or by redirect, in both", async () => {
  for (const requestedPageShows of ["login-form", "login-redirect"] as const) {
    const outcome = await both({ browser: { requestedPageShows } });
    failsAs(outcome, "auth-session-lost");
    assert.match((outcome as { message: string }).message, /"Email address", "Password"/, requestedPageShows);
    assert.ok(!(outcome as { message: string }).message.includes("expect-not-met"), "it is not a login failure");
  }
});

test("after a successful login the requested URL serves the app: no fault, authApplied is marked, in both", async () => {
  const outcome = await both({});
  assert.ok(outcome.ok);
  if (outcome.ok) assert.equal(outcome.events[outcome.events.length - 1].startsWith("authApplied"), true);
});

test("ONE control named like ONE login field is not the login wall: a change-password page is no fault, in both", async () => {
  const outcome = await both({ browser: { requestedPageShows: "change-password" } });
  assert.ok(outcome.ok, "a lone Password box is not the login form");
});

test("a login that fills nothing has no form to recognise: the wall check never fires, in both", async () => {
  // `[].every(...)` is true, so an empty fill list would call EVERY page the login wall. The plan has no fill, and the
  // requested page is the login form, and the run must still be reported signed in.
  const outcome = await both({ login: [{ goto: "/dashboard" }, expectDashboard], browser: { requestedPageShows: "login-form" } });
  assert.ok(outcome.ok);
});

test("a literal into a password-type input is auth-literal-secret and is never typed, in both", async () => {
  const outcome = await both({ flow: [{ goto: "/pin" }, { fill: { field: "PIN", value: "1234" } }] });
  failsAs(outcome, "auth-literal-secret");
  assert.ok(!(outcome as { message: string }).message.includes("1234"));
  const ok = await both({ flow: [{ goto: "/pin" }, { fill: { field: "PIN", fromEnv: "APP_USER" } }] });
  assert.ok(ok.ok, "the control: a from-env value into the same field is fine");
});

test("the flow is replayed to upTo and no further, in both", async () => {
  const outcome = await both({ flow: [{ goto: "/pin" }, { capture: "before" }, { fill: { field: "PIN", fromEnv: "APP_USER" } }], upTo: 2 });
  assert.ok(outcome.ok);
  if (outcome.ok) assert.ok(!(outcome.typed as Array<{ field: string }>).some((t) => t.field === "PIN"));
});

test("choose and check act, and an option that does not exist is unbindable-field, in both", async () => {
  const outcome = await both({ flow: [{ goto: "/prefs" }, { check: { field: "Remember me", checked: true } }, { choose: { field: "Country", option: "United Kingdom" } }] });
  assert.ok(outcome.ok);
  if (outcome.ok) assert.ok(outcome.clicks.includes("Remember me"));
  failsAs(await both({ flow: [{ goto: "/prefs" }, { choose: { field: "Country", option: "Atlantis" } }] }), "auth-login-failed", "unbindable-field");
});

test("a goto that cannot load ends the run, in both", async () => {
  failsAs(await both({ login: [{ goto: "/down" }, expectDashboard] }), "auth-login-failed", "expect-not-met");
});

test("a missing credential is auth-credential-missing in both, naming the variable and never a value", async () => {
  const outcome = await both({ env: { APP_USER: FAKE_USER } });
  failsAs(outcome, "auth-credential-missing");
  assert.match(String((outcome as { message: string }).message), /APP_PASSWORD/);
});

// ---- ADR 0038, amendment 7: a saved storage state signs in INSTEAD of the login -------------------------------------------

const SESSION_SITE: FakeOptions = { sessionRequired: "login-wall", storageRequired: true };
const LOGIN_PAGE_URL_PART = "/login";

test("STATE: a valid saved state reaches the signed-in page with NO form login: the login's goto, fill and press never run, in both", async () => {
  // No variables at all: a state run reads none of the login's, and would end auth-credential-missing if it did.
  const outcome = await both({ state: STATE, browser: SESSION_SITE, env: {} });
  assert.ok(outcome.ok, JSON.stringify(outcome));
  if (!outcome.ok) return;
  assert.deepEqual(outcome.typed, [], "a fill ran");
  assert.deepEqual(outcome.clicks, [], "a press ran");
  assert.equal(outcome.log.filter((entry) => entry.includes(LOGIN_PAGE_URL_PART)).length, 0, `the login page was loaded: ${outcome.log}`);
  // Cookies first, then the requested page, then localStorage, then a reload, then (after the expect) the requested page once more.
  assert.deepEqual(outcome.log, ["setCookies:sid,theme", "navigate:/orders", "setLocalStorage:token", "navigate:/orders", "navigate:/orders"]);
  assert.deepEqual(outcome.events, ['authStateLoaded:""', 'authStep:"Dashboard"', 'authApplied:1']);
});

test("STATE: only the pinned origin's cookies and localStorage reach the browser, in both", async () => {
  const outcome = await both({ state: STATE, browser: SESSION_SITE, env: {} });
  assert.deepEqual(outcome.loaded, { cookies: ["sid", "theme"], storage: ["token"] }, "another site's cookie or storage was loaded");
});

test("STATE: an EXPIRED state ends auth-state-expired, not a capture of the login wall, in both — and the same page on a form login is still expect-not-met", async () => {
  const outcome = await both({ state: STALE_STATE, browser: SESSION_SITE, env: {} });
  failsAs(outcome, "auth-state-expired");
  assert.match((outcome as { message: string }).message, /login step 5 \(expect\).*no heading "Dashboard" appeared within 1 s/);
  // POSITIVE CONTROL: the login wall a form login meets when it does not get in keeps its shipped reading.
  failsAs(await both({ browser: { password: "wrong-password-value" } }), "auth-login-failed", "expect-not-met");
  // ...and a wrong password on a state run's twin is unchanged too: the form path never says expired.
  const wrong = await both({ browser: { password: "wrong-password-value", sessionRequired: "login-wall" } });
  assert.notEqual((wrong as { fault?: unknown }).fault, "auth-state-expired");
});

test("STATE: an expired single-sign-on session (the page is off the pinned origin) ends auth-state-expired, naming the origin and not advising a test account, in both", async () => {
  // The identity provider's page carries a heading named like the dashboard's, so the expect: IS met, on the wrong site.
  const outcome = await both({ state: STALE_STATE, browser: { ...SESSION_SITE, sessionRequired: "idp" }, env: {} });
  failsAs(outcome, "auth-state-expired");
  const { message } = outcome as { message: string };
  assert.match(message, /the page is on https:\/\/idp\.example\.test, not https:\/\/app\.example\.test/);
  assert.doesNotMatch(message, /use a dedicated test account/, "the form login's advice is wrong for a saved state");
  // CONTROL: the form login's own left-origin keeps its sentence, advice and all.
  const form = await both({ browser: { redirectOnSignIn: "https://idp.example.test" } });
  failsAs(form, "auth-login-failed", "left-origin");
  assert.match((form as { message: string }).message, /use a dedicated test account/);
});

test("STATE: a CAPTCHA widget on the expired page is still auth-challenge-detected, in both", async () => {
  const outcome = await both({ state: STALE_STATE, env: {}, browser: { ...SESSION_SITE, frames: { login: [WIDGET_SOURCES.recaptcha] } } });
  failsAs(outcome, "auth-challenge-detected");
});

test("STATE: localStorage is set BEFORE the reload: a state that carries the cookie and not the token is expired on a site that needs both, in both", async () => {
  const cookieOnly: StorageState = { ...STATE, origins: [] };
  failsAs(await both({ state: cookieOnly, browser: SESSION_SITE, env: {} }), "auth-state-expired");
  // CONTROL: the same site, the same cookie, when it does not need the token.
  const outcome = await both({ state: cookieOnly, browser: { sessionRequired: "login-wall" }, env: {} });
  assert.ok(outcome.ok, JSON.stringify(outcome));
});

test("STATE: auth-session-lost still runs after: an expect that holds on the login wall does not read an expired state as good, in both", async () => {
  const expectsSignInButton: FlowStep = { expect: { kind: "control", name: "Sign in", timeoutSeconds: 1 } };
  const outcome = await both({ login: [...LOGIN.slice(0, -1), expectsSignInButton], state: STALE_STATE, browser: SESSION_SITE, env: {} });
  failsAs(outcome, "auth-session-lost");
});

test("STATE: the flow's steps still run after the state is loaded, and its clicks are the flow's alone, in both", async () => {
  const outcome = await both({
    state: STATE, browser: SESSION_SITE, env: {}, flow: [{ goto: "/prefs" }, { check: { field: "Remember me", checked: true } }],
  });
  assert.ok(outcome.ok, JSON.stringify(outcome));
  if (outcome.ok) {
    assert.deepEqual(outcome.clicks, ["Remember me"]);
    assert.ok(outcome.log.includes("navigate:/prefs"));
  }
});

test("STATE: a plan that names a state and is handed no entries (or the reverse) refuses, in both", async () => {
  const plan = { login: LOGIN, state: { path: STATE_PATH } };
  const browser = fakeBrowser();
  await assert.rejects(cliSignIn({ plan, url: URL_UNDER_TEST, driver: browser.driver, env: {}, mark: () => undefined }), /needs its entries/);
  await assert.rejects(cliSignIn({ plan: { login: LOGIN }, url: URL_UNDER_TEST, driver: browser.driver, env: {}, mark: () => undefined, state: stateEntriesFor(STATE, ORIGIN) }), /needs its entries/);
  await assert.rejects(workerSignIn({ plan: validateAuthRequest(plan, URL_UNDER_TEST), url: URL_UNDER_TEST, driver: browser.driver as never, env: {}, mark: () => undefined }), /needs its entries/);
});

/** State files the two layers must read alike, most of them wrong in one way. Each names where it is wrong and none carries a value in its refusal. */
const STATE_FILES: Array<{ label: string; text: string; problem: RegExp | null }> = [
  { label: "a valid state", text: JSON.stringify(STATE), problem: null },
  { label: "an empty state", text: JSON.stringify({ cookies: [], origins: [] }), problem: null },
  { label: "text that is not JSON", text: `sid=${STATE_SESSION}; theme=dark`, problem: /is not valid JSON/ },
  { label: "a list", text: JSON.stringify([STATE]), problem: /the top level must be an object/ },
  { label: "no cookies list", text: JSON.stringify({ origins: [] }), problem: /no "cookies" list/ },
  { label: "no origins list", text: JSON.stringify({ cookies: [] }), problem: /no "origins" list/ },
  { label: "a cookie with no value", text: JSON.stringify({ cookies: [{ name: STATE_SESSION, domain: "a.test" }], origins: [] }), problem: /cookies\[1\] has no string "value"/ },
  { label: "a cookie with an empty domain", text: JSON.stringify({ cookies: [STATE.cookies[1], { ...STATE.cookies[0], domain: "" }], origins: [] }), problem: /cookies\[2\] has an empty "domain"/ },
  { label: "a cookie with a bad sameSite", text: JSON.stringify({ cookies: [{ ...STATE.cookies[0], sameSite: STATE_SESSION }], origins: [] }), problem: /cookies\[1\] has a "sameSite" that is not Strict, Lax or None/ },
  { label: "a cookie whose expires is a string", text: JSON.stringify({ cookies: [{ ...STATE.cookies[0], expires: STATE_SESSION }], origins: [] }), problem: /cookies\[1\] has an "expires" that is not a number/ },
  { label: "an origin with no localStorage list", text: JSON.stringify({ cookies: [], origins: [{ origin: ORIGIN }] }), problem: /origins\[1\] has no "localStorage" list/ },
  { label: "a storage item with a numeric value", text: JSON.stringify({ cookies: [], origins: [{ origin: ORIGIN, localStorage: [{ name: "a", value: "b" }, { name: STATE_TOKEN, value: 7 }] }] }), problem: /origins\[1\]\.localStorage\[2\] is not an object with a string "name" and a string "value"/ },
];

test("STATE FILES, through both: the same files are accepted and refused, with the same reason, and no refusal quotes the file", () => {
  for (const { label, text, problem } of STATE_FILES) {
    let cli: string | undefined;
    let worker: string | undefined;
    try { parseStorageState(text, STATE_PATH); } catch (error) { cli = (error as Error).message; }
    try { workerLoadStateEntries(STATE_PATH, URL_UNDER_TEST, () => text); } catch (error) { worker = (error as Error).message; }
    if (problem === null) {
      assert.equal(cli, undefined, `${label}: the CLI refused a good file`);
      assert.equal(worker, undefined, `${label}: the worker refused a good file`);
      continue;
    }
    assert.ok(cli !== undefined && worker !== undefined, `${label}: refused by cli=${cli !== undefined}, worker=${worker !== undefined}`);
    assert.match(cli, problem, label);
    assert.equal(cli.replace(/ \(rule: [\w-]+\)$/, ""), worker, `${label}: the person reads a different sentence depending on which layer read the file`);
    assert.ok(cli.includes(STATE_PATH), `${label}: the path is what a refusal names`);
    for (const value of [STATE_SESSION, STATE_TOKEN, "sid=", "theme=dark"]) assert.ok(!cli.includes(value) && !worker.includes(value), `${label}: a refusal quoted the file`);
  }
  // The table is not vacuous on either side: some files pass and most refuse.
  assert.ok(STATE_FILES.some(({ problem }) => problem === null) && STATE_FILES.filter(({ problem }) => problem !== null).length >= 8);
  // The shape check the two share agrees on parsed values too.
  for (const { text, problem } of STATE_FILES.filter(({ text: t }) => t.startsWith("{") || t.startsWith("["))) {
    assert.equal(workerStateShapeProblem(JSON.parse(text)), stateShapeProblem(JSON.parse(text)));
    assert.equal(stateShapeProblem(JSON.parse(text)) === undefined, problem === null);
  }
});

test("STATE FILES: a file that cannot be read is refused naming the path and the reason, in both", () => {
  const unreadable = () => { throw new Error(`ENOENT: no such file or directory, open '${STATE_PATH}'`); };
  assert.throws(() => workerLoadStateEntries(STATE_PATH, URL_UNDER_TEST, unreadable), /the state file \/state\/saved\.json could not be read \(ENOENT/);
});

test("THE STATE HELPERS, through both: stateEntriesFor, cookieParam and the localStorage function agree", () => {
  const origins = [ORIGIN, "https://sub.app.example.test", "https://other.example.org", "https://notexample.test"];
  const sample: StorageState = { ...STATE, cookies: [...STATE.cookies, { name: "wide", value: "widecookievalue-9", domain: ".example.test" }] };
  for (const origin of origins) assert.deepEqual(workerStateEntriesFor(sample, origin), stateEntriesFor(sample, origin), `stateEntriesFor disagrees for ${origin}`);
  assert.deepEqual(stateEntriesFor(sample, ORIGIN).cookies.map((c) => c.name), ["sid", "theme", "wide"], "the table selects something");
  const cookies: StateCookie[] = [
    ...sample.cookies,
    { name: "session", value: "v-123456789", domain: "app.example.test", expires: -1 },
    { name: "persistent", value: "v-123456789", domain: "app.example.test", expires: 1900000000, secure: false, httpOnly: false },
  ];
  for (const cookie of cookies) assert.deepEqual(workerCookieParam(cookie), cookieParam(cookie), `cookieParam disagrees for ${cookie.name}`);
  assert.equal(cookieParam(cookies[cookies.length - 2]).expires, undefined, "a session cookie (-1) carries no expiry");
  assert.equal(cookieParam(cookies[cookies.length - 1]).expires, 1900000000);
  assert.equal(cookieParam({ name: "n", value: "v", domain: "a.test" }).path, "/", "a cookie with no path gets one");
  assert.equal(WORKER_SET_LOCAL_STORAGE_FUNCTION, SET_LOCAL_STORAGE_FUNCTION, "the two copies of the fixed function are one string");
  // The function takes the entries as an ARGUMENT, so nothing from a file is ever in the text that runs.
  assert.ok(!SET_LOCAL_STORAGE_FUNCTION.includes(STATE_TOKEN));
});

const NODES: AxNode[] = [
  { id: "1", role: "group", name: "Billing", ignored: false },
  { id: "2", role: "textbox", name: "  Address\n line ", parentId: "1", backendId: 2, ignored: false },
  { id: "3", role: "textbox", name: "Address line", backendId: 3, ignored: false },
  { id: "4", role: "textbox", name: "Address line", backendId: 4, ignored: true },
  { id: "5", role: "heading", name: "Dashboard", ignored: false },
  { id: "6", role: "group", name: "Shipping", parentId: "1", ignored: false },
  { id: "7", role: "button", name: "Sign in", parentId: "6", backendId: 7, ignored: false },
  { id: "8", role: "combobox", name: "Country", backendId: 8, ignored: false },
  { id: "9", role: "link", name: "Sign out", backendId: 9, ignored: false },
  { id: "10", role: "StaticText", name: "Welcome back, Ada", ignored: false },
];

/** Every query the interpreters ask of `controlsNamed`, plus ones built to make two copies disagree: whitespace, an ignored twin, a nested group, a role outside the set. */
const QUERIES: Array<{ roles: string[]; name: string; within?: string }> = [
  { roles: ["textbox"], name: "Address line" },
  { roles: ["textbox"], name: "  address\tline " },
  { roles: ["textbox"], name: "Address line", within: "Billing" },
  { roles: ["textbox"], name: "Address line", within: "Shipping" },
  { roles: ["button"], name: "Sign in", within: "Billing" },
  { roles: ["button"], name: "Sign in", within: "Shipping" },
  { roles: ["button", "link"], name: "Sign out" },
  { roles: ["combobox", "listbox"], name: "Country" },
  { roles: ["textbox"], name: "Country" },
  { roles: ["textbox"], name: "Address line", within: "Nowhere" },
];

const EXPECTATIONS: Array<{ kind: "heading" | "control" | "text"; name: string }> = [
  { kind: "heading", name: "Dashboard" },
  { kind: "heading", name: "Address line" },
  { kind: "control", name: "Sign in" },
  { kind: "control", name: "Dashboard" },
  { kind: "control", name: "Address line" },
  { kind: "text", name: "Dash" },
  { kind: "text", name: "Welcome back" },
  { kind: "text", name: "nothing of the kind" },
];

test("THE HELPERS, through both: controlsNamed returns the same controls for every query, worker and CLI", () => {
  for (const query of QUERIES) {
    const cli = controlsNamed(NODES, query).map((node) => node.id);
    const worker = workerControlsNamed(NODES, query).map((node: AxNode) => node.id);
    assert.deepEqual(worker, cli, `controlsNamed disagrees for ${JSON.stringify(query)}`);
  }
  // The table is not vacuous: it contains queries that match one control, several, and none.
  const sizes = new Set(QUERIES.map((query) => controlsNamed(NODES, query).length));
  assert.ok(sizes.has(0) && sizes.has(1) && sizes.has(2), `the table must cover no match, one and two: ${[...sizes]}`);
  assert.deepEqual(controlsNamed(NODES, { roles: ["textbox"], name: "Address line", within: "Billing" }).map((n) => n.id), ["2"]);
});

test("THE HELPERS, through both: expectationMet agrees on every expectation, worker and CLI", () => {
  for (const expected of EXPECTATIONS) {
    assert.equal(workerExpectationMet(NODES, expected), expectationMet(NODES, expected), `expectationMet disagrees for ${JSON.stringify(expected)}`);
  }
  const answers = new Set(EXPECTATIONS.map((expected) => expectationMet(NODES, expected)));
  assert.deepEqual([...answers].sort(), [false, true], "the table must contain expectations that are met and ones that are not");
  assert.ok(expectationMet(NODES, { kind: "heading", name: "Dashboard" }));
  assert.ok(!expectationMet(NODES, { kind: "heading", name: "Address line" }), "a textbox is not a heading");
  // An ignored node satisfies nothing, in either copy.
  const onlyIgnored: AxNode[] = [{ id: "1", role: "heading", name: "Dashboard", ignored: true }];
  assert.equal(expectationMet(onlyIgnored, { kind: "heading", name: "Dashboard" }), false);
  assert.equal(workerExpectationMet(onlyIgnored, { kind: "heading", name: "Dashboard" }), false);
});

test("THE HELPERS, through both: requiredEnvNames finds the same variables, and stops at the capture point in both", () => {
  const plans: Array<{ login: FlowStep[]; flow?: FlowStep[]; upTo?: number; state?: { path: string } }> = [
    { login: LOGIN },
    { login: LOGIN, flow: [{ fill: { field: "PIN", fromEnv: "APP_PIN" } }], upTo: 0 },
    { login: LOGIN, flow: [{ fill: { field: "PIN", fromEnv: "APP_PIN" } }], upTo: 1 },
    { login: LOGIN, flow: [{ fill: { field: "PIN", fromEnv: "APP_PIN" } }, { fill: { field: "Note", value: "literal" } }, { fill: { field: "Two", fromEnv: "APP_PIN" } }] },
    { login: [...LOGIN.slice(0, -1), { fill: { field: "Again", fromEnv: "APP_USER" } }, LOGIN[LOGIN.length - 1]] },
    { login: LOGIN, state: { path: STATE_PATH } },
    { login: LOGIN, flow: [{ fill: { field: "PIN", fromEnv: "APP_PIN" } }], upTo: 1, state: { path: STATE_PATH } },
  ];
  for (const plan of plans) {
    const workerPlan = validateAuthRequest(plan, URL_UNDER_TEST);
    assert.deepEqual([...workerRequiredEnvNames(workerPlan)].sort(), [...requiredEnvNames(plan)].sort(), `requiredEnvNames disagrees for ${JSON.stringify(plan)}`);
  }
  assert.deepEqual(requiredEnvNames({ login: LOGIN, flow: [{ fill: { field: "PIN", fromEnv: "APP_PIN" } }], upTo: 0 }).sort(), ["APP_PASSWORD", "APP_USER"]);
  assert.deepEqual(requiredEnvNames({ login: LOGIN, flow: [{ fill: { field: "PIN", fromEnv: "APP_PIN" } }], upTo: 1 }).sort(), ["APP_PASSWORD", "APP_PIN", "APP_USER"]);
  // A state run performs no login, so it reads none of the login's variables, but still reads the flow's.
  assert.deepEqual(requiredEnvNames({ login: LOGIN, state: { path: STATE_PATH } }), []);
  assert.deepEqual(requiredEnvNames({ login: LOGIN, flow: [{ fill: { field: "PIN", fromEnv: "APP_PIN" } }], upTo: 1, state: { path: STATE_PATH } }), ["APP_PIN"]);
});
