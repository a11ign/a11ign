// A SCAN WHOSE FLOWS FILE CARRIES A `login:` BLOCK SIGNS IN BY IT, AND TELLS THE WORKER THE BLOCK'S VARIABLE NAMES (v3 login
// phase 2, #5054; the worker's half is #4998).
//
// The wire shape asserted here is the one `@a11ign/screenreader-worker` v0.11.0's `validateAuthRequest` accepts, read from the
// published package: `loginBlock` with `usernameEnv`, `passwordEnv`, `totpEnv`, `check` and `organization`, NO `login` key beside
// it (the worker refuses a request carrying both, `[]` included), and the identity-provider origins as `auth.idpOrigins`.
//
// Every refusal is paired with its control, and every request that is serialised is searched for the marker VALUES: a block
// names variables, and the one thing it must never do is send what they hold.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve as resolvePath } from "node:path";

import { parse as parseYaml } from "yaml";

import { AuthError } from "./auth-faults.js";
import { EXPECT_DEFAULT_SECONDS, FlowsError, parseFlowsFile } from "./flows.js";
import { loginBlockPlan, parseLoginBlock, ruleLayerPlanOf } from "./login-block.js";
import { onTheWire, type AuthRequest } from "./refusals.js";
import { BLOCK_UNUSED_NOTICE, LOGIN_BLOCK_NOTICE, resolveAuthentication, type ResolveRequest } from "./resolve.js";
import { captureViaWorker, PageSignedOutError, recheckedSignIn } from "../cli.js";
import type { Page } from "playwright";

const ORIGIN = "https://app.example.test";
const HTTP_OK = 200;
const LOGIN_FLOW_STEPS = 5;
// Markers, not credentials: long enough to be scrubbed, and distinctive enough that finding one in text is a leak.
const USER_VALUE = "canaryuser6d3f2a";
const PASSWORD_VALUE = "canarysecretb81c94";
const TOTP_VALUE = "canarytotp4e7a10c2";
const ENV = { APP_USER: USER_VALUE, APP_PASSWORD: PASSWORD_VALUE, APP_TOTP: TOTP_VALUE };
const VALUES = Object.values(ENV);

const BLOCK = `
login:
  url: ${ORIGIN}/login
  username: APP_USER
  password: APP_PASSWORD
  totp: APP_TOTP
  organization: Acme Corp
  check: { role: heading, name: Dashboard }
`;
const FLOWS_BLOCK = `version: 1\norigin: ${ORIGIN}\n${BLOCK}`;
const FLOW = `
flows:
  login:
    steps:
      - goto: /login
      - fill: { field: "Email address", from-env: APP_USER }
      - fill: { field: "Password", from-env: APP_PASSWORD }
      - press: "Sign in"
      - expect: { heading: "Dashboard" }
`;

type Over = Omit<Partial<ResolveRequest>, "args"> & { args?: Partial<ResolveRequest["args"]> };
const request = (flows: string, over: Over = {}): ResolveRequest => ({
  args: { flows: "flows.yml", loginFlow: null, authState: null, sendAuthenticatedTranscriptToJudgeVendor: false, ...over.args },
  urls: [`${ORIGIN}/orders`],
  task: "Read and understand this page",
  axe: true,
  countCaptures: async () => 1,
  env: ENV,
  readText: async (path) => { if (path === "flows.yml") return flows; throw new Error(`no such file ${path}`); },
  isPdf: (url) => url.endsWith(".pdf"),
  ...Object.fromEntries(Object.entries(over).filter(([key]) => key !== "args")),
});

const refused = async (run: Promise<unknown>): Promise<Error & { rule?: string; fault?: string }> => {
  try {
    await run;
  } catch (error) {
    return error as Error & { rule?: string; fault?: string };
  }
  return assert.fail("the run was not refused");
};

const resolved = async (flows: string, over: Over = {}) => {
  const out = await resolveAuthentication(request(flows, over));
  assert.ok(out, "authentication was asked for");
  return out;
};

const noValue = (text: string, label: string) => {
  for (const value of VALUES) assert.ok(!text.includes(value), `${label} carries a variable's VALUE`);
};

