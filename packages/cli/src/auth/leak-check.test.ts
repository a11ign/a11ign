// THE DECISIONS OF `npm run auth:leak-check` (ADR 0038, Constraint 4's command), without a worker.
//
// `leak-check-script.test.ts` runs the whole script against a fake worker. This file pins what the script DECIDES, in the
// three commands' terms: the real run exits 0 with examined > 0; the first control exits EXACTLY 1; the second exits 0
// with a redaction count of at least 1. And what it must never do: turn "could not look" into a pass.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LEAK_EXIT } from "./leak-detector.js";
import {
  LeakCheckUsageError, credentialsFrom, examine, examineRaw, examineWritten, parseLeakCheckArgs, redactionCountIn,
} from "./leak-check.js";
import { MARKER } from "./scrub.js";

const FAKE_USER = "canaryuser6d3f2a";
const FAKE_SECRET = "canarysecretb81c94";
const CREDENTIALS = [{ name: "FAKE_USER", value: FAKE_USER }, { name: "FAKE_SECRET", value: FAKE_SECRET }];
const ENV = { FAKE_USER, FAKE_SECRET };

const QUIET = { url: "http://127.0.0.1:1/login-quiet/account", transcript: ["Account", "heading level 1, Account", "Welcome back.", "Orders, heading level 2"] };
const ECHO = { ...QUIET, url: "http://127.0.0.1:1/login-echo/account", transcript: [...QUIET.transcript, `Username, edit, ${FAKE_USER}`] };
const SPELLED = { ...QUIET, transcript: [...QUIET.transcript, ...FAKE_USER.split("")] };

const dir = () => mkdtempSync(join(tmpdir(), "leak-check-test-"));
const cleanly = <T>(work: (path: string) => T): T => {
  const path = dir();
  try { return work(path); } finally { rmSync(path, { recursive: true, force: true }); }
};

const refuses = (argv: string[], match: RegExp) =>
  assert.throws(() => parseLeakCheckArgs(argv), (e: Error) => e instanceof LeakCheckUsageError && match.test(e.message), argv.join(" "));

test("the ADR's three commands parse, in the spelling the ADR writes and in --flag=value", () => {
  const base = ["--user-env", "FAKE_USER", "--secret-env", "FAKE_SECRET"];
  assert.deepEqual(parseLeakCheckArgs(["--fixture", "login-quiet", "--stage", "written", ...base]),
    { fixture: "login-quiet", stage: "written", userEnv: "FAKE_USER", secretEnv: "FAKE_SECRET", worker: "http://127.0.0.1:8765" });
  assert.equal(parseLeakCheckArgs(["--fixture", "login-echo", "--stage", "raw", ...base]).stage, "raw");
  assert.deepEqual(parseLeakCheckArgs(["--fixture=login-echo", "--stage=written", "--user-env=FAKE_USER", "--secret-env=FAKE_SECRET", "--worker=http://127.0.0.1:9000"]),
    { fixture: "login-echo", stage: "written", userEnv: "FAKE_USER", secretEnv: "FAKE_SECRET", worker: "http://127.0.0.1:9000" });
});

test("a mistyped or missing argument is REFUSED by name; it never runs a default and reports success", () => {
  const ok = ["--fixture", "login-quiet", "--stage", "raw", "--user-env", "A", "--secret-env", "B"];
  refuses([...ok, "--stag", "raw"], /unknown argument.*--stag/);
  refuses(ok.filter((arg) => arg !== "--stage" && arg !== "raw"), /--stage is required/);
  refuses(["--fixture", "login-other", ...ok.slice(2)], /--fixture must be login-quiet or login-echo/);
  refuses(["--fixture", "login-quiet", "--stage", "cooked", ...ok.slice(4)], /--stage must be raw or written/);
  refuses([...ok, "--fixture", "login-echo"], /--fixture was given twice/);
  refuses(["--fixture", "--stage", "raw", "--user-env", "A", "--secret-env", "B"], /--fixture needs a value/);
  refuses(["login-quiet"], /unknown argument/);
});

test("the credentials come from the NAMED variables, and a missing or short one is 'could not run', not a verdict", () => {
  const args = { userEnv: "FAKE_USER", secretEnv: "FAKE_SECRET" };
  assert.deepEqual(credentialsFrom(args, ENV), CREDENTIALS);
  assert.throws(() => credentialsFrom(args, { FAKE_USER }), /FAKE_SECRET is not set/);
  assert.throws(() => credentialsFrom(args, { ...ENV, FAKE_USER: "" }), /FAKE_USER is not set/);
  assert.throws(() => credentialsFrom(args, { ...ENV, FAKE_USER: "admin" }), /shorter than 8 characters.*amendment 2/s);
});

