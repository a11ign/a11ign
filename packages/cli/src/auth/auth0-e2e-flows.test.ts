// THE END-TO-END AUTH0 SIGN-IN (#4975, under #4084 outcome 1): the flows file its workflow scans with, and the workflow's own
// failure path, pinned offline. A real tenant and a real NVDA worker are the chairman's hand-run (Done-when 2); what is checked
// here is everything about the run that does not need either.
//
// WHAT IS PINNED, and why each is a way the run could pass while proving nothing:
//   1. THE FILE IS A SIGN-IN THE REAL PARSER READS: a `login:` block of three variable NAMES, whose one check is the heading the
//      test page writes once signed in, in a file that goes on the wire as `auth.loginBlock` and carries no value.
//   2. A LITERAL SEED, OR A `url:` CHECK, IS REFUSED by the same functions the CLI runs, each with the clean file beside it.
//   3. THE TENANT'S ORIGIN IS NOT COMMITTED, and the placeholder that stands for it appears exactly once, so the workflow's
//      substitution cannot silently match nothing.
//   4. A SECRET IS REFERENCED ONLY AS `${{ secrets.NAME }}` IN AN `env:` BLOCK, and a file is kept as evidence only when none of
//      the values is in it (the workflow's own `keep` function, run here against a planted value).
//   5. THE FREE-PLAN STOP IS ITS OWN OUTCOME: a recorded plan refusal is `mfa-unavailable-on-plan`, a wrong code `totp-rejected`,
//      and the workflow's classifier and incident text keep them apart.
//   6. THE FAILURE PATH HAS THE SHAPE `registry-consumer-gate.yml`'s has: `issues: write` on the reporting job only, one open
//      row at a time, a label ensured by name, and a mutated copy refused for each way it can break.
//
// THE FLOWS FILE IS READ BY THE PATH THE WORKFLOW NAMES (its `cat <file>` of the committed template), so what is parsed here is
// the file the run scans with and a rename that left the workflow behind fails here rather than on a runner.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";

import { parse as parseYaml } from "yaml";

import { planStop } from "./auth0-matrix.js";
import { EXPECT_DEFAULT_SECONDS, FlowsError, parseFlowsFile } from "./flows.js";
import { LOGIN_OUTCOMES } from "./login-outcomes.js";
import { loginBlockPlan } from "./login-block.js";
import { resolveAuthentication, type ResolveRequest } from "./resolve.js";

/** `path.at(PARENT_KEY)`: the key a string value sits under is the one before its own. */
const PARENT_KEY = -2;
const WORKFLOW_PATH = ".github/workflows/auth0-e2e.yml";
const GATE_PATH = ".github/workflows/registry-consumer-gate.yml";
const HEADING = "Signed in to the a11y-witness test page";
const PAGE = "http://localhost:4173/";
const TENANT = "e2e-tenant.us.auth0.com";
const SECRET_NAMES = ["AUTH0_DOMAIN", "AUTH0_CLIENT_ID", "AUTH0_TEST_USER", "AUTH0_TEST_PASSWORD", "AUTH0_TOTP_SEED"];
// Markers, not credentials: distinctive enough that finding one in text is a leak.
const VALUES = {
  AUTH0_DOMAIN: TENANT,
  AUTH0_CLIENT_ID: "canaryclient5c0e91",
  AUTH0_TEST_USER: "canaryuser6d3f2a",
  AUTH0_TEST_PASSWORD: "canarysecretb81c94",
  AUTH0_TOTP_SEED: "CANARYTOTP4E7A10C2",
};
const PLAN_REFUSAL = { status: 403, errorCode: "feature_not_enabled", message: "This feature is not available on your plan. Upgrade to enable it." };
const WRONG_CODE = { status: 400, errorCode: "invalid_otp", message: "Invalid OTP code" };

interface Step { id?: string; name?: string; if?: string; uses?: string; run?: string; env?: Record<string, string> }
interface Job { "runs-on": string; if?: string; needs?: string[]; permissions?: Record<string, string>; steps: Step[] }
interface Workflow {
  on: { schedule?: Array<{ cron: string }>; workflow_run?: { workflows: string[]; types: string[] }; workflow_dispatch?: unknown };
  permissions?: Record<string, string>;
  env?: Record<string, string>;
  concurrency?: { group: string; "cancel-in-progress": boolean };
  jobs: Record<string, Job>;
}