test("POSITIVE CONTROL: --flows alone, with a login: block, sends the block's NAMES and no steps", async () => {
  const { auth, notices } = await resolved(FLOWS_BLOCK);
  assert.deepEqual(auth.login, [], "the block is the login: no steps");
  assert.deepEqual(auth.loginBlock, {
    url: `${ORIGIN}/login`, usernameEnv: "APP_USER", passwordEnv: "APP_PASSWORD", totpEnv: "APP_TOTP",
    check: { role: "heading", name: "Dashboard" }, organization: "Acme Corp",
  });
  assert.ok(notices.includes(LOGIN_BLOCK_NOTICE), "a block run says it signs in by the loop");
  assert.ok(!notices.includes(BLOCK_UNUSED_NOTICE));
  noValue(notices.join("\n"), "a notice");
});

test("POSITIVE CONTROL: the rule layer signs in by the plan `login --check` builds from the same block", async () => {
  const { auth } = await resolved(FLOWS_BLOCK);
  const checks = loginBlockPlan(parseLoginBlock((parseYaml(FLOWS_BLOCK) as { login: unknown }).login), { expectSeconds: EXPECT_DEFAULT_SECONDS });
  assert.deepEqual(ruleLayerPlanOf(auth, { expectSeconds: EXPECT_DEFAULT_SECONDS }), checks.plan);
  assert.deepEqual(checks.plan.login, [
    { goto: "/login" }, { auto: true }, { expect: { kind: "heading", name: "Dashboard", timeoutSeconds: EXPECT_DEFAULT_SECONDS } },
  ]);
  // The same function, not a second spelling of it: `cli.ts` builds its plan through `loginBlockPlan` and no longer by hand.
  const cli = readFileSync(resolvePath(process.cwd(), "packages/cli/src/cli.ts"), "utf8");
  assert.ok(cli.includes("loginBlockPlan(parseLoginBlock(raw)"), "login --check builds the block's plan through the shared function");
  assert.ok(!cli.includes("{ auto: true }, { expect: stop }"), "and keeps no second copy of the plan");
});

test("POSITIVE CONTROL: the request on the wire is the worker's shape, with no `login` key and the idp origins beside the block", async () => {
  const withIdp = FLOWS_BLOCK.replace("  organization: Acme Corp\n", "  organization: Acme Corp\n  idp-origins: [https://login.idp.example.test]\n");
  const { auth } = await resolved(withIdp);
  const wire = onTheWire(auth) as Record<string, unknown>;
  assert.deepEqual(Object.keys(wire).sort(), ["idpOrigins", "loginBlock"], "no login key: the worker refuses both together");
  assert.deepEqual(wire.idpOrigins, ["https://login.idp.example.test"]);
  assert.deepEqual(Object.keys(wire.loginBlock as object).sort(), ["check", "organization", "passwordEnv", "totpEnv", "url", "usernameEnv"]);
});

test("the request a block run SERIALISES carries the three names and not one value", async () => {
  const { auth } = await resolved(FLOWS_BLOCK);
  const text = JSON.stringify(onTheWire(auth));
  for (const name of ["APP_USER", "APP_PASSWORD", "APP_TOTP"]) assert.ok(text.includes(name), `${name} is named`);
  noValue(text, "the request");
  console.log(`block run, auth as sent: ${text}`);
});

test("the request that actually reaches a worker is the same, as the HTTP body", async () => {
  const received: Array<{ auth?: Record<string, unknown> }> = [];
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      received.push(JSON.parse(raw) as { auth?: Record<string, unknown> });
      res.writeHead(HTTP_OK);
      res.end(JSON.stringify({ transcript: ["Dashboard, heading level 1"], authApplied: true }));
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  try {
    const { auth } = await resolved(FLOWS_BLOCK);
    const worker = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await captureViaWorker(`${ORIGIN}/orders`, {
      task: "t", worker, probeForms: false, probeFocus: false, probeNavigation: false, probeFocusContext: false, probeFocusReveal: false, auth,
    });
    assert.equal(received.length, 1);
    const body = received[0].auth as Record<string, unknown>;
    assert.ok(!("login" in body), "no login key on the wire");
    assert.deepEqual(body.loginBlock, auth.loginBlock);
    noValue(JSON.stringify(received[0]), "the body");
  } finally {
    await new Promise<void>((done) => { server.close(() => done()); server.closeAllConnections(); });
  }
});

test("NEGATIVE CONTROL: a flow named by --login-flow and no block resolves exactly as it did (no loginBlock key)", async () => {
  const { auth } = await resolved(`version: 1\norigin: ${ORIGIN}\n${FLOW}`, { args: { loginFlow: "login" } });
  assert.ok(!("loginBlock" in auth), "an AuthRequest with no block is the shape on the wire today");
  assert.equal(auth.login.length, LOGIN_FLOW_STEPS);
  assert.deepEqual(onTheWire(auth), auth, "and goes out unchanged");
});

