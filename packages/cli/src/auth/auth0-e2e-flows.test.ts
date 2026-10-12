// THE END-TO-END AUTH0 SIGN-IN (#4975, under #4084 outcome 1): the flows file its nightly scans with, pinned offline. The
// workflow itself runs in the private `a11ign/auth-capture-check` and is not in this repository (#5114): a run that logs in is
// refused in a public one (`auth-refused-public-repository`, ADR 0038 amendment 3). A real tenant and a real NVDA worker are that
// run; what is checked here is everything about the FILE that does not need either.
//
// WHAT IS PINNED, and why each is a way the run could pass while proving nothing:
//   1. THE FILE IS A SIGN-IN THE REAL PARSER READS: a `login:` block of three variable NAMES, whose one check is the heading the
//      test page writes once signed in, in a file that goes on the wire as `auth.loginBlock` and carries no value.
//   2. A LITERAL SEED, OR A `url:` CHECK, IS REFUSED by the same functions the CLI runs, each with the clean file beside it.
//   3. THE TENANT'S ORIGIN IS NOT COMMITTED, and the placeholder that stands for it appears exactly once, so the private
//      workflow's substitution (`"${template//"$PLACEHOLDER"/"https://$AUTH0_DOMAIN"}"`) cannot silently match nothing.
//
// WHAT USED TO BE PINNED HERE AND IS NOT (#5114): the workflow's secret handling (`${{ secrets.NAME }}` only in an `env:`), its
// `keep` scan, its transcript reader, its outcome classifier and its failure path. Those were read from the workflow's text, which
// is no longer in this tree, and a private repository's file cannot be read by this suite.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import { EXPECT_DEFAULT_SECONDS, FlowsError, parseFlowsFile } from "./flows.js";
import { loginBlockPlan } from "./login-block.js";
import { resolveAuthentication, type ResolveRequest } from "./resolve.js";

const FLOWS_PATH = "packages/cli/src/auth/auth0-e2e-flows.yml";
/** What the committed file holds in place of the tenant's origin; the private workflow writes the tenant over it in a copy. */
const PLACEHOLDER = "https://tenant.auth0-e2e.invalid";
const HEADING = "Signed in to the a11y-witness test page";
const PAGE = "http://localhost:4173/";
const TENANT = "e2e-tenant.us.auth0.com";
// Markers, not credentials: distinctive enough that finding one in text is a leak.
const VALUES = {
  AUTH0_DOMAIN: TENANT,
  AUTH0_CLIENT_ID: "canaryclient5c0e91",
  AUTH0_TEST_USER: "canaryuser6d3f2a",
  AUTH0_TEST_PASSWORD: "canarysecretb81c94",
  AUTH0_TOTP_SEED: "CANARYTOTP4E7A10C2",
};

const flowsText = (): string => readFileSync(resolvePath(process.cwd(), FLOWS_PATH), "utf8");
const withTenant = (text: string): string => text.split(PLACEHOLDER).join(`https://${TENANT}`);

const request = (flows: string): ResolveRequest => ({
  args: { flows: "flows.yml", loginFlow: null, authState: null, sendAuthenticatedTranscriptToJudgeVendor: false },
  urls: [PAGE],
  task: "Read and understand this page",
  axe: true,
  countCaptures: async () => 1,
  env: VALUES,
  readText: async () => flows,
  isPdf: () => false,
});

const refused = async (run: Promise<unknown>): Promise<Error & { rule?: string }> => {
  try {
    await run;
  } catch (error) {
    return error as Error & { rule?: string };
  }
  return assert.fail("the run was not refused");
};

// ---- 1. the file ------------------------------------------------------------------------------------------------------------

test("POSITIVE CONTROL: the flows file the nightly scans with is a login: block of three NAMES and the signed-in heading", async () => {
  const file = parseFlowsFile(flowsText(), FLOWS_PATH);
  assert.deepEqual(file.flows, [], "a block is the login: no flow beside it");
  const { login } = file;
  assert.ok(login, "the file carries a login: block");
  assert.deepEqual([login.username, login.password, login.totp], ["AUTH0_TEST_USER", "AUTH0_TEST_PASSWORD", "AUTH0_TOTP_SEED"]);
  assert.deepEqual(login.check, { role: "heading", name: HEADING });
  assert.equal(login.url, PAGE);
  // The last step of the sign-in is the `expect` of that heading: the loop's exit condition, from the one function the CLI runs.
  const { plan, stop } = loginBlockPlan(login, { expectSeconds: EXPECT_DEFAULT_SECONDS });
  assert.deepEqual(plan.login.at(-1), { expect: stop });
  assert.deepEqual(stop, { kind: "heading", name: HEADING, timeoutSeconds: EXPECT_DEFAULT_SECONDS });
  assert.equal(plan.auto?.totp, "AUTH0_TOTP_SEED", "the seed is named, as an environment variable");
});

