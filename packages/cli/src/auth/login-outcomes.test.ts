// How a login ends (#4984, under #4084). The retry rules here are the lockout rules: a retry the provider counts
// against the account is the defect this file exists to stop. Each control is named beside the case it controls.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LOGIN_EXIT_CODES,
  LOGIN_OUTCOMES,
  LOGIN_RETRY_BACKOFF_MS,
  MAX_LOGIN_RETRIES_PER_RUN,
  isFinal,
  retryDecision,
  type LoginOutcome,
} from "./login-outcomes.js";

const ALL_OUTCOMES = Object.keys(LOGIN_OUTCOMES) as LoginOutcome[];
const ATTEMPTS = [1, 2, 3];
const OUTCOME_COUNT = 15;

// POSITIVE CONTROL: a timeout on the first attempt retries once, after a backoff, and every outcome has a remedy.
test("POSITIVE CONTROL: a transient failure on the first attempt retries once, after a backoff", () => {
  const decision = retryDecision({ outcome: "signed-in-check-never-matched", attempt: 1, transient: true, retriesSoFar: 0 });
  assert.deepEqual(decision, { action: "retry", backoffMs: LOGIN_RETRY_BACKOFF_MS });
  assert.ok(LOGIN_RETRY_BACKOFF_MS > 0);
});

test("POSITIVE CONTROL: every outcome names a non-empty, single-line remedy", () => {
  for (const outcome of ALL_OUTCOMES) {
    const { remedy } = LOGIN_OUTCOMES[outcome];
    assert.ok(remedy.trim().length > 0, `${outcome} has no remedy`);
    assert.ok(!remedy.includes("\n"), `${outcome} remedy spans lines`);
  }
});

// The row's body says "fourteen"; its list names fifteen, since the 09:23Z amendment added mfa-unavailable-on-plan.
test("POSITIVE CONTROL: the list is the fifteen outcomes the row's list names", () => {
  assert.equal(ALL_OUTCOMES.length, OUTCOME_COUNT);
});

test("the session-lost exit code is not the violations-found exit code (cli.ts sets 1 for findings)", () => {
  assert.notEqual(LOGIN_EXIT_CODES.sessionLost, 1);
});

// NEGATIVE CONTROL: a rejected credential, a rejected code and a block never retry, at any attempt, transient or not.
test("NEGATIVE CONTROL: credentials-rejected, totp-rejected and account-blocked never retry", () => {
  for (const outcome of ["credentials-rejected", "totp-rejected", "account-blocked"] as const) {
    for (const attempt of ATTEMPTS) {
      for (const transient of [true, false]) {
        const decision = retryDecision({ outcome, attempt, transient, retriesSoFar: 0 });
        assert.deepEqual(decision, { action: "stop" }, `${outcome} attempt ${attempt} transient ${transient}`);
      }
    }
  }
});

test("every final outcome stops, even on a transient failure on the first attempt", () => {
  for (const outcome of ALL_OUTCOMES.filter(isFinal)) {
    assert.deepEqual(retryDecision({ outcome, attempt: 1, transient: true, retriesSoFar: 0 }), { action: "stop" }, outcome);
  }
});

// NEGATIVE CONTROL: a second transient failure stops, so one retry is the most a run ever makes.
test("NEGATIVE CONTROL: a second transient failure stops", () => {
  assert.deepEqual(retryDecision({ outcome: "session-lost-mid-scan", attempt: 2, transient: true, retriesSoFar: 0 }), { action: "stop" });
});

// NEGATIVE CONTROL: the per-run cap holds even when the attempt number says the retry is due.
test("NEGATIVE CONTROL: the per-run cap stops a retry the attempt number would allow", () => {
  assert.equal(MAX_LOGIN_RETRIES_PER_RUN, 1);
  assert.deepEqual(retryDecision({ outcome: "session-lost-mid-scan", attempt: 1, transient: true, retriesSoFar: 1 }), { action: "stop" });
});

test("a failure that is not transient does not retry, even a non-final outcome", () => {
  assert.deepEqual(retryDecision({ outcome: "rate-limited", attempt: 1, transient: false, retriesSoFar: 0 }), { action: "stop" });
});

// NEGATIVE CONTROL: the plan stop is not a bad code, and its remedy says the plan is the cause.
test("NEGATIVE CONTROL: mfa-unavailable-on-plan is not totp-rejected, and its remedy names the plan", () => {
  assert.notEqual(LOGIN_OUTCOMES["mfa-unavailable-on-plan"].remedy, LOGIN_OUTCOMES["totp-rejected"].remedy);
  assert.match(LOGIN_OUTCOMES["mfa-unavailable-on-plan"].remedy, /plan/);
  assert.ok(isFinal("mfa-unavailable-on-plan"));
});