const read = (path: string): string => readFileSync(resolvePath(process.cwd(), path), "utf8");
const workflowText = read(WORKFLOW_PATH);
const workflow = parseYaml(workflowText) as Workflow;
const gate = parseYaml(read(GATE_PATH)) as Workflow;

const stepNamed = (job: Job, id: string): Step => {
  const found = job.steps.find((step) => step.id === id);
  assert.ok(found, `no step with id ${id}`);
  return found;
};
const scanScript = (): string => stepNamed(workflow.jobs.e2e, "scan").run ?? assert.fail("the scan step has no script");
const incidentScript = (): string => workflow.jobs.incident.steps.map((s) => s.run).find((run) => run !== undefined) ?? assert.fail("the incident job runs nothing");

const templatePath = (): string => {
  const match = /cat (\S+\.yml)\)/.exec(scanScript());
  assert.ok(match, "the scan step no longer reads a committed flows file with `cat <file>`: this test's source of the file moved");
  return match[1];
};
const flowsText = (): string => read(templatePath());
const PLACEHOLDER = (): string => {
  const match = /^PLACEHOLDER="([^"]+)"$/m.exec(scanScript());
  assert.ok(match, "the scan step names no PLACEHOLDER");
  return match[1];
};
const withTenant = (text: string): string => text.split(PLACEHOLDER()).join(`https://${TENANT}`);

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