test("POSITIVE CONTROL: the scan sends the block's NAMES and the tenant's origin as the one allowed provider", async () => {
  const { auth } = (await resolveAuthentication(request(withTenant(flowsText())))) ?? assert.fail("authentication was asked for");
  assert.deepEqual(auth.login, []);
  assert.deepEqual(auth.loginBlock, {
    url: PAGE, usernameEnv: "AUTH0_TEST_USER", passwordEnv: "AUTH0_TEST_PASSWORD", totpEnv: "AUTH0_TOTP_SEED",
    check: { role: "heading", name: HEADING },
  });
  assert.deepEqual(auth.idpOrigins, [`https://${TENANT}`]);
  // The tenant's origin IS on the wire, as the one provider the login may pass through (the worker must know it to allow it).
  // Every OTHER value, the credentials and the client id, is read by the worker from its own environment and is never sent.
  const wire = JSON.stringify(auth);
  for (const [name, value] of Object.entries(VALUES)) {
    if (name !== "AUTH0_DOMAIN") assert.ok(!wire.includes(value), `${name}'s VALUE is on the wire`);
  }
});

test("NEGATIVE CONTROL: a literal seed in the totp: key is refused login-literal, and the refusal prints no value", async () => {
  const literal = "JBSWY3DPEHPK3PXPLITERAL";
  const bad = flowsText().replace("totp: AUTH0_TOTP_SEED", `totp: "otpauth://totp/Ada?secret=${literal}"`);
  assert.notEqual(bad, flowsText(), "the mutation applied");
  const error = await refused(resolveAuthentication(request(bad)));
  assert.ok(error instanceof FlowsError, "a caller's mistake, not a stack trace");
  assert.equal(error.rule, "login-literal");
  assert.ok(!error.message.includes(literal));
  assert.ok(await resolveAuthentication(request(flowsText())), "CONTROL: the committed file is not refused");
});

test("NEGATIVE CONTROL: a check that is a url: is refused login-check-url, which an element check is not", async () => {
  const bad = flowsText().replace(/check: \{[^}]*\}/, `check: { url: ${PAGE}home }`);
  assert.notEqual(bad, flowsText(), "the mutation applied");
  const error = await refused(resolveAuthentication(request(bad)));
  assert.equal(error.rule, "login-check-url");
  const block = parseFlowsFile(bad).login ?? assert.fail("the mutated file lost its block");
  assert.throws(() => loginBlockPlan(block, { expectSeconds: EXPECT_DEFAULT_SECONDS }), (e: Error & { rule?: string }) => e.rule === "login-check-url");
});

test("NEGATIVE CONTROL: a file with no check, or a heading the page never writes, does not describe this run", () => {
  assert.throws(() => parseFlowsFile(flowsText().replace(/^ {2}check:.*\n/m, "")), (e: FlowsError) => e.rule === "login-no-check");
  const wrong = parseFlowsFile(flowsText().replace(HEADING, "Sign in required")).login;
  assert.notDeepEqual(wrong?.check, { role: "heading", name: HEADING }, "CONTROL: the signed-out text is not the signed-in heading");
});

// ---- 3. the tenant is not committed ------------------------------------------------------------------------------------------

test("POSITIVE CONTROL: the placeholder is in the committed file once, and a copy can carry the tenant over it", () => {
  const text = flowsText();
  assert.equal(text.split(PLACEHOLDER).length - 1, 1, "exactly one placeholder, so the substitution can match");
  assert.equal(parseFlowsFile(text).idpOrigins.length, 0, "the origin sits in the block, which is where the worker reads it from");
  assert.deepEqual(parseFlowsFile(withTenant(text)).login?.idpOrigins, [`https://${TENANT}`]);
  assert.match(PLACEHOLDER, /\.invalid$/, "a reserved top-level domain, which can never resolve");
});

test("NEGATIVE CONTROL: the flows file carries neither a tenant host nor a routable address", () => {
  const text = flowsText();
  assert.doesNotMatch(text, /\.auth0\.com/i);
  const addresses = (text.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) ?? []).filter((address) => address !== "127.0.0.1");
  assert.deepEqual(addresses, [], "no egress address: the run reaches the tenant by name, from a hosted runner");
  // CONTROL: the patterns see what they are meant to.
  assert.match("https://t.us.auth0.com", /\.auth0\.com/i);
  assert.deepEqual("203.0.113.7 127.0.0.1".match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g)?.filter((a) => a !== "127.0.0.1"), ["203.0.113.7"]);
});
