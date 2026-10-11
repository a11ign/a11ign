// The nightly Auth0 matrix (#5000, under #4084). Each control is named beside the case it controls.
import { test } from "node:test";
import assert from "node:assert/strict";

import { BASELINE, MATRIX_AREAS, MATRIX_CASES, planStop, type MatrixCase } from "./auth0-matrix.js";
import { LOGIN_OUTCOMES } from "./login-outcomes.js";
import { FORM_SCREENS } from "./screen-loop.js";

const CASE_COUNT = 6;
const PLAN_REFUSAL = { status: 403, errorCode: "feature_not_enabled", message: "This feature is not available on your plan. Upgrade to enable it." };
const WRONG_CODE = { status: 400, errorCode: "invalid_otp", message: "Invalid OTP code" };

const byName = (name: string): MatrixCase => {
  const found = MATRIX_CASES.find((c) => c.name === name);
  assert.ok(found, `no case named ${name}`);
  return found;
};

/** Every `area.field` path a settings payload sets, so the baseline can be checked field by field. */
const paths = (settings: object, prefix = ""): string[] =>
  Object.entries(settings).flatMap(([key, value]) =>
    value && typeof value === "object" && !Array.isArray(value) ? paths(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  );
const baselinePaths = new Set(paths(BASELINE));

// POSITIVE CONTROL: the six cases are present with their settings and outcomes, every case's settings have a
// BASELINE entry, and a recorded plan refusal is mfa-unavailable-on-plan.
test("POSITIVE CONTROL: the six cases are present with their settings and expected outcomes", () => {
  assert.equal(MATRIX_CASES.length, CASE_COUNT);
  assert.deepEqual(
    MATRIX_CASES.map((c) => c.name),
    ["identifier-first-on", "identifier-first-off", "mfa-always-otp", "progressive-enrollment-on", "consent-on-localhost-callback", "organizations-prompt"],
  );
  assert.deepEqual(byName("identifier-first-on").settings, { prompts: { identifier_first: true } });
  assert.deepEqual(byName("mfa-always-otp").settings.mfa_policies, { policy: ["all-applications"] });
  assert.deepEqual(byName("consent-on-localhost-callback").settings.clients?.callbacks, ["http://localhost:3000/callback"]);
  for (const c of MATRIX_CASES) assert.equal(c.expect.ends, "signed-in", `${c.name} ends on a named outcome or signed-in`);
});

test("POSITIVE CONTROL: the branches a case lists are screens the loop knows, and the nudge, consent and picker are among them", () => {
  for (const c of MATRIX_CASES) {
    for (const b of c.expect.branches) assert.ok(FORM_SCREENS.includes(b.screen), `${c.name}: ${b.screen}`);
  }
  assert.equal(byName("progressive-enrollment-on").expect.branches[0]?.screen, "passkey-nudge");
  assert.equal(byName("consent-on-localhost-callback").expect.branches[0]?.noteIncludes, "first-party");
  assert.equal(byName("organizations-prompt").expect.branches[0]?.screen, "organization-picker");
});

test("POSITIVE CONTROL: every field a case sets has a matching entry in BASELINE", () => {
  const set = MATRIX_CASES.flatMap((c) => paths(c.settings));
  assert.ok(set.length >= CASE_COUNT, "the control saw the cases' fields");
  for (const path of set) assert.ok(baselinePaths.has(path), `BASELINE does not restore ${path}`);
});

test("POSITIVE CONTROL: a recorded plan refusal is mfa-unavailable-on-plan", () => {
  assert.equal(planStop(PLAN_REFUSAL), "mfa-unavailable-on-plan");
  assert.ok("mfa-unavailable-on-plan" in LOGIN_OUTCOMES);
});

// NEGATIVE CONTROL: nothing in the matrix reaches attack protection (Enterprise-only; bot-challenge is a fixture).
test("NEGATIVE CONTROL: no case or baseline entry touches attack_protection or Bot Detection", () => {
  assert.ok(!(MATRIX_AREAS as readonly string[]).includes("attack_protection"));
  const everything = JSON.stringify({ MATRIX_CASES, BASELINE });
  assert.doesNotMatch(everything, /attack_protection|bot[_ -]?detection|captcha/i);
  for (const c of MATRIX_CASES) assert.notEqual(c.expect.ends, "bot-challenge");
});

// NEGATIVE CONTROL: a wrong code is the code's fault, never the plan's.
test("NEGATIVE CONTROL: a wrong-code response is totp-rejected and not the plan outcome", () => {
  assert.equal(planStop(WRONG_CODE), "totp-rejected");
  assert.notEqual(planStop(WRONG_CODE), "mfa-unavailable-on-plan");
  assert.equal(planStop({ status: 200, message: "plan" }), undefined);
  assert.equal(planStop({ status: 500, message: "Internal error" }), undefined);
  assert.equal(planStop({ status: 403, message: "Invalid code on this plan" }), undefined, "a response reading as both names neither");
});

// NEGATIVE CONTROL: the payloads are printable: no secret, client id or domain.
test("NEGATIVE CONTROL: no payload holds a secret, a client id or a domain", () => {
  // Settings only: `expect` legitimately names the `password` screen.
  const text = JSON.stringify({ settings: MATRIX_CASES.map((c) => c.settings), BASELINE });
  assert.ok(text.length > 0, "the control saw the payloads");
  assert.doesNotMatch(text, /client_secret|client_id|secret|seed|password|token/i);
  assert.doesNotMatch(text, /auth0\.com|\.us\.|\.eu\.|\.au\./i);
  assert.doesNotMatch(text.replace(/localhost/g, ""), /https?:\/\/[^"]*\.[a-z]{2,}/i);
});