test("NEGATIVE CONTROL: --flows alone, with a file that has no block, is still refused as login-flow-missing", async () => {
  const error = await refused(resolveAuthentication(request(`version: 1\norigin: ${ORIGIN}\n${FLOW}`)));
  assert.ok(error instanceof FlowsError);
  assert.equal(error.rule, "login-flow-missing");
  assert.match(error.message, /--flows needs --login-flow/);
});

test("NEGATIVE CONTROL: a literal where a variable NAME belongs is refused login-literal, and the refusal prints no value", async () => {
  const literal = "otpauth://totp/Ada?secret=JBSWY3DPEHPK3PXPLITERAL";
  let counted = 0;
  const error = await refused(resolveAuthentication(request(
    FLOWS_BLOCK.replace("totp: APP_TOTP", `totp: "${literal}"`), { countCaptures: async () => { counted += 1; return 1; } },
  )));
  assert.ok(error instanceof FlowsError, "a caller's mistake (exit 2), not a stack trace");
  assert.equal(error.rule, "login-literal");
  assert.ok(!error.message.includes("JBSWY3DPEHPK3PXPLITERAL"), "no value in the refusal");
  assert.equal(counted, 0, "refused before anything was counted, let alone leased");
  // CONTROL: the same file with a NAME is the positive control above.
  assert.ok(await resolveAuthentication(request(FLOWS_BLOCK)));
});

test("NEGATIVE CONTROL: a block whose check is a url: is refused on the scan path, by a named rule", async () => {
  const urlCheck = FLOWS_BLOCK.replace("check: { role: heading, name: Dashboard }", `check: { url: ${ORIGIN}/home }`);
  const error = await refused(resolveAuthentication(request(urlCheck)));
  assert.ok(error instanceof FlowsError);
  assert.equal(error.rule, "login-check-url");
  // `login --check` is refused by the same rule, from the same function.
  const block = parseLoginBlock((parseYaml(urlCheck) as { login: unknown }).login);
  assert.throws(() => loginBlockPlan(block, { expectSeconds: EXPECT_DEFAULT_SECONDS }), (e: Error & { rule?: string }) => e.rule === "login-check-url");
});

test("a run missing any ONE of the three variables is refused before anything is leased, naming it and no value", async () => {
  for (const name of ["APP_USER", "APP_PASSWORD", "APP_TOTP"] as const) {
    const { [name]: gone, ...rest } = ENV;
    void gone;
    const error = await refused(resolveAuthentication(request(FLOWS_BLOCK, { env: rest })));
    assert.ok(error instanceof AuthError, `${name}: ${error.message}`);
    assert.equal(error.fault, "auth-credential-missing");
    assert.ok(error.message.includes(name), "names the variable");
    noValue(error.message, `the refusal for ${name}`);
  }
});

test("a block is hidden from the run's output: the scrub set holds all three values", async () => {
  const { scrubSet } = await resolved(FLOWS_BLOCK);
  assert.deepEqual(scrubSet.credentials.map((c) => c.value).sort(), [...VALUES].sort());
});

test("a task or URL that carries one of the block's values is refused, as a flow's is", async () => {
  const error = await refused(resolveAuthentication(request(FLOWS_BLOCK, { task: `sign in as ${USER_VALUE}` })));
  assert.ok(!error.message.includes(USER_VALUE));
});

test("BOTH a flow and a block: the flow is what signs in, and the notice says the block is not used", async () => {
  const { auth, notices } = await resolved(`version: 1\norigin: ${ORIGIN}\n${BLOCK}${FLOW}`, { args: { loginFlow: "login" } });
  assert.ok(!("loginBlock" in auth));
  assert.ok(notices.includes(BLOCK_UNUSED_NOTICE));
  assert.ok(!notices.includes(LOGIN_BLOCK_NOTICE));
});

test("a block with --auth-state is refused: a saved state stands in for a named flow, and a block names none", async () => {
  const error = await refused(resolveAuthentication(request(FLOWS_BLOCK, { args: { authState: "/tmp/state.json" } })));
  assert.ok(error instanceof FlowsError);
  assert.equal(error.rule, "login-flow-missing");
});

test("a block's URL off the file's origin is refused origin-pinned, where the file is read", () => {
  const error = (() => {
    try { parseFlowsFile(FLOWS_BLOCK.replace(`url: ${ORIGIN}/login`, "url: https://other.example.test/login")); } catch (e) { return e as FlowsError; }
    return assert.fail("accepted");
  })();
  assert.equal(error.rule, "origin-pinned");
});

