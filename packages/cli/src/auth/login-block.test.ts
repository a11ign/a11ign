// The `login:` block's schema and its refusals (v3 login phase 2, #4084). Each refusal is asserted by the RULE
// that refused, and every refusal is also checked not to echo the value it refused: the value may be a secret.
import { test } from "node:test";
import assert from "node:assert/strict";

import { LoginBlockError, parseLoginBlock, type LoginBlockRule } from "./login-block.js";

const SIX_LINES = {
  url: "https://app.example.test/login",
  username: "APP_USER",
  password: "APP_PASSWORD",
  totp: "APP_TOTP",
  check: { role: "heading", name: "Dashboard" },
};

function refusal(block: unknown): LoginBlockError {
  try {
    parseLoginBlock(block);
  } catch (e) {
    assert.ok(e instanceof LoginBlockError, "refused with a LoginBlockError, not a stack trace");
    return e;
  }
  return assert.fail("the block was accepted");
}

function refusedBy(rule: LoginBlockRule, block: unknown, value?: string): void {
  const e = refusal(block);
  assert.equal(e.rule, rule);
  assert.ok(e.message.includes(rule), "the message names the rule");
  if (value !== undefined) assert.ok(!e.message.includes(value), "the refusal does not echo the value");
}

test("POSITIVE CONTROL: the six-line block parses", () => {
  const b = parseLoginBlock(SIX_LINES);
  assert.equal(b.url, SIX_LINES.url);
  assert.deepEqual([b.username, b.password, b.totp], ["APP_USER", "APP_PASSWORD", "APP_TOTP"]);
  assert.deepEqual(b.check, { role: "heading", name: "Dashboard" });
  assert.deepEqual(b.idpOrigins, []);
});

test("POSITIVE CONTROL: organization, fields and idp-origins parse and are kept", () => {
  const b = parseLoginBlock({
    ...SIX_LINES,
    organization: "Acme",
    fields: { username: "Adresse e-mail", password: "Mot de passe" },
    "idp-origins": ["https://login.idp.example.test"],
  });
  assert.equal(b.organization, "Acme");
  assert.deepEqual(b.fields, { username: "Adresse e-mail", password: "Mot de passe" });
  assert.deepEqual(b.idpOrigins, ["https://login.idp.example.test"]);
});

test("POSITIVE CONTROL: a URL check is a signed-in check too", () => {
  const b = parseLoginBlock({ ...SIX_LINES, check: { url: "https://app.example.test/home" } });
  assert.deepEqual(b.check, { url: "https://app.example.test/home" });
});

test("NEGATIVE CONTROL: a password given as a value is login-literal and is not echoed", () => {
  const literal = "S3cret-pass!";
  refusedBy("login-literal", { ...SIX_LINES, password: literal }, literal);
});

test("NEGATIVE CONTROL: a username given as a value is login-literal", () => {
  const literal = "alice@example.test";
  refusedBy("login-literal", { ...SIX_LINES, username: literal }, literal);
});

test("NEGATIVE CONTROL: a secret given as an otpauth:// URI is login-literal and is not echoed", () => {
  const uri = "otpauth://totp/Acme:alice?secret=JBSWY3DPEHPK3PXP&issuer=Acme";
  refusedBy("login-literal", { ...SIX_LINES, totp: uri }, "JBSWY3DPEHPK3PXP");
});

test("NEGATIVE CONTROL: a block with no check is login-no-check", () => {
  const noCheck: Record<string, unknown> = { ...SIX_LINES };
  delete noCheck.check;
  refusedBy("login-no-check", noCheck);
  refusedBy("login-no-check", { ...SIX_LINES, check: { role: "heading" } });
});

test("NEGATIVE CONTROL: an unknown key is login-unknown-key", () => {
  refusedBy("login-unknown-key", { ...SIX_LINES, script: "page.click()" });
  refusedBy("login-unknown-key", { ...SIX_LINES, check: { role: "heading", name: "x", selector: "#a" } });
});

test("NEGATIVE CONTROL: a javascript: start URL is login-url-not-http", () => {
  refusedBy("login-url-not-http", { ...SIX_LINES, url: "javascript:alert(1)" }, "alert(1)");
  refusedBy("login-url-not-http", { ...SIX_LINES, url: "/login" });
});

test("NEGATIVE CONTROL: a block that is not a mapping, or misses a name, is login-block-shape", () => {
  refusedBy("login-block-shape", "https://app.example.test");
  refusedBy("login-block-shape", { ...SIX_LINES, totp: undefined });
});

test("NEGATIVE CONTROL: a credential inside the start URL or an idp origin is login-literal and is not echoed", () => {
  refusedBy("login-literal", { ...SIX_LINES, url: "https://alice:hunter2x@app.example.test/login" }, "hunter2x");
  refusedBy("login-literal", { ...SIX_LINES, "idp-origins": ["https://alice:hunter2x@idp.example.test"] }, "hunter2x");
});

test("NEGATIVE CONTROL: an idp origin with a path, query, fragment, wildcard or the app's own origin is refused", () => {
  for (const entry of ["https://idp.example.test/path", "https://idp.example.test/?x=1", "https://idp.example.test/#f",
    "https://*.example.test", "https://app.example.test"]) {
    refusedBy("login-block-shape", { ...SIX_LINES, "idp-origins": [entry] });
  }
});

test("POSITIVE CONTROL: an idp origin is kept as URL.origin and a repeat is collapsed", () => {
  const b = parseLoginBlock({ ...SIX_LINES, "idp-origins": ["https://IDP.example.test", "https://idp.example.test/"] });
  assert.deepEqual(b.idpOrigins, ["https://idp.example.test"]);
});
