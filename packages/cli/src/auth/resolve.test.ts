// ARGUMENT RESOLUTION FOR AN AUTHENTICATED RUN (ADR 0038, PR 7): everything decided before a worker is leased.
//
// Each refusal is asserted by the named error, and each is followed by its control — the same run with the one thing
// fixed — so a refusal that fires on everything would fail here. `authenticated-run.test.ts` drives the same decisions
// through the real CLI process.
import { test } from "node:test";
import assert from "node:assert/strict";

import { FlowsError } from "./flows.js";
import { ScrubError } from "./scrub.js";
import { AuthError } from "./auth-faults.js";
import {
  PRESSING_OFF_NOTICE, loginNotice, pressedByThisRun, repositoryPrivacy, resolveAuthentication, type ResolveRequest,
} from "./resolve.js";
import { parseArgs } from "../cli.js";
import { DEFAULT_MAX_PAGES, MAX_CAPTURE_ATTEMPTS, MAX_LOGINS, CEILING_PAGES, PageListError, minimumLogins, worstCaseLogins } from "../multi-page.js";

const ORIGIN = "https://app.example.test";
const FAKE_USER = "canaryuser6d3f2a";
const FAKE_SECRET = "canarysecretb81c94";
const ENV = { APP_USER: FAKE_USER, APP_PASSWORD: FAKE_SECRET };

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
  literal:
    steps:
      - fill: { field: "Email address", value: "ada@example.test" }
      - expect: { heading: "Dashboard" }