test("COMMAND 2, the first positive control: --stage raw on the ECHOING fixture exits EXACTLY 1", () => {
  const outcome = examineRaw(ECHO, CREDENTIALS);
  assert.equal(outcome.exit, LEAK_EXIT.leak);
  assert.equal(outcome.exit, 1, "exactly 1: exit 2 means the command could not run and is not a pass");
  assert.match(outcome.lines.join("\n"), /LEAK: FAKE_USER \(contiguous, raw\)/);
  assert.match(outcome.lines.join("\n"), /examined 1 file and 5 announcements/);
  assert.ok(!outcome.lines.join("\n").includes(FAKE_USER), "the report names the variable and never the value");
});

test("COMMAND 1, the real run: --stage written on the QUIET fixture exits 0 with a non-zero examined count", () => {
  cleanly((path) => {
    const outcome = examineWritten(QUIET, CREDENTIALS, path);
    assert.equal(outcome.exit, LEAK_EXIT.clean);
    assert.match(outcome.lines.join("\n"), /examined 1 file and 4 announcements/);
    assert.equal(redactionCountIn(outcome.lines), 0);
    assert.match(outcome.lines[0], /^No announcement contained a value from your login\./);
  });
});

test("COMMAND 3, the second positive control: --stage written on the ECHOING fixture exits 0 with a redaction count of at least 1", () => {
  cleanly((path) => {
    const outcome = examineWritten(ECHO, CREDENTIALS, path);
    assert.equal(outcome.exit, LEAK_EXIT.clean);
    assert.ok(redactionCountIn(outcome.lines) >= 1, `the scrub had no work to do: ${outcome.lines.join(" | ")}`);
    // What was WRITTEN, read back from disk: the credential is gone and the marker is in its place.
    const written = readFileSync(join(path, "witness.json"), "utf8");
    assert.ok(!written.includes(FAKE_USER) && !written.includes(FAKE_SECRET));
    assert.ok(written.includes(`Username, edit, ${MARKER}`));
  });
});

test("the two controls are one detector apart: the raw stage finds what the written stage removed", () => {
  cleanly((path) => {
    assert.equal(examineRaw(ECHO, CREDENTIALS).exit, LEAK_EXIT.leak);
    assert.equal(examineWritten(ECHO, CREDENTIALS, path).exit, LEAK_EXIT.clean);
  });
});

test("a run the containment REFUSES to write is exit 1 (a leak it caught), and nothing is left on disk", () => {
  cleanly((path) => {
    const outcome = examineWritten(SPELLED, CREDENTIALS, path);
    assert.equal(outcome.exit, LEAK_EXIT.leak);
    assert.match(outcome.lines.join("\n"), /REFUSED to write.*auth-credential-in-artifact/s);
    assert.deepEqual(readdirSync(path), [], "nothing was written");
    assert.ok(!existsSync(join(path, "witness.json")));
  });
  // And the raw stage sees the same spelled-out run: the two stages use one detector.
  assert.equal(examineRaw(SPELLED, CREDENTIALS).exit, LEAK_EXIT.leak);
});

test("EXAMINING ZERO IS EXIT 2, in both stages: a capture that produced nothing cannot read as clean", () => {
  cleanly((path) => {
    for (const empty of [{ ...QUIET, transcript: [] }, { url: "x" }, {}]) {
      assert.equal(examineWritten(empty, CREDENTIALS, path).exit, LEAK_EXIT.couldNotExamine, JSON.stringify(empty));
    }
  });
  for (const empty of [{ ...QUIET, transcript: [] }, null, undefined]) {
    assert.equal(examineRaw(empty, CREDENTIALS).exit, LEAK_EXIT.couldNotExamine, JSON.stringify(empty));
  }
  assert.match(examineRaw(null, CREDENTIALS).lines.join("\n"), /COULD NOT EXAMINE.*not a pass/);
  // The report says how much was looked at, and for nothing it says NOTHING, not "1 file": no file was examined.
  assert.match(examineRaw(null, CREDENTIALS).lines.join("\n"), /examined 0 files and 0 announcements/);
});

test("examine() dispatches on the stage, and reads the files back rather than the object it wrote from", () => {
  cleanly((path) => {
    const args = { fixture: "login-echo" as const, stage: "written" as const, userEnv: "FAKE_USER", secretEnv: "FAKE_SECRET", worker: "http://127.0.0.1:1" };
    assert.equal(examine(args, ECHO, CREDENTIALS, path).exit, 0);
    assert.equal(examine({ ...args, stage: "raw" }, ECHO, CREDENTIALS, path).exit, 1);
  });
});

test("redactionCountIn reads the disclosed count and is 0 when there is none", () => {
  assert.equal(redactionCountIn(["2 announcements contained a value from your login and were redacted."]), 2);
  assert.equal(redactionCountIn(["1 announcement contained a value from your login and was redacted."]), 1);
  assert.equal(redactionCountIn(["No announcement contained a value from your login."]), 0);
  assert.equal(redactionCountIn([]), 0);
});
