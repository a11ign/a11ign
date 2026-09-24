// THE CLI'S INTERPRETER, AND ITS PARITY WITH THE WORKER'S (ADR 0038, "The rule layer logs in for itself").
//
// There are two interpreters because there cannot be one (the worker is plain `.mjs`, and neither package imports
// the other in production). So this file is the lock: every scenario below runs through BOTH over ONE fake browser,
// and the two must reach the SAME outcome — the same typed values, the same clicks, the same marks, the same fault
// and reason. A scenario that only one of them handles is a defect in the other, and this is where it shows.
import { test } from "node:test";
import assert from "node:assert/strict";

import { signIn as workerSignIn, validateAuthRequest } from "../../../nvda-worker/src/auth-flow.mjs";
import { signIn as cliSignIn, controlsNamed, expectationMet, requiredEnvNames, type AuthDriver, type AuthPlan, type AxNode } from "./interpreter.js";
import type { FlowStep } from "./flows.js";

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

/** A tiny site: a login form, a dashboard, an off-origin identity provider, a form with a password-type PIN. */
function fakeBrowser(options: { password?: string; redirectOnSignIn?: string; driftAfterClick?: boolean } = {}) {
  const password = options.password ?? FAKE_SECRET;
  let page = "about:blank";
  let origin = "null";
  /** After the Sign-in click the page will move off-origin on its own, but only AFTER the next origin check: a late redirect. */
  let drifting = false;
  const typed: Array<{ field: string; text: string }> = [];
  const clicks: string[] = [];
  const nodes = (): AxNode[] => {
    let next = 0;
    const node = (role: string, name: string, extra: Partial<AxNode> = {}): AxNode => {
      next += 1;
      return { id: String(next), role, name, backendId: next, ignored: false, ...extra };
    };
    if (page.endsWith("/login")) return [node("textbox", "Email address"), node("textbox", "Password"), node("button", "Sign in"), node("heading", "Sign in")];
    if (page.endsWith("/dashboard") || page.endsWith("/orders")) return [node("heading", "Dashboard"), node("link", "Sign out")];
    if (page.endsWith("/twins")) {
      const billing = node("group", "Billing");
      const shipping = node("group", "Shipping");
      return [billing, shipping, node("textbox", "Address", { parentId: billing.id }), node("textbox", "Address", { parentId: shipping.id })];
    }
    if (page.endsWith("/pin")) return [node("textbox", "PIN")];
    if (page.endsWith("/authorize")) return [node("heading", "Dashboard")]; // the identity provider has a heading of the same name
    if (page.endsWith("/prefs")) return [node("checkbox", "Remember me"), node("combobox", "Country")];
    return [];
  };
  const named = (handle: number) => nodes().find((n) => n.backendId === handle)!;
  const driver: AuthDriver & { purge(origin: string): Promise<void> } = {
    navigate: async (url) => { page = url; origin = new URL(url).origin; return { ok: !url.endsWith("/down") }; },
    origin: async () => {
      const answer = origin;
      if (drifting) { drifting = false; page = "https://idp.example.test/authorize"; origin = "https://idp.example.test"; }
      return answer;
    },
    axNodes: async () => nodes(),
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
      if (typed.filter((t) => t.field === "Password").pop()?.text === password) page = `${ORIGIN}/dashboard`;
    },
    purge: async () => undefined,
    close: async () => undefined,
  };
  return { typed, clicks, driver };
}

type Outcome = { ok: true; typed: unknown; clicks: string[]; events: string[] } | { ok: false; fault: unknown; reason: unknown; message: string };

/** Run one scenario through one implementation and reduce it to what must be the SAME in both. */
async function through(implementation: "cli" | "worker", scenario: { login?: FlowStep[]; flow?: FlowStep[]; upTo?: number; browser?: Parameters<typeof fakeBrowser>[0]; env?: Record<string, string | undefined> }): Promise<Outcome> {
  const browser = fakeBrowser(scenario.browser);
  const events: string[] = [];
  const marks: unknown[] = [];
  const mark = (event: string, detail: Record<string, unknown>) => { events.push(`${event}:${JSON.stringify(detail.name ?? detail.steps ?? "")}`); marks.push({ event, detail }); };
  const env = scenario.env ?? ENV;
  try {
    if (implementation === "cli") {
      const plan: AuthPlan = { login: scenario.login ?? LOGIN, flow: scenario.flow, upTo: scenario.upTo };
      await cliSignIn({ plan, url: URL_UNDER_TEST, driver: browser.driver, env, mark, bindTimeoutMs: BIND_MS });
    } else {
      const plan = validateAuthRequest({ login: scenario.login ?? LOGIN, flow: scenario.flow, upTo: scenario.upTo }, URL_UNDER_TEST);
      await workerSignIn({ plan, url: URL_UNDER_TEST, driver: browser.driver as never, env, mark, bindTimeoutMs: BIND_MS });
    }
    assert.ok(!JSON.stringify(marks).includes(FAKE_USER) && !JSON.stringify(marks).includes(FAKE_SECRET), `${implementation}: a mark carried a value`);
    return { ok: true, typed: browser.typed, clicks: browser.clicks, events };
  } catch (error) {
    const e = error as Error & { fault?: string; code?: string; reason?: string };
    assert.ok(!e.message.includes(FAKE_USER) && !e.message.includes(FAKE_SECRET), `${implementation}: an error carried a value`);
    return { ok: false, fault: e.fault ?? e.code, reason: e.reason, message: e.message };
  }
}

/** Both implementations, same scenario: equal outcomes, and the caller's own expectation on top. */
async function both(scenario: Parameters<typeof through>[1]): Promise<Outcome> {
  const [cli, worker] = [await through("cli", scenario), await through("worker", scenario)];
  assert.equal(cli.ok, worker.ok, `the two interpreters disagree: cli ${JSON.stringify(cli)} vs worker ${JSON.stringify(worker)}`);
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

test("a heading on ANOTHER SITE does not satisfy an expect: a late off-origin redirect is left-origin, in both", async () => {
  // The redirect lands after the post-press origin check, so only `expect`'s own check can see it. Without that check the
  // identity provider's "Dashboard" heading satisfies the expect, and the run is reported signed in.
  const outcome = await both({ browser: { driftAfterClick: true } });
  failsAs(outcome, "auth-login-failed", "left-origin");
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

test("the matching functions and the environment scan, as the worker's", () => {
  const nodes: AxNode[] = [
    { id: "1", role: "group", name: "Billing", ignored: false },
    { id: "2", role: "textbox", name: "  Address\n line ", parentId: "1", backendId: 2, ignored: false },
    { id: "3", role: "textbox", name: "Address line", backendId: 3, ignored: false },
    { id: "4", role: "textbox", name: "Address line", backendId: 4, ignored: true },
    { id: "5", role: "heading", name: "Dashboard", ignored: false },
  ];
  assert.equal(controlsNamed(nodes, { roles: ["textbox"], name: "Address line" }).length, 2);
  assert.deepEqual(controlsNamed(nodes, { roles: ["textbox"], name: "Address line", within: "Billing" }).map((n) => n.id), ["2"]);
  assert.ok(expectationMet(nodes, { kind: "heading", name: "Dashboard" }));
  assert.ok(!expectationMet(nodes, { kind: "heading", name: "Address line" }));
  assert.ok(expectationMet(nodes, { kind: "text", name: "Dash" }));
  assert.deepEqual(requiredEnvNames({ login: LOGIN, flow: [{ fill: { field: "PIN", fromEnv: "APP_PIN" } }], upTo: 0 }).sort(), ["APP_PASSWORD", "APP_USER"]);
});