/** Runs `body` with a fresh directory under the OS temp dir, removed afterwards even when `body` throws. */
function withTempDir<T>(body: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "auth0-e2e-test-"));
  try {
    return body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const bash = (script: string, env: Record<string, string> = {}) => withTempDir((dir) => {
  const file = join(dir, "snippet.sh");
  writeFileSync(file, script);
  return spawnSync("bash", [file], { encoding: "utf8", env: { PATH: process.env.PATH ?? "", ...env } });
});

// ---- 1. the file ------------------------------------------------------------------------------------------------------------

test("POSITIVE CONTROL: the flows file the workflow scans with is a login: block of three NAMES and the signed-in heading", async () => {
  const file = parseFlowsFile(flowsText(), templatePath());
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
  // The heading the workflow asks NVDA for is the one the check waits on.
  assert.equal(workflow.env?.HEADING, HEADING);
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

test("POSITIVE CONTROL: the placeholder is in the committed file once, and the workflow writes the tenant over it", () => {
  const text = flowsText();
  assert.equal(text.split(PLACEHOLDER()).length - 1, 1, "exactly one placeholder, so the substitution can match");
  assert.equal(parseFlowsFile(text).idpOrigins.length, 0, "the origin sits in the block, which is where the worker reads it from");
  assert.deepEqual(parseFlowsFile(withTenant(text)).login?.idpOrigins, [`https://${TENANT}`]);
  assert.match(scanScript(), /printf '%s\\n' "\$\{template\/\/"\$PLACEHOLDER"\/"https:\/\/\$AUTH0_DOMAIN"\}" > "\$flows"/);
  assert.match(PLACEHOLDER(), /\.invalid$/, "a reserved top-level domain, which can never resolve");
});

test("NEGATIVE CONTROL: neither the workflow nor the flows file carries a tenant host, a client id or a routable address", () => {
  const both = `${workflowText}\n${flowsText()}`;
  assert.doesNotMatch(both, /\.auth0\.com/i);
  const addresses = (both.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) ?? []).filter((address) => address !== "127.0.0.1");
  assert.deepEqual(addresses, [], "no egress address: the run reaches the tenant by name, from a hosted runner");
  assert.doesNotMatch(workflowText, /^\s*-\s*name:.*allow[- ]?list/im, "no allow-list step");
  // CONTROL: the patterns see what they are meant to.
  assert.match("https://t.us.auth0.com", /\.auth0\.com/i);
  assert.deepEqual("10.0.0.7 127.0.0.1".match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g)?.filter((a) => a !== "127.0.0.1"), ["10.0.0.7"]);
});

// ---- 4. no value anywhere -----------------------------------------------------------------------------------------------------

/** Every string under a key, with the path to it, so a reference can be judged by where it sits. */
function stringsOf(node: unknown, path: string[] = []): Array<{ path: string[]; value: string }> {
  if (typeof node === "string") return [{ path, value: node }];
  if (node === null || typeof node !== "object") return [];
  return Object.entries(node).flatMap(([key, inner]) => stringsOf(inner, [...path, key]));
}

/** Where a secret is referenced other than as `${{ secrets.NAME }}`, alone, as the value of an `env:` key. */
function secretProblems(text: string, parsed: unknown): string[] {
  const problems: string[] = [];
  const references = stringsOf(parsed).filter(({ value }) => value.includes("secrets."));
  for (const { path, value } of references) {
    const inEnv = path.at(PARENT_KEY) === "env";
    if (!inEnv || !/^\$\{\{ secrets\.[A-Z0-9_]+ \}\}$/.test(value)) problems.push(`${path.join(".")} references a secret outside an env: value`);
  }
  const uncommented = text.split("\n").filter((line) => !line.trim().startsWith("#")).join("\n");
  const inText = (uncommented.match(/secrets\./g) ?? []).length;
  if (inText !== references.length) problems.push(`the text holds ${inText} references and the parsed workflow ${references.length}`);
  return problems;
}

test("POSITIVE CONTROL: the workflow's only references to a secret are `${{ secrets.NAME }}` in an env: block, all five named", () => {
  assert.deepEqual(secretProblems(workflowText, workflow), []);
  const named = stringsOf(workflow).map(({ value }) => /^\$\{\{ secrets\.(\w+) \}\}$/.exec(value)?.[1]).filter((name) => name !== undefined);
  assert.deepEqual([...new Set(named)].sort(), [...SECRET_NAMES].sort());
  const env = stepNamed(workflow.jobs.e2e, "scan").env ?? {};
  for (const name of SECRET_NAMES) assert.equal(env[name], `\${{ secrets.${name} }}`, `${name} reaches the worker's own environment`);
  assert.equal(env.JUDGE_BACKEND, "local", "no rented model reads a transcript from behind a login");
});

test("NEGATIVE CONTROL: a secret in a script, a with:, an expression or a `run: echo` is each refused", () => {
  const inScript = parseYaml(workflowText) as Workflow;
  inScript.jobs.e2e.steps[0].run = 'echo "${{ secrets.AUTH0_TOTP_SEED }}"';
  assert.match(secretProblems(workflowText, inScript).join("\n"), /outside an env: value/);
  const inWith = parseYaml(workflowText) as Workflow;
  (inWith.jobs.e2e.steps[0] as Step & { with: Record<string, string> }).with = { token: "${{ secrets.AUTH0_TOTP_SEED }}" };
  assert.match(secretProblems(workflowText, inWith).join("\n"), /outside an env: value/);
  const spliced = parseYaml(workflowText) as Workflow;
  spliced.jobs.e2e.steps[0].env = { SEED: "prefix-${{ secrets.AUTH0_TOTP_SEED }}" };
  assert.match(secretProblems(workflowText, spliced).join("\n"), /outside an env: value/);
  // A reference the parsed workflow does not hold but the text does (a stray `secrets.` outside a comment) is a disagreement.
  assert.match(secretProblems(`${workflowText}\nsecrets.STRAY`, workflow).join("\n"), /the text holds/);
  // The scripts never turn tracing on: it would print every expanded value, and a secret's derived form is not masked.
  for (const job of Object.values(workflow.jobs)) {
    for (const step of job.steps) assert.doesNotMatch(step.run ?? "", /\bset\s+-\w*x|\bxtrace\b|\bprintenv\b|^\s*env\s*$/m, step.name ?? step.id ?? "a step");
  }
});

test("POSITIVE CONTROL: `keep` drops a file that holds any of the five values and keeps one that holds none", () => {
  const match = /^keep\(\) \{\n[\s\S]*?^\}$/m.exec(scanScript());
  assert.ok(match, "the scan step has no `keep` function");
  const results = withTempDir((dir) => {
    const evidence = join(dir, "evidence");
    const clean = join(dir, "clean.txt");
    writeFileSync(clean, "the sign-in ended with NVDA reading the heading\n");
    const leaks = Object.entries(VALUES).map(([name, value]) => {
      const file = join(dir, `leak-${name}.txt`);
      writeFileSync(file, `before ${value} after\n`);
      return file;
    });
    const script = [
      "set -u", `mkdir -p "${evidence}"`, `evidence="${evidence}"`,
      ...Object.entries(VALUES).map(([name, value]) => `${name}="${value}"`),
      `real_seed="${VALUES.AUTH0_TOTP_SEED}"`, match[0],
      ...[clean, ...leaks].map((file) => `keep "${file}"`),
      `ls "${evidence}"`,
    ].join("\n");
    const run = spawnSync("bash", ["-c", script], { encoding: "utf8", env: { PATH: process.env.PATH ?? "" } });
    const lines = run.stdout.split("\n").filter(Boolean);
    return { status: run.status, kept: lines.filter((l) => !l.startsWith("::")), warned: lines.filter((l) => l.startsWith("::warning::")).join("\n") };
  });
  assert.equal(results.status, 0);
  assert.deepEqual(results.kept, ["clean.txt"], "only the file with no value in it is kept");
  assert.equal(results.warned.split("\n").length, Object.keys(VALUES).length, "one warning for each file dropped");
  for (const value of Object.values(VALUES)) assert.ok(!results.warned.includes(value), "the warning names the file and never the value");
});

test("NEGATIVE CONTROL: a `keep` that does not search one of the five values is what this test would catch", () => {
  const match = /^keep\(\) \{\n[\s\S]*?^\}$/m.exec(scanScript());
  assert.ok(match);
  const body = match[0];
  for (const name of ["AUTH0_DOMAIN", "AUTH0_CLIENT_ID", "AUTH0_TEST_USER", "AUTH0_TEST_PASSWORD"]) assert.ok(body.includes(`"$${name}"`), `${name} is searched`);
  assert.ok(body.includes('"$real_seed"'), "the seed is searched by the value taken BEFORE a falsifier replaces it");
  assert.ok(!body.replace('"$real_seed"', "").includes("AUTH0_TOTP_SEED"), "CONTROL: the seed is not searched under its replaceable name");
  assert.match(scanScript(), /^real_seed="\$AUTH0_TOTP_SEED"$/m);
  assert.ok(scanScript().indexOf('real_seed="$AUTH0_TOTP_SEED"') < scanScript().indexOf('AUTH0_TOTP_SEED=$(node'), "taken first");
});

// ---- the transcript reader ---------------------------------------------------------------------------------------------------

const readerSource = (): string => {
  const match = /<<'READER'\n([\s\S]*?)\nREADER\n/.exec(scanScript());
  assert.ok(match, "the scan step has no READER heredoc");
  return match[1];
};

const readResult = (result: unknown) => withTempDir((dir) => {
  const reader = join(dir, "read-transcript.mjs");
  const file = join(dir, "result.json");
  writeFileSync(reader, readerSource());
  writeFileSync(file, JSON.stringify(result));
  const run = spawnSync(process.execPath, [reader, file, HEADING], { encoding: "utf8" });
  return { status: run.status, out: run.stdout.trim(), err: run.stderr.trim() };
});

test("POSITIVE CONTROL: the reader finds the heading in a phrase NVDA announced, on a single page and a multi-page result", () => {
  const phrase = `heading level 1  ${HEADING}`;
  const single = readResult({ url: PAGE, transcript: ["Edge", phrase], findings: [] });
  assert.equal(single.status, 0);
  assert.equal(single.out, phrase);
  const multi = readResult({ multiPage: true, pages: [{ url: PAGE, status: "ok", results: [{ transcript: ["Edge", phrase] }] }], logins: [] });
  assert.equal(multi.status, 0);
  assert.equal(multi.out, phrase);
});

test("NEGATIVE CONTROL: the heading only in a check, a finding or a notice, or the signed-out text, is not heard", () => {
  const echoed = readResult({
    url: PAGE, transcript: ["Edge", "heading level 1  Sign in required"],
    login: { check: { role: "heading", name: HEADING } }, findings: [{ message: `waiting for ${HEADING}` }], notices: [HEADING],
  });
  assert.equal(echoed.status, 1);
  assert.match(echoed.err, /did not announce/);
  assert.equal(readResult({ url: PAGE, transcript: [] }).status, 1, "an empty transcript hears nothing");
  assert.equal(readResult({ multiPage: true, pages: [{ url: PAGE, status: "fault", fault: "auth-login-failed", results: [] }] }).status, 1);
});

// ---- 5. the free plan is its own outcome -------------------------------------------------------------------------------------

test("POSITIVE CONTROL: a recorded plan refusal is mfa-unavailable-on-plan and the workflow's outcome list can name it", () => {
  assert.equal(planStop(PLAN_REFUSAL), "mfa-unavailable-on-plan");
  const names = outcomeNames();
  assert.ok(names.includes("mfa-unavailable-on-plan"));
  for (const name of names) assert.ok(name in LOGIN_OUTCOMES, `${name} is not a login outcome`);
  assert.ok(names.indexOf("mfa-unavailable-on-plan") < names.indexOf("totp-rejected"), "the plan is asked about first");
});

test("NEGATIVE CONTROL: a wrong code is totp-rejected, never the plan, and the classifier says so", () => {
  assert.equal(planStop(WRONG_CODE), "totp-rejected");
  assert.notEqual(planStop(WRONG_CODE), "mfa-unavailable-on-plan");
  assert.equal(classify({ status: 1, stderr: "the login did not complete (totp-rejected) at the code step" }), "totp-rejected");
  assert.equal(classify({ status: 1, stderr: "the login did not complete (mfa-unavailable-on-plan): the plan does not include MFA" }), "mfa-unavailable-on-plan");
  assert.equal(classify({ status: 1, stderr: "", result: '{"fault":"auth-login-failed","message":"(totp-rejected)"}' }), "totp-rejected", "the result's own fault is read too");
  assert.equal(classify({ status: 1, stderr: "something nobody has named" }), "unrecognised");
  assert.equal(classify({ status: 0, stderr: "totp-rejected was mentioned in a notice" }), "none", "a run that succeeded has no outcome to name");
});

test("the incident says the plan is the cause for the plan stop, and names the seed for a rejected code", () => {
  const cause = (outcome: string): string => {
    const block = /case "\$outcome" in\n[\s\S]*?\nesac/.exec(incidentScript());
    assert.ok(block, "the incident job has no outcome case");
    const run = bash(`outcome="${outcome}"\n${block[0]}\nprintf '%s' "$cause"`);
    assert.equal(run.status, 0, run.stderr);
    return run.stdout;
  };
  assert.match(cause("mfa-unavailable-on-plan"), /PLAN refused MFA/);
  assert.match(cause("mfa-unavailable-on-plan"), /NOT the cause/);
  assert.doesNotMatch(cause("totp-rejected"), /PLAN/);
  assert.match(cause("totp-rejected"), /AUTH0_TOTP_SEED/);
  assert.match(cause("something-new"), /something-new/, "an outcome nobody wrote a sentence for is named, not hidden");
});

function outcomeNames(): string[] {
  const list = /for name in (mfa-unavailable-on-plan[\s\S]*?); do/.exec(scanScript());
  assert.ok(list, "the scan step has no outcome list");
  return list[1].split(/[\s\\]+/).filter(Boolean);
}

/** The scan step's own classification, run over a stderr and an exit status. */
function classify({ status, stderr, result = "{}" }: { status: number; stderr: string; result?: string }): string {
  const block = /outcome="none"\n[\s\S]*?echo "outcome=\$outcome" >> "\$GITHUB_OUTPUT"/.exec(scanScript());
  assert.ok(block, "the scan step has no classification block");
  return withTempDir((dir) => {
    const err = join(dir, "scan.err");
    const out = join(dir, "output");
    const resultFile = join(dir, "result.json");
    writeFileSync(err, stderr);
    writeFileSync(out, "");
    writeFileSync(resultFile, result);
    const run = bash(`set -uo pipefail\nstatus=${status}\nscan_err="${err}"\nresult="${resultFile}"\nGITHUB_OUTPUT="${out}"\n${block[0]}`);
    assert.equal(run.status, 0, run.stderr);
    return readFileSync(out, "utf8").trim().replace(/^outcome=/, "");
  });
}

// ---- 6. the failure path ------------------------------------------------------------------------------------------------------

const scopeProblems = (parsed: Workflow): string[] => {
  const { e2e, incident } = parsed.jobs;
  return [
    parsed.permissions?.issues !== undefined ? "issues is granted to the whole workflow" : "",
    e2e.permissions?.issues !== undefined ? "the job that reads the secrets can write issues" : "",
    incident.permissions?.issues !== "write" ? "the incident job cannot write an issue" : "",
    stringsOf(incident).some(({ value }) => /secrets\./.test(value)) ? "the incident job reads a secret" : "",
  ].filter(Boolean);
};

const triggerProblems = (parsed: Workflow): string[] => {
  const { incident } = parsed.jobs;
  return [
    !incident.needs?.includes("e2e") ? "the incident job does not wait for e2e" : "",
    !/needs\.e2e\.result == 'failure'/.test(incident.if ?? "") ? "the incident job does not run on a failed e2e" : "",
    !/!cancelled\(\)/.test(incident.if ?? "") ? "the incident job is skipped when e2e fails (no !cancelled())" : "",
    parsed.concurrency?.group === undefined || parsed.concurrency["cancel-in-progress"] !== false ? "two runs can file at once" : "",
  ].filter(Boolean);
};

const fileProblems = (parsed: Workflow): string[] => {
  const script = parsed.jobs.incident.steps.map((step) => step.run ?? "").join("\n");
  const [list, comment, create] = ["gh issue list --state open --label", "gh issue comment", "gh issue create"].map((s) => script.indexOf(s));
  const byName = /gh api "repos\/\$GH_REPO\/labels\/\$LABEL"/.test(script) && /HTTP 404/.test(script);
  return [
    list < 0 || comment < list || create < comment ? "not one open row at a time: list, then comment, else create" : "",
    !byName ? "the label is not looked up by name with a 404-only create" : "",
  ].filter(Boolean);
};

/** What breaks the failure path's shape, read from a parsed workflow. Empty is the shape `registry-consumer-gate.yml`'s has. */
const failurePathProblems = (parsed: Workflow): string[] => [...scopeProblems(parsed), ...triggerProblems(parsed), ...fileProblems(parsed)];

test("POSITIVE CONTROL: the failure path has the shape registry-consumer-gate.yml's has", () => {
  assert.deepEqual(failurePathProblems(workflow), []);
  // The same scope, on the job that reports, from the same token and no secret.
  assert.deepEqual(workflow.jobs.incident.permissions, gate.jobs.outsider.permissions);
  assert.deepEqual(workflow.permissions, gate.permissions);
  assert.equal(workflow.jobs.e2e.if, gate.jobs.outsider.if, "a publish that failed published nothing new");
  assert.equal(workflow.jobs.e2e["runs-on"], "windows-2022");
  assert.equal(workflow.jobs.incident["runs-on"], "ubuntu-latest");
  assert.deepEqual(workflow.on.workflow_run, { workflows: ["release"], types: ["completed"] });
  assert.ok("workflow_dispatch" in workflow.on);
  const [cron] = workflow.on.schedule ?? [];
  assert.ok(cron, "a schedule");
  assert.notEqual(cron.cron.split(" ")[0], "0", "off the hour");
});

test("NEGATIVE CONTROL: each way the failure path can break is named, and none by the unmutated file", () => {
  const mutate = (change: (w: Workflow) => void): string[] => {
    const copy = parseYaml(workflowText) as Workflow;
    change(copy);
    return failurePathProblems(copy);
  };
  assert.match(mutate((w) => { w.permissions = { contents: "read", issues: "write" }; }).join("\n"), /whole workflow/);
  assert.match(mutate((w) => { w.jobs.e2e.permissions = { issues: "write" }; }).join("\n"), /reads the secrets can write issues/);
  assert.match(mutate((w) => { w.jobs.incident.permissions = { contents: "read" }; }).join("\n"), /cannot write an issue/);
  assert.match(mutate((w) => { w.jobs.incident.if = "needs.e2e.result == 'failure'"; }).join("\n"), /!cancelled/);
  assert.match(mutate((w) => { w.jobs.incident.if = "${{ !cancelled() }}"; }).join("\n"), /failed e2e/);
  assert.match(mutate((w) => { w.jobs.incident.needs = []; }).join("\n"), /does not wait/);
  assert.match(mutate((w) => { w.jobs.incident.steps[0].env = { SEED: "${{ secrets.AUTH0_TOTP_SEED }}" }; }).join("\n"), /reads a secret/);
  assert.match(mutate((w) => { w.jobs.incident.steps[0].run = "gh issue create --title x"; }).join("\n"), /one open row/);
  assert.match(mutate((w) => { w.concurrency = undefined; }).join("\n"), /file at once/);
});
