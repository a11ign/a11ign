// A FILE THAT RUNS WITH SECRETS IN ITS ENVIRONMENT (ADR 0038, "The primitive").
//
// Each refusal is asserted by the RULE that refused, not by matching prose, because a message may be
// reworded and the rule may not: `FlowsError.rule` is the contract, and the message must also NAME it so a
// person reading a refusal can tell which rule they broke.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  FLOW_VERBS,
  FlowsError,
  assertLiteralIsNotSecret,
  parseFlowsFile,
  refuseIfWrongOrigin,
  resolveLoginFlow,
  type FillStep,
  type FlowRule,
} from "./flows.js";

const ORIGIN = "https://app.example.test";

const VALID = `
version: 1
origin: ${ORIGIN}
flows:
  login:
    steps:
      - goto: /login
      - fill: { field: "Email address", from-env: APP_TEST_USER }
      - fill: { field: "Password", from-env: APP_TEST_PASSWORD }
      - press: "Sign in"
      - expect: { heading: "Dashboard" }
  checkout:
    steps:
      - goto: /cart
      - press: "Proceed to checkout"
      - capture: cart-review
      - fill: { field: "Postcode", value: "AB1 2CD" }
      - choose: { field: "Delivery", option: "Next day" }
      - check: { field: "I accept the terms" }
      - press: { control: "Continue", within: "Delivery" }
      - capture: delivery
`;

/** A one-flow file around the given steps, so each refusal below states only the step under test. */
const withSteps = (steps: string, origin = ORIGIN) => `
version: 1
origin: ${origin}
flows:
  login:
    steps:
${steps.split("\n").map((line) => `      ${line}`).join("\n")}
`;

const refusedBy = (rule: FlowRule, run: () => unknown) =>
  assert.throws(run, (e: Error) => {
    assert.ok(e instanceof FlowsError, `expected a FlowsError, got ${e.name}: ${e.message}`);
    assert.equal(e.rule, rule, e.message);
    // The message must NAME the rule: a reader who never sees the class still learns which rule they broke.
    assert.match(e.message, new RegExp(`\\(rule: ${rule}\\)`));
    return true;
  });

test("a complete file parses, with every verb of the vocabulary", () => {
  const file = parseFlowsFile(VALID);
  assert.equal(file.origin, ORIGIN);
  assert.deepEqual(file.flows.map((f) => f.name), ["login", "checkout"]);
  const verbs = new Set(file.flows.flatMap((f) => f.steps.flatMap((s) => Object.keys(s))));
  // The vocabulary is asserted from BOTH sides: every verb parses, and the parsed file uses no other.
  assert.deepEqual([...verbs].sort(), [...FLOW_VERBS].sort());
  const fill = file.flows[0].steps[1] as FillStep;
  assert.equal(fill.fill.fromEnv, "APP_TEST_USER");
  assert.equal(fill.fill.value, undefined);
  assert.deepEqual(file.flows[0].steps[4], { expect: { kind: "heading", name: "Dashboard", timeoutSeconds: 10 } });
});

test("a step outside the vocabulary is refused, and the rule is closed-vocabulary", () => {
  refusedBy("closed-vocabulary", () => parseFlowsFile(withSteps("- teleport: /somewhere")));
  // The three things somebody reaches for to run code or wait each get an answer that says why not.
  for (const verb of ["script", "eval", "evaluate", "run", "wait", "sleep", "delay"]) {
    refusedBy("closed-vocabulary", () => parseFlowsFile(withSteps(`- ${verb}: "document.title"`)));
  }
});

test("there is no fixed sleep: expect waits, and its wait is bounded", () => {
  refusedBy("closed-vocabulary", () => parseFlowsFile(withSteps("- expect: { heading: Dashboard, timeout: 31 }")));
  refusedBy("closed-vocabulary", () => parseFlowsFile(withSteps("- expect: { heading: Dashboard, timeout: 0 }")));
  refusedBy("closed-vocabulary", () => parseFlowsFile(withSteps("- expect: { heading: Dashboard, timeout: forever }")));
  const ok = parseFlowsFile(withSteps("- expect: { heading: Dashboard, timeout: 30 }"));
  assert.deepEqual(ok.flows[0].steps[0], { expect: { kind: "heading", name: "Dashboard", timeoutSeconds: 30 } });
});

