// THE ACTION'S HALF OF AN AUTHENTICATED RUN (ADR 0038, PR 7): the inputs, the early refusals, and the masks' place.
//
// These read `action.yml` and RUN the step scripts under bash with the step's own `env:` evaluated, so what is tested is
// the YAML a consumer gets and not a copy of its logic. The public-repository refusal is asserted at all three exits the
// amendment names (the comment, the job log, the artifact advice) — refused whole, so each is closed, and a private
// repository passes with every one of them on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

const ROOT = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "../../../..");

interface Step { name?: string; uses?: string; shell?: string; env?: Record<string, string>; run?: string; id?: string }
const action = parse(readFileSync(resolve(ROOT, "action.yml"), "utf8")) as { inputs: Record<string, { default?: string; required?: boolean; description: string }>; runs: { steps: Step[] } };
const step = (name: string): Step => {
  const found = action.runs.steps.find((candidate) => candidate.name === name);
  assert.ok(found, `no step named ${name}`);
  return found;
};

const CHECK = () => step("Check an authenticated run is allowed here");

/** Evaluate a step's `env:` against a context: `${{ inputs.x }}` and `${{ github.event.repository.private }}` are the only expressions used. */
function envFor(candidate: Step, context: { inputs: Readonly<Record<string, string | undefined>>; private?: string }): Record<string, string> {
  return Object.fromEntries(Object.entries(candidate.env ?? {}).map(([key, expression]) => {
    const value = expression.replace(/\$\{\{\s*([^}]+?)\s*\}\}/g, (_, name: string) => {
      if (name === "github.event.repository.private") return context.private ?? "";
      const input = /^inputs\.(.+)$/.exec(name);
      if (input) return context.inputs[input[1]] ?? "";
      throw new Error(`the step uses an expression this test does not evaluate: ${name}`);
    });
    return [key, value];
  }));
}

function runCheck(inputs: Readonly<Record<string, string | undefined>>, repositoryPrivate: string | undefined) {
  const check = CHECK();
  const ran = spawnSync("bash", ["-eo", "pipefail", "-c", check.run as string], {
    env: { PATH: process.env.PATH ?? "", ...envFor(check, { inputs: { "judge-backend": "local", ...inputs }, private: repositoryPrivate }) }, encoding: "utf8",
  });
  return { code: ran.status, err: ran.stderr };
}

test("the three new inputs exist, are optional, default to empty, and say what they do", () => {
  for (const name of ["flows", "login-flow", "send-authenticated-transcript-to-judge-vendor"]) {
    const input = action.inputs[name];
    assert.ok(input, name);
    assert.equal(input.required, false, name);
    assert.equal(input.default, "", `${name} defaults to empty: an unset input and an empty one must read the same`);
  }
  assert.match(action.inputs.flows.description, /Refused on a repository that is not private/);
  assert.match(action.inputs.flows.description, /dedicated test account without MFA or SSO/);
  assert.match(action.inputs["send-authenticated-transcript-to-judge-vendor"].description, /cannot be set from\s+the environment/);
  assert.ok(!("password" in action.inputs) && !("token" in action.inputs) && !("cookie" in action.inputs), "no input takes a secret: an input is interpolated into shell text");
});

test("no run without authentication is affected: the check step exits 0 and says nothing", () => {
  const ran = runCheck({}, "false");
  assert.equal(ran.code, 0);
  assert.equal(ran.err, "");
});

test("AMENDMENT 3, at every exit: a repository that is not private is refused WHOLE — with the comment on, the log printed, or the artifact advice, and with none of them", () => {
  // The Action's own outputs are the comment (`comment-on-pr`), the log (the JSON result on stdout) and the artifact (`result-json`).
  // The refusal does not read them, which is the point: it is keyed on visibility alone, so no exit can be left open.
  const base = { flows: "a11y-flows.yml", "login-flow": "login" };
  for (const exits of [{ "comment-on-pr": "true" }, { "comment-on-pr": "false" }, { "result-json": "upload" }, {}]) {
    for (const visible of ["false", "", undefined]) {
      const ran = runCheck({ ...base, ...exits }, visible);
      assert.equal(ran.code, 1, `${JSON.stringify(exits)} visibility ${JSON.stringify(visible)}: ${ran.err}`);
      assert.match(ran.err, /auth-refused-public-repository/);
      assert.match(ran.err, /pull-request comment, the job log, the uploaded artifact and the job summary/);
    }
  }
  // The control: a private repository passes, with every exit on.
  assert.equal(runCheck({ ...base, "comment-on-pr": "true" }, "true").code, 0);
});

test("both flows and login-flow, or neither; one alone is refused before setup", () => {
  assert.equal(runCheck({ flows: "f.yml" }, "true").code, 1);
  assert.match(runCheck({ "login-flow": "login" }, "true").err, /Give both flows and login-flow, or neither/);
  assert.equal(runCheck({ flows: "f.yml", "login-flow": "login" }, "true").code, 0);
});

