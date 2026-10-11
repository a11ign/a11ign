// THE SIGNED-IN CHECK (#4084, the v3 login verification). Every case is a plain observation: no browser, no network.
//
// POSITIVE CONTROL marks the cases that must say YES (a login that lands, a page that still matches). NEGATIVE CONTROL marks
// the cases that must say NO (a check the signed-out page already passes, an IdP origin, a failed re-check, a fallback). A
// suite that only proves the yeses could not tell a check that always holds from one that works.
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  fallbackCheck,
  loginVerdict,
  pageDecision,
  validateCheck,
  type PageObservation,
  type SignedInCheck,
} from "./signed-in-check.js";

const APP = "https://app.example.test";
const IDP = "https://idp.example.test";
const SIGN_IN = { role: "heading", name: "Sign in" };
const ACCOUNT = { role: "button", name: "Sign out" };

const observe = (overrides: Partial<PageObservation>): PageObservation => ({
  appOrigin: APP,
  idpOrigins: [IDP],
  finalUrl: `${APP}/`,
  elements: [SIGN_IN],
  hasPasswordField: true,
  ...overrides,
});

const SIGNED_OUT = observe({});
const SIGNED_IN = observe({ elements: [ACCOUNT], hasPasswordField: false });
const CHECK: SignedInCheck = { role: "button", name: "Sign out" };

describe("validateCheck: a check the signed-out page passes is refused before any login", () => {
  test("POSITIVE CONTROL: a check absent from the signed-out page is accepted", () => {
    assert.deepEqual(validateCheck(CHECK, SIGNED_OUT), { outcome: "accepted" });
  });

  test("NEGATIVE CONTROL: a check the signed-out start page already shows is refused by name", () => {
    const onStartPage = observe({ elements: [SIGN_IN, ACCOUNT] });
    assert.deepEqual(validateCheck(CHECK, onStartPage), { outcome: "signed-in-check-matches-signed-out" });
  });

  test("NEGATIVE CONTROL: a URL check the signed-out start page already matches is refused", () => {
    assert.deepEqual(validateCheck({ url: "/" }, SIGNED_OUT), { outcome: "signed-in-check-matches-signed-out" });
  });
});

describe("loginVerdict: a login is signed in only when the check holds after it, on the app's origin", () => {
  test("POSITIVE CONTROL: a check absent before the login and present after it, on the app's origin, is signed-in", () => {
    assert.equal(loginVerdict(CHECK, SIGNED_IN), "signed-in");
  });

  test("POSITIVE CONTROL: a URL prefix that the signed-in page's path falls under is signed-in", () => {
    assert.equal(loginVerdict({ url: "/account" }, observe({ finalUrl: `${APP}/account/orders` })), "signed-in");
  });

  test("NEGATIVE CONTROL: the element present but the final URL on the identity provider's origin is not signed in", () => {
    const onProvider = observe({ finalUrl: `${IDP}/login`, elements: [ACCOUNT] });
    assert.equal(loginVerdict(CHECK, onProvider), "signed-in-check-never-matched");
  });

  test("NEGATIVE CONTROL: the login page still shown (the check absent) is never matched", () => {
    assert.equal(loginVerdict(CHECK, SIGNED_OUT), "signed-in-check-never-matched");
  });

  test("NEGATIVE CONTROL: a URL prefix that is only a string prefix of another path does not match", () => {
    assert.equal(loginVerdict({ url: "/account" }, observe({ finalUrl: `${APP}/accounts` })), "signed-in-check-never-matched");
  });
});

describe("pageDecision: a page is audited only while the check still matches it", () => {
  const FIRST_PAGE = { loginsSoFar: 0, pagesAudited: 0 };

  test("POSITIVE CONTROL: a page that still matches the check is audited", () => {
    assert.deepEqual(pageDecision(CHECK, SIGNED_IN, FIRST_PAGE), { decision: "audit" });
  });

  test("NEGATIVE CONTROL: a failed re-check re-logs in once, the first time", () => {
    assert.deepEqual(pageDecision(CHECK, SIGNED_OUT, FIRST_PAGE), { decision: "relogin", loss: "signed-out-at-start" });
  });

  test("NEGATIVE CONTROL: a failed re-check after the one re-login is reported not audited, never audited", () => {
    const afterRelogin = { loginsSoFar: 1, pagesAudited: 0 };
    assert.deepEqual(pageDecision(CHECK, SIGNED_OUT, afterRelogin), {
      decision: "not-audited-signed-out",
      loss: "signed-out-at-start",
    });
  });

  test("NEGATIVE CONTROL: no input yields audit for a page that fails its check, whatever the progress", () => {
    const failing = [SIGNED_OUT, observe({ finalUrl: `${IDP}/login`, elements: [ACCOUNT] })];
    for (const page of failing) {
      for (const progress of [FIRST_PAGE, { loginsSoFar: 1, pagesAudited: 0 }, { loginsSoFar: 1, pagesAudited: 4 }]) {
        assert.notEqual(pageDecision(CHECK, page, progress).decision, "audit");
      }
    }
  });

  test("a loss after pages were audited is named session-lost-mid-scan, and the scan still re-logs in once", () => {
    const midScan = { loginsSoFar: 0, pagesAudited: 2 };
    assert.deepEqual(pageDecision(CHECK, SIGNED_OUT, midScan), { decision: "relogin", loss: "session-lost-mid-scan" });
    assert.deepEqual(pageDecision(CHECK, SIGNED_OUT, { loginsSoFar: 1, pagesAudited: 2 }), {
      decision: "not-audited-signed-out",
      loss: "session-lost-mid-scan",
    });
  });
});

describe("fallbackCheck: a run with no check is judged on the origin, and always says so", () => {
  test("POSITIVE CONTROL: on the app's origin with no password field and no identity-provider origin, signed in", () => {
    const { signedIn } = fallbackCheck(SIGNED_IN);
    assert.equal(signedIn, true);
  });

  test("NEGATIVE CONTROL: a password field on the app's origin is not signed in", () => {
    assert.equal(fallbackCheck(observe({ hasPasswordField: true, finalUrl: `${APP}/login` })).signedIn, false);
  });

  test("NEGATIVE CONTROL: a page on the identity provider's origin is not signed in", () => {
    assert.equal(fallbackCheck(observe({ finalUrl: `${IDP}/login`, hasPasswordField: false })).signedIn, false);
  });

  test("NEGATIVE CONTROL: the warning is present whatever the verdict, so a fallback is never silent", () => {
    for (const page of [SIGNED_IN, SIGNED_OUT]) {
      assert.match(fallbackCheck(page).warning, /No signed-in check was given/);
    }
  });
});