test("a value is never evaluated: an expression-shaped string is typed as the text it is", () => {
  const file = parseFlowsFile(withSteps('- fill: { field: "Note", value: "${APP_TEST_PASSWORD} {{ secrets.X }} $(id)" }'));
  const fill = file.flows[0].steps[0] as FillStep;
  assert.equal(fill.fill.value, "${APP_TEST_PASSWORD} {{ secrets.X }} $(id)");
});

test("a step must be exactly one verb", () => {
  refusedBy("step-shape", () => parseFlowsFile(withSteps('- { goto: /a, press: "Go" }')));
  refusedBy("step-shape", () => parseFlowsFile(withSteps("- just a string")));
});

test("a goto that leaves the origin is refused, however the address is spelled", () => {
  for (const target of [
    "https://evil.test/login",
    "//evil.test/login",
    "https://app.example.test.evil.test/login",
    "http://app.example.test/login", // same host, other scheme: a different origin, so credentials would go in clear
    "https://app.example.test:8443/login",
    "javascript:alert(1)",
  ]) {
    refusedBy("origin-pinned", () => parseFlowsFile(withSteps(`- goto: "${target}"`)));
  }
  // The control: the same shapes that stay inside are accepted, so the refusal is not "every absolute URL".
  parseFlowsFile(withSteps(`- goto: ${ORIGIN}/login`));
  parseFlowsFile(withSteps("- goto: /a/../login?next=/home"));
});

test("origin: is required, must be http(s), and may not carry a credential", () => {
  refusedBy("file-shape", () => parseFlowsFile("version: 1\nflows:\n  a:\n    steps:\n      - goto: /\n"));
  refusedBy("file-shape", () => parseFlowsFile(withSteps("- goto: /", "ftp://app.example.test")));
  refusedBy("file-shape", () => parseFlowsFile(withSteps("- goto: /", "not a url")));
  refusedBy("file-shape", () => parseFlowsFile(withSteps("- goto: /", "https://ada:hunter2@app.example.test")));
});

test("a run against another site than the file's origin is refused, by parsed origin", () => {
  const file = parseFlowsFile(VALID);
  refuseIfWrongOrigin(file, `${ORIGIN}/orders`);
  for (const url of ["https://staging.example.test/", "https://app.example.test.evil.test/", "not a url"]) {
    refusedBy("origin-pinned", () => refuseIfWrongOrigin(file, url));
  }
});

test("controls are addressed by accessible name, never by selector", () => {
  for (const key of ["selector", "css", "xpath", "id", "testid", "locator"]) {
    refusedBy("by-accessible-name", () => parseFlowsFile(withSteps(`- fill: { field: "Email", ${key}: "#email", value: "x" }`)));
  }
  refusedBy("by-accessible-name", () => parseFlowsFile(withSteps('- press: { control: "Go", selector: "button.go" }')));
});

test("an unknown key is refused rather than ignored, at every level", () => {
  refusedBy("unknown-key", () => parseFlowsFile(withSteps('- fill: { field: "Email", value: "x", password: "y" }')));
  refusedBy("unknown-key", () => parseFlowsFile(`${withSteps("- goto: /")}headers: { Cookie: "session=1" }\n`));
  refusedBy("unknown-key", () => parseFlowsFile(withSteps("- goto: /").replace("steps:", "cookies: [a]\n    steps:")));
});

test("fill takes exactly one of value: or from-env:, and from-env: names a variable and never holds one", () => {
  refusedBy("step-shape", () => parseFlowsFile(withSteps('- fill: { field: "Email" }')));
  refusedBy("step-shape", () => parseFlowsFile(withSteps('- fill: { field: "Email", value: "a", from-env: A_B }')));
  for (const name of ["hunter 2", "1PASSWORD", "$SECRET", "A=B", "p@ss"]) {
    refusedBy("step-shape", () => parseFlowsFile(withSteps(`- fill: { field: "Email", from-env: "${name}" }`)));
  }
});

test("within: and nth: disambiguate; nth counts from 1", () => {
  const file = parseFlowsFile(withSteps('- fill: { field: "Address line 1", within: "Billing", nth: 2, value: "x" }'));
  const fill = file.flows[0].steps[0] as FillStep;
  assert.equal(fill.fill.within, "Billing");
  assert.equal(fill.fill.nth, 2);
  refusedBy("step-shape", () => parseFlowsFile(withSteps('- fill: { field: "A", nth: 0, value: "x" }')));
  refusedBy("step-shape", () => parseFlowsFile(withSteps('- fill: { field: "A", nth: 1.5, value: "x" }')));
});

