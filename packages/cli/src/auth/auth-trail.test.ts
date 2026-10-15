// THE SIGN-IN LOOP'S TRAIL (a11ign#5510, under a11ign#5495). The marks are fed the way the interpreter sends them, so no browser is driven.
//
// POSITIVE CONTROL: an `authLoop` lands in the file the variable names, with each screen and the control pressed on it, and the outcome.
// NEGATIVE CONTROL: a value a mark carries never reaches the file, a variable that is unset or empty writes nothing, and the events that
// are not loops write nothing. A suite of only the first could not tell a trail that keeps values from one that drops them.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AUTH_TRAIL_ENV, authTrailMark } from "./auth-trail.ts";

const FAKE_USER = "trail-user@example.test";
const FAKE_SECRET = "trail-secret-not-real";

const LOOP = {
  phase: "login",
  index: 2,
  outcome: "signed-in",
  branches: [
    { screen: "identifier-and-password", kind: "type" },
    { screen: "one-time-code", kind: "type" },
    { screen: "passkey-nudge", kind: "skip" },
  ],
};

/** A fresh directory per test, so each test names a file no other test has written (the collector is per file, per process). */
function trailDir(): string {
  return mkdtempSync(join(tmpdir(), "auth-trail-"));
}

function readTrail(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}

describe("the trail file", () => {
  test("POSITIVE CONTROL: an authLoop is written with its screens, the controls pressed, and the outcome", () => {
    const dir = trailDir();
    try {
      const file = join(dir, "trail.json");
      // The documented name, spelled out: a caller sets this literal, so the test must not read it back from the constant it checks.
      authTrailMark({ A11Y_AUTH_TRAIL_FILE: file })("authLoop", LOOP);
      assert.deepEqual(readTrail(file), { loops: [LOOP] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("NEGATIVE CONTROL: a value carried by a mark never reaches the file, whether top-level or on a branch", () => {
    const dir = trailDir();
    try {
      const file = join(dir, "trail.json");
      const carrying = {
        ...LOOP,
        typed: FAKE_SECRET,
        branches: [{ screen: "identifier-and-password", kind: "type", text: FAKE_USER }, { screen: "one-time-code", kind: "type", text: FAKE_SECRET }],
      };
      authTrailMark({ [AUTH_TRAIL_ENV]: file })("authLoop", carrying);
      const written = readFileSync(file, "utf8");
      for (const secret of [FAKE_USER, FAKE_SECRET]) assert.ok(!written.includes(secret), "the trail must not hold a typed value");
      assert.deepEqual(readTrail(file), {
        loops: [{ ...LOOP, branches: [{ screen: "identifier-and-password", kind: "type" }, { screen: "one-time-code", kind: "type" }] }],
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("NEGATIVE CONTROL: no variable, or an empty one, writes no file", () => {
    const dir = trailDir();
    try {
      authTrailMark({})("authLoop", LOOP);
      authTrailMark({ [AUTH_TRAIL_ENV]: "" })("authLoop", LOOP);
      assert.deepEqual(readdirSync(dir), []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("NEGATIVE CONTROL: the marks that are not loops write nothing", () => {
    const dir = trailDir();
    try {
      const file = join(dir, "trail.json");
      const mark = authTrailMark({ [AUTH_TRAIL_ENV]: file });
      mark("authStep", { phase: "login", index: 1, verb: "goto" });
      mark("authStateLoaded", { cookies: 3, localStorage: 0 });
      mark("authApplied", { steps: 4 });
      assert.deepEqual(readdirSync(dir), []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("every loop of a run joins the one file, in the order the sign-ins ran (a scan signs in once per page)", () => {
    const dir = trailDir();
    try {
      const file = join(dir, "trail.json");
      const env = { [AUTH_TRAIL_ENV]: file };
      const second = { ...LOOP, phase: "flow", index: 5, outcome: "left-origin" };
      authTrailMark(env)("authLoop", LOOP);
      authTrailMark(env)("authLoop", second);
      assert.deepEqual(readTrail(file), { loops: [LOOP, second] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