test("a non-local judge backend refuses an authenticated run unless the override is the string true", () => {
  const base = { flows: "f.yml", "login-flow": "login" };
  for (const backend of ["anthropic", "openai", "Anthropic", "OPENAI"]) {
    const ran = runCheck({ ...base, "judge-backend": backend }, "true");
    assert.equal(ran.code, 1, backend);
    assert.match(ran.err, /auth-refused-judge-backend/);
  }
  assert.equal(runCheck({ ...base, "judge-backend": "anthropic", "send-authenticated-transcript-to-judge-vendor": "true" }, "true").code, 0);
  assert.equal(runCheck({ ...base, "judge-backend": "anthropic", "send-authenticated-transcript-to-judge-vendor": "yes" }, "true").code, 1, "only the exact string true is consent");
  assert.equal(runCheck({ ...base, "judge-backend": "local" }, "true").code, 0);
  assert.equal(runCheck({ ...base, "judge-backend": "" }, "true").code, 0, "an empty backend is local, as judgeBackend() reads it");
});

test("the check runs BEFORE the runner is billed for setup: it precedes setup-node and every install", () => {
  const names = action.runs.steps.map((candidate) => candidate.name ?? candidate.uses);
  const at = names.indexOf(CHECK().name);
  assert.ok(at >= 0);
  for (const later of ["actions/setup-node@v4", "Install a11ign", "Set up NVDA", "Capture and judge"]) assert.ok(names.indexOf(later) > at, `${later} must come after the check`);
});

test("NO new input is interpolated into a step's shell text: they arrive through env, because these are inputs of an action that handles secrets", () => {
  for (const candidate of action.runs.steps) {
    for (const name of ["inputs.flows", "inputs.login-flow", "inputs.send-authenticated-transcript-to-judge-vendor"]) {
      assert.ok(!(candidate.run ?? "").includes(name), `${candidate.name}: ${name} is interpolated into run: text`);
    }
  }
  const capture = step("Capture and judge");
  assert.equal(capture.env?.FLOWS, "${{ inputs.flows }}");
  assert.equal(capture.env?.LOGIN_FLOW, "${{ inputs.login-flow }}");
});

test("the masks are added BEFORE the worker starts, so the worker's own log is covered; and the flows path is made absolute against the workspace", () => {
  const script = step("Capture and judge").run as string;
  const masksAt = script.indexOf("packages/cli/src/action/auth-masks.ts");
  const workerAt = script.indexOf("node packages/nvda-worker/src/server.mjs");
  assert.ok(masksAt > 0 && workerAt > masksAt, "auth-masks must run before the worker");
  assert.match(script, /flows_path="\$GITHUB_WORKSPACE\/\$FLOWS"/);
  assert.match(script, /args\+=\(--flows "\$flows_path" --login-flow "\$LOGIN_FLOW"\)/);
  assert.match(script, /\[ "\$SEND_TRANSCRIPT" = "true" \] && args\+=\(--send-authenticated-transcript-to-judge-vendor\)/);
});

test("the override reaches the CLI only as an argument, and only when it is exactly true", () => {
  const script = step("Capture and judge").run as string;
  // The two blocks of the REAL script that decide these arguments, cut out by their own first and last lines and run: the flows
  // path made absolute, then the two arguments. The masks command inside the first is replaced by a no-op (it needs the repo).
  const between = (from: string, to: string) => {
    const start = script.indexOf(from);
    const end = script.indexOf(to, start);
    assert.ok(start >= 0 && end > start, `could not find the block from ${from}`);
    return script.slice(start, end + to.length);
  };
  const pathBlock = between('flows_path=""', "\nfi\n").replace(/npx tsx [^\n]*/g, ":");
  const argBlock = between('[ -n "$flows_path" ] && args+=', 'args+=(--send-authenticated-transcript-to-judge-vendor)');
  const decision = (send: string, flows: string) => spawnSync("bash", ["-c", `
    args=(); FLOWS='${flows}'; LOGIN_FLOW=login; SEND_TRANSCRIPT='${send}'; GITHUB_WORKSPACE=/ws
    ${pathBlock}
    ${argBlock}
    printf '%s\\n' "\${args[@]}"`], { encoding: "utf8" }).stdout;
  assert.equal(decision("true", "a11y-flows.yml"), "--flows\n/ws/a11y-flows.yml\n--login-flow\nlogin\n--send-authenticated-transcript-to-judge-vendor\n");
  assert.equal(decision("", "a11y-flows.yml"), "--flows\n/ws/a11y-flows.yml\n--login-flow\nlogin\n");
  assert.equal(decision("false", "/abs/flows.yml"), "--flows\n/abs/flows.yml\n--login-flow\nlogin\n", "an absolute path is kept as it is");
  assert.equal(decision("yes", "a11y-flows.yml"), "--flows\n/ws/a11y-flows.yml\n--login-flow\nlogin\n", "only the exact string true is consent");
});