test("a login flow with no final expect is refused, and so is one whose expect is not last", () => {
  const noExpect = parseFlowsFile(withSteps('- goto: /login\n- fill: { field: "Email", from-env: A_B }\n- press: "Sign in"'));
  refusedBy("login-final-expect", () => resolveLoginFlow(noExpect, "login"));
  const expectInMiddle = parseFlowsFile(withSteps('- expect: { heading: "Sign in" }\n- press: "Sign in"'));
  refusedBy("login-final-expect", () => resolveLoginFlow(expectInMiddle, "login"));
  // The control: the same flow with the expect last is the login the ADR shows.
  const login = resolveLoginFlow(parseFlowsFile(VALID), "login");
  assert.deepEqual(login.steps[login.steps.length - 1], { expect: { kind: "heading", name: "Dashboard", timeoutSeconds: 10 } });
});

test("a literal in the flow that --login-flow names is refused, and only in that flow", () => {
  const file = parseFlowsFile(`
version: 1
origin: ${ORIGIN}
flows:
  login:
    steps:
      - fill: { field: "Email", value: "ada@example.test" }
      - expect: { heading: "Dashboard" }
  checkout:
    steps:
      - fill: { field: "Postcode", value: "AB1 2CD" }
`);
  refusedBy("login-literal", () => resolveLoginFlow(file, "login"));
  // A non-login flow may carry a literal: it is the same file, parsed without complaint above.
  assert.equal(file.flows[1].name, "checkout");
  // The refusal names the step and the field, and prints no value.
  assert.throws(() => resolveLoginFlow(file, "login"), (e: Error) => {
    assert.match(e.message, /step 1/);
    assert.match(e.message, /"Email"/);
    assert.doesNotMatch(e.message, /ada@example\.test/);
    return true;
  });
});

test("a login flow captures nothing, so the transcript cannot begin during it", () => {
  const file = parseFlowsFile(withSteps('- goto: /login\n- capture: early\n- expect: { heading: "Dashboard" }'));
  refusedBy("login-no-capture", () => resolveLoginFlow(file, "login"));
});

test("--login-flow naming a flow the file lacks is refused, naming the ones it has", () => {
  const file = parseFlowsFile(VALID);
  refusedBy("login-flow-missing", () => resolveLoginFlow(file, "signin"));
  assert.throws(() => resolveLoginFlow(file, "signin"), /login, checkout/);
});

test("a literal typed into a password-type input is auth-literal-secret, in ANY flow", () => {
  const literal = { fill: { field: "PIN", value: "1234" } } as FillStep;
  const fromEnv = { fill: { field: "PIN", fromEnv: "APP_PIN" } } as FillStep;
  assert.throws(() => assertLiteralIsNotSecret(literal, { inputType: "password" }), (e: Error) => {
    assert.ok(e instanceof FlowsError);
    assert.equal(e.rule, "auth-literal-secret");
    assert.equal(e.fault, "auth-literal-secret");
    assert.doesNotMatch(e.message, /1234/);
    return true;
  });
  assert.throws(() => assertLiteralIsNotSecret(literal, { inputType: "PASSWORD" }), FlowsError);
  // The two controls: a literal into an ordinary input, and a from-env into a password input, both pass.
  assertLiteralIsNotSecret(literal, { inputType: "text" });
  assertLiteralIsNotSecret(fromEnv, { inputType: "password" });
});

test("an empty file, invalid YAML, and a flow with no steps are each refused as file-shape", () => {
  refusedBy("file-shape", () => parseFlowsFile(""));
  refusedBy("file-shape", () => parseFlowsFile("version: [1"));
  refusedBy("file-shape", () => parseFlowsFile(`version: 2\norigin: ${ORIGIN}\nflows: { a: { steps: [{ goto: / }] } }`));
  refusedBy("file-shape", () => parseFlowsFile(`version: 1\norigin: ${ORIGIN}\nflows: {}`));
  refusedBy("file-shape", () => parseFlowsFile(`version: 1\norigin: ${ORIGIN}\nflows: { a: { steps: [] } }`));
});
