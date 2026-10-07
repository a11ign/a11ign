// THE REMEDIATION FOR `auth-login-failed` READS BOTH MEANINGS OF `expect-not-met` (#4015, found on #2568).
//
// `interpreter.ts` throws `expect-not-met` at three sites when the driver reports `result.ok` false: a `goto` step
// that did not load, loading the saved state, and the requested page after the login. So a page that NEVER LOADED
// ends as the same reason as a page that loaded and was the wrong one, and a reader told only the second goes to
// fix an `expect:` that was never evaluated. The reason set stays three (ADR 0038): a fourth is `ceo`'s ruling.
import { test } from "node:test";
import assert from "node:assert/strict";

import { remediationFor } from "../fault-remediation.js";
import { LOGIN_FAILURE_REASONS } from "./auth-faults.js";

const what = (): string => remediationFor("auth-login-failed")!.what;

test("the remediation says expect-not-met is also what a page that never loaded ends as", () => {
  assert.match(what(), /never loaded|not loaded|could not be loaded/i);
});

test("the remediation tells the reader the message's step and could-not-be-loaded line say which it was", () => {
  assert.match(what(), /could not be loaded \(/);
  assert.match(what(), /step/);
});

test("positive control: the wrong-page meaning is still there", () => {
  assert.match(what(), /not the one the flow expects/);
});

test("the reason set is still exactly the three the ADR names", () => {
  assert.deepEqual([...LOGIN_FAILURE_REASONS], ["expect-not-met", "unbindable-field", "left-origin"]);
});