test("a file that is only a login: block parses, and a file with neither a block nor flows is refused as before", () => {
  const file = parseFlowsFile(FLOWS_BLOCK);
  assert.deepEqual(file.flows, []);
  assert.equal(file.login?.url, `${ORIGIN}/login`);
  assert.throws(() => parseFlowsFile(`version: 1\norigin: ${ORIGIN}\n`), (e: FlowsError) => e.rule === "file-shape" && /flows: lists nothing/.test(e.message));
  // A key nobody defines is still refused: accepting `login:` did not open the file to others.
  assert.throws(() => parseFlowsFile(`${FLOWS_BLOCK}logon: {}\n`), (e: FlowsError) => e.rule === "unknown-key");
});

test("the block's own refusals reach a flows file as the rule that refused", () => {
  const cases: Array<[string, string]> = [
    ["login-no-check", FLOWS_BLOCK.replace("  check: { role: heading, name: Dashboard }\n", "")],
    ["login-unknown-key", FLOWS_BLOCK.replace("  organization: Acme Corp\n", "  organisation: Acme Corp\n")],
    ["login-url-not-http", FLOWS_BLOCK.replace(`url: ${ORIGIN}/login`, "url: javascript:alert(1)")],
  ];
  for (const [rule, text] of cases) {
    assert.throws(() => parseFlowsFile(text), (e: FlowsError) => e instanceof FlowsError && e.rule === rule, rule);
  }
});

test("a request with no block is its own rule-layer plan", () => {
  const plain: AuthRequest = { login: [{ goto: "/login" }] };
  assert.equal(ruleLayerPlanOf(plain, { expectSeconds: EXPECT_DEFAULT_SECONDS }), plain);
});

// ---- the per-page signed-in check on a block run (reviewer-5055's blocker on #5055): `login` is `[]` there, so the check's
// condition must come from the block's own plan, or a signed-out page is audited. ----

const DASHBOARD_TREE = [{ id: "1", role: "heading", name: "Dashboard", ignored: false }];
const WALL_TREE = [{ id: "1", role: "heading", name: "Sign in", ignored: false }];

/** A page that shows `arrivals[n]` after the nth sign-in, read through `recheckedSignIn`'s own seam, with no browser. */
function scriptedBlockScan(arrivals: readonly boolean[]) {
  let signIns = 0;
  let signedIn = true;
  const read = async () => ({ nodes: signedIn ? DASHBOARD_TREE : WALL_TREE, url: `${ORIGIN}${signedIn ? "/orders" : "/login"}` });
  const signInOnce = async (): Promise<void> => { signedIn = arrivals[signIns] ?? true; signIns += 1; };
  return { signIns: () => signIns, read, signInOnce };
}

test("POSITIVE CONTROL: a block run whose page arrives signed in is audited, after one sign-in and one read", async () => {
  const { auth } = await resolved(FLOWS_BLOCK);
  const run = scriptedBlockScan([true]);
  let reads = 0;
  const read = async () => { reads += 1; return run.read(); };
  await recheckedSignIn({ plan: auth, url: `${ORIGIN}/orders`, signInOnce: run.signInOnce, read })({} as Page);
  assert.equal(run.signIns(), 1);
  assert.equal(reads, 1, "the page was READ: the check ran, it was not skipped");
});

test("NEGATIVE CONTROL: a block run whose page arrives signed out is re-logged in once and then NOT AUDITED, as a named flow's is", async () => {
  const { auth } = await resolved(FLOWS_BLOCK);
  assert.deepEqual(auth.login, [], "the request's own login is empty, which is what the check used to read");
  const run = scriptedBlockScan([false, false]);
  await assert.rejects(
    recheckedSignIn({ plan: auth, url: `${ORIGIN}/orders`, signInOnce: run.signInOnce, read: run.read })({} as Page),
    (error: unknown) => error instanceof PageSignedOutError,
  );
  assert.equal(run.signIns(), 2, "one sign-in and one re-login, and no more");
});

test("NEGATIVE CONTROL: a block run that arrives signed out and recovers on the re-login is audited", async () => {
  const { auth } = await resolved(FLOWS_BLOCK);
  const run = scriptedBlockScan([false, true]);
  await recheckedSignIn({ plan: auth, url: `${ORIGIN}/orders`, signInOnce: run.signInOnce, read: run.read })({} as Page);
  assert.equal(run.signIns(), 2);
});