`;

type Over = Omit<Partial<ResolveRequest>, "args"> & { args?: Partial<ResolveRequest["args"]> };
const request = (over: Over = {}): ResolveRequest => ({
  args: { flows: "flows.yml", loginFlow: "login", sendAuthenticatedTranscriptToJudgeVendor: false, ...over.args },
  urls: [`${ORIGIN}/orders`],
  task: "Read and understand this page",
  axe: true,
  countCaptures: async () => 1,
  env: ENV,
  readText: async (path) => { if (path === "flows.yml") return FLOWS; throw new Error(`no such file ${path}`); },
  isPdf: (url) => url.endsWith(".pdf"),
  ...Object.fromEntries(Object.entries(over).filter(([key]) => key !== "args")),
});

const refusedAs = async (run: Promise<unknown>, check: (e: Error & { fault?: string; rule?: string }) => boolean, label: string) =>
  assert.rejects(run, (e: Error & { fault?: string; rule?: string }) => { assert.ok(check(e), `${label}: ${e.name}: ${e.message}`); return true; });

const withJudge = async <T>(backend: string | undefined, run: () => Promise<T>): Promise<T> => {
  const before = process.env.JUDGE_BACKEND;
  if (backend === undefined) delete process.env.JUDGE_BACKEND; else process.env.JUDGE_BACKEND = backend;
  try { return await run(); } finally { if (before === undefined) delete process.env.JUDGE_BACKEND; else process.env.JUDGE_BACKEND = before; }
};

test("a run that asks for no authentication resolves to null and changes nothing", async () => {
  assert.equal(await resolveAuthentication(request({ args: { flows: null, loginFlow: null } })), null);
});

test("a valid request resolves: the login's steps, a scrub set, the probes turned off, and the notices in order", async () => {
  const resolved = await withJudge("local", () => resolveAuthentication(request()));
  assert.ok(resolved);
  assert.equal(resolved.auth.login.length, 5);
  assert.deepEqual(resolved.scrubSet.credentials.map((c) => c.name).sort(), ["APP_PASSWORD", "APP_USER"]);
  assert.deepEqual(resolved.overrides, { probeForms: false, probeNavigation: false });
  assert.equal(resolved.notices[0], PRESSING_OFF_NOTICE);
  assert.match(resolved.notices[1], /will perform at least 2 logins \(a minimum: one per capture, and one per capture for the rule layer\)/);
  assert.equal(resolved.notices.length, 2, "no judge notice for the local backend");
  assert.ok(!JSON.stringify(resolved.notices).includes(FAKE_USER) && !JSON.stringify(resolved.notices).includes(FAKE_SECRET));
});

test("the pre-run notice states a MINIMUM and says so, and names what a repeated capture can raise it to", () => {
  const notice = loginNotice({ captures: 3, axe: true });
  assert.match(notice, /will perform at least 6 logins \(a minimum: one per capture, and one per capture for the rule layer\)/);
  assert.match(notice, /can reach 12; the run reports how many it performed/, `3 captures x (${MAX_CAPTURE_ATTEMPTS} attempts + 1 scan)`);
  assert.match(loginNotice({ captures: 1, axe: false }), /at least 1 login \(a minimum: one per capture\)\. .*can reach 3;/);
  assert.match(loginNotice({ captures: 2, axe: true }), /dedicated test account/);
});

test("the floor and the worst case are arithmetic on captures, not pages: form states count", () => {
  assert.equal(minimumLogins({ captures: 3, axe: true }), 6);
  assert.equal(minimumLogins({ captures: 3, axe: false }), 3);
  assert.equal(worstCaseLogins({ captures: 5, axe: true }), 20);
  assert.equal(worstCaseLogins({ captures: 5, axe: false }), 15);
});

test("LOCKOUT GUARD: the default 5-page run is ADMITTED (floor 10, worst case 20); a run at the page ceiling is REFUSED (floor 50), before any capture", async () => {
  const pages = (count: number) => Array.from({ length: count }, (_, i) => `${ORIGIN}/page-${i + 1}`);
  const resolveFor = (count: number, axe = true, captures = count) => withJudge("local",
    () => resolveAuthentication(request({ urls: pages(count), axe, countCaptures: async () => captures })));
  assert.equal(MAX_LOGINS, DEFAULT_MAX_PAGES * (MAX_CAPTURE_ATTEMPTS + 1), "the constant is the default run's worst case, derived");
  assert.equal(worstCaseLogins({ captures: DEFAULT_MAX_PAGES, axe: true }), MAX_LOGINS);
  const admitted = await resolveFor(DEFAULT_MAX_PAGES);
  assert.match(admitted?.notices[1] ?? "", /at least 10 logins/, "the admitted default run states its floor: 10");
  await refusedAs(resolveFor(CEILING_PAGES), (e) => e instanceof PageListError && /at least 50 logins/.test(e.message)
    && /MAX_LOGINS is 20/.test(e.message) && /There is no override/.test(e.message) && /Nothing was captured, and no worker was leased/.test(e.message), "the ceiling run");
  // The edge, both sides: floor 20 is at the bound and admitted, floor 22 is past it and refused.
  assert.ok(await resolveFor(10));
  await refusedAs(resolveFor(11), (e) => e instanceof PageListError && /at least 22 logins/.test(e.message), "one capture past the bound");
  // Without the rule layer the floor halves, and the refusal stops naming --no-axe as a remedy it already took.
  assert.ok(await resolveFor(20, false));
  await refusedAs(resolveFor(21, false), (e) => e instanceof PageListError && /at least 21 logins/.test(e.message) && !/--no-axe/.test(e.message), "no rule layer");
});

test("LOCKOUT GUARD counts CAPTURES: ONE url with twelve form states is refused, though it is one page", async () => {
  await refusedAs(withJudge("local", () => resolveAuthentication(request({ countCaptures: async () => 12 }))),
    (e) => e instanceof PageListError && /at least 24 logins/.test(e.message), "one page, twelve states");
});

test("a run that asks for no authentication never counts its captures: nothing is read for it", async () => {
  let counted = 0;
  await resolveAuthentication(request({ args: { flows: null, loginFlow: null }, countCaptures: async () => { counted += 1; return 99; } }));
  assert.equal(counted, 0);
});

test("--flows without --login-flow, or the reverse, is refused; the override alone is refused", async () => {
  await refusedAs(resolveAuthentication(request({ args: { loginFlow: null } })), (e) => e instanceof FlowsError && e.rule === "login-flow-missing" && /--flows needs --login-flow/.test(e.message), "flows alone");
  await refusedAs(resolveAuthentication(request({ args: { flows: null } })), (e) => e instanceof FlowsError && e.rule === "login-flow-missing" && /--login-flow needs --flows/.test(e.message), "login-flow alone");
  await refusedAs(resolveAuthentication(request({ args: { flows: null, loginFlow: null, sendAuthenticatedTranscriptToJudgeVendor: true } })),
    (e) => e instanceof FlowsError && /only means something on an authenticated run/.test(e.message), "override alone");
});

test("a flows file that cannot be read is a usage error naming the file, not a crash", async () => {
  await refusedAs(resolveAuthentication(request({ args: { flows: "missing.yml" } })), (e) => e instanceof FlowsError && e.rule === "file-shape" && /missing\.yml could not be read/.test(e.message), "unreadable");
});

test("a login flow that is missing, has a literal, or a URL off the pinned origin is refused, before anything else runs", async () => {
  await refusedAs(resolveAuthentication(request({ args: { loginFlow: "signin" } })), (e) => e instanceof FlowsError && e.rule === "login-flow-missing", "no such flow");
  await refusedAs(resolveAuthentication(request({ args: { loginFlow: "literal" } })), (e) => e instanceof FlowsError && e.rule === "login-literal", "a literal in the login");
  await refusedAs(resolveAuthentication(request({ urls: ["https://production.example.test/orders"] })), (e) => e instanceof FlowsError && e.rule === "origin-pinned", "the wrong origin");
  await refusedAs(resolveAuthentication(request({ urls: [`${ORIGIN}/orders`, "https://evil.test/x"] })), (e) => e instanceof FlowsError && e.rule === "origin-pinned", "the SECOND url");
  await refusedAs(resolveAuthentication(request({ urls: [`${ORIGIN}/report.pdf`] })), (e) => e instanceof FlowsError && /PDF.*no login/.test(e.message), "a PDF");
});

test("a URL or a task that carries a login value is refused before anything is captured — naming the variable and the argument, never the value", async () => {
  const onlyOrigin = `${ORIGIN}/orders`;
  for (const [label, over] of [
    ["a same-origin query token", { urls: [`${onlyOrigin}?token=${FAKE_SECRET}`] }],
    ["the value URL-encoded in the path", { urls: [`${onlyOrigin}/${encodeURIComponent(FAKE_USER)}`] }],
    ["the SECOND url", { urls: [onlyOrigin, `${onlyOrigin}?u=${FAKE_USER}`] }],
    ["the task", { task: `Sign in as ${FAKE_USER} and read the orders` }],
  ] as const) {
    await assert.rejects(resolveAuthentication(request(over)), (e: Error & { fault?: string }) => {
      assert.equal(e.fault, "auth-credential-in-artifact", label);
      assert.ok(!e.message.includes(FAKE_USER) && !e.message.includes(FAKE_SECRET), `${label}: the message must not print the value`);
      return true;
    });
  }
  // The control: the same run with the value taken out resolves, so the refusal is not on every run.
  assert.notEqual(await resolveAuthentication(request({ urls: [`${onlyOrigin}?page=2`], task: "Read the orders" })), null);
});

test("a variable that is missing is auth-credential-missing, and one below the floor is auth-credential-too-short — naming the variable, never the value", async () => {
  await refusedAs(resolveAuthentication(request({ env: { APP_USER: FAKE_USER } })), (e) => e instanceof AuthError && e.fault === "auth-credential-missing" && /APP_PASSWORD/.test(e.message), "missing");
  await refusedAs(resolveAuthentication(request({ env: { ...ENV, APP_USER: "admin" } })), (e) => e instanceof ScrubError && e.fault === "auth-credential-too-short" && /APP_USER/.test(e.message) && !e.message.includes("admin "), "too short");
  await refusedAs(resolveAuthentication(request({ env: { ...ENV, APP_PASSWORD: "" } })), (e) => e instanceof AuthError && e.fault === "auth-credential-missing", "empty");
});

test("AUTH + A NON-LOCAL JUDGE BACKEND is refused at resolution; the override lets it through and names the vendor", async () => {
  await withJudge("anthropic", async () => {
    await refusedAs(resolveAuthentication(request()), (e) => e instanceof AuthError && e.fault === "auth-refused-judge-backend", "no override");
    const resolved = await resolveAuthentication(request({ args: { sendAuthenticatedTranscriptToJudgeVendor: true } }));
    assert.match(resolved!.notices.join("\n"), /the transcript will be sent to the judge vendor "anthropic"/);
  });
  // A run that asked for no authentication is not held to it, whatever the backend.
  await withJudge("anthropic", async () => assert.equal(await resolveAuthentication(request({ args: { flows: null, loginFlow: null } })), null));
});

test("AMENDMENT 3 on GitHub Actions: a repository that is not private refuses the run whole; a private one does not", async () => {
  const event = (isPrivate: unknown) => JSON.stringify({ repository: isPrivate === undefined ? {} : { private: isPrivate } });
  const onAction = (payload: string | null): Over => ({
    env: { ...ENV, GITHUB_ACTIONS: "true", GITHUB_EVENT_PATH: "event.json" },
    readText: async (path) => { if (path === "flows.yml") return FLOWS; if (path === "event.json" && payload !== null) return payload; throw new Error("unreadable"); },
  });
  for (const payload of [event(false), event(undefined), event("false"), "not json", null]) {
    await refusedAs(withJudge("local", () => resolveAuthentication(request(onAction(payload)))),
      (e) => e instanceof AuthError && e.fault === "auth-refused-public-repository", String(payload));
  }
  assert.ok(await withJudge("local", () => resolveAuthentication(request(onAction(event(true))))), "private: true resolves");
  // Off GitHub Actions the check does not apply: a person on their own machine publishes nothing by running it.
  assert.ok(await withJudge("local", () => resolveAuthentication(request({ env: { ...ENV, GITHUB_EVENT_PATH: "event.json" } }))));
  assert.deepEqual(await repositoryPrivacy({}, async () => "{}"), { onGithubActions: false, isPrivate: undefined });
});

test("what this run pressed: the controls its files name, by accessible name, in order, and never a value", async () => {
  const resolved = await withJudge("local", () => resolveAuthentication(request()));
  assert.deepEqual(pressedByThisRun(resolved!.auth), ["Sign in"]);
  assert.deepEqual(pressedByThisRun({ login: [], flow: [{ check: { field: "Remember me", checked: true } }, { choose: { field: "Country", option: "United Kingdom" } }, { fill: { field: "Note", value: "hello" } }, { press: { control: "Continue" } }], upTo: 4 }),
    ["Remember me", "Country", "Continue"]);
  assert.deepEqual(pressedByThisRun({ login: [], flow: [{ press: { control: "A" } }, { press: { control: "B" } }], upTo: 1 }), ["A"], "steps past the capture point are not pressed");
  assert.ok(!JSON.stringify(pressedByThisRun(resolved!.auth)).includes("United Kingdom"));
});

test("what this run pressed, with a forms config: its check/choose fields and its submit control, by name, and never a value", async () => {
  const resolved = await withJudge("local", () => resolveAuthentication(request()));
  const formState = {
    state: "empty", submit: "Save order",
    fields: [{ field: "Note", value: "hello" }, { field: "Remember me", check: true }, { field: "Country", choose: "United Kingdom" }],
  };
  const pressed = pressedByThisRun(resolved!.auth, formState);
  assert.deepEqual(pressed, ["Sign in", "Remember me", "Country", "Save order"], "the login first, then the state's toggles, then its submit");
  assert.ok(!JSON.stringify(pressed).includes("hello") && !JSON.stringify(pressed).includes("United Kingdom"), "no value");
  assert.deepEqual(pressedByThisRun(resolved!.auth), ["Sign in"], "no forms config: the list is what the login named, as before");
  assert.deepEqual(pressedByThisRun({ login: [] }, { submit: "Send", fields: [] }), ["Send"], "a forms config alone still presses its submit");
});

test("the new flags parse: --flows, --login-flow and the override, as an argument", () => {
  const args = parseArgs(["https://app.example.test/orders", "--flows", "a11y-flows.yml", "--login-flow", "login", "--send-authenticated-transcript-to-judge-vendor"]);
  assert.equal(args.flows, "a11y-flows.yml");
  assert.equal(args.loginFlow, "login");
  assert.equal(args.sendAuthenticatedTranscriptToJudgeVendor, true);
  const plain = parseArgs(["https://app.example.test/"]);
  assert.deepEqual([plain.flows, plain.loginFlow, plain.sendAuthenticatedTranscriptToJudgeVendor], [null, null, false]);
});

test("the override cannot be set from the environment", () => {
  for (const variable of ["A11Y_SEND_AUTHENTICATED_TRANSCRIPT_TO_JUDGE_VENDOR", "SEND_AUTHENTICATED_TRANSCRIPT_TO_JUDGE_VENDOR", "A11Y_ALLOW_AUTH_JUDGE"]) {
    const before = process.env[variable];
    process.env[variable] = "true";
    try { assert.equal(parseArgs(["https://app.example.test/"]).sendAuthenticatedTranscriptToJudgeVendor, false, variable); }
    finally { if (before === undefined) delete process.env[variable]; else process.env[variable] = before; }
  }
});
