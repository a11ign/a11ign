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
  PRESSING_OFF_NOTICE, loginCount, loginNotice, pressedByThisRun, repositoryPrivacy, resolveAuthentication, type ResolveRequest,
} from "./resolve.js";
import { parseArgs } from "../cli.js";

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
  axe: true,
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
  assert.match(resolved.notices[1], /will perform 2 logins \(one per capture, and one per page for the rule layer/);
  assert.equal(resolved.notices.length, 2, "no judge notice for the local backend");
  assert.ok(!JSON.stringify(resolved.notices).includes(FAKE_USER) && !JSON.stringify(resolved.notices).includes(FAKE_SECRET));
});

test("the login count is per capture, plus one per page for the rule layer, and says so", () => {
  assert.equal(loginCount({ pages: 1, axe: true }), 2);
  assert.equal(loginCount({ pages: 1, axe: false }), 1);
  assert.equal(loginCount({ pages: 3, axe: true }), 6);
  assert.match(loginNotice({ pages: 1, axe: false }), /will perform 1 login \(one per capture; more if a capture has to be repeated\)/);
  assert.match(loginNotice({ pages: 2, axe: true }), /dedicated test account/);
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
