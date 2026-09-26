// THE DECISIONS OF `npm run auth:leak-check` (ADR 0038, Constraint 4's command), without a worker.
//
// `leak-check-script.test.ts` runs the whole script against a fake worker. This file pins what the script DECIDES, in the
// three commands' terms: the real run exits 0 with examined > 0; the first control exits EXACTLY 1; the second exits 0
// with a redaction count of at least 1. And what it must never do: turn "could not look" into a pass.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { LEAK_EXIT } from "./leak-detector.js";
import {
  LeakCheckUsageError, credentialsFrom, examine, examineRaw, examineWritten, parseLeakCheckArgs, redactionCountIn,
} from "./leak-check.js";
import { MARKER, credentialsFromState, type StorageState } from "./scrub.js";

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

// ---- ADR 0038, amendment 7: the same two controls, for a STORAGE STATE's values ---------------------------------------
//
// Which control is which: "control 1" is Constraint 4's first positive control (`--stage raw` on the echoing fixture exits
// EXACTLY 1) and "control 2" its second (`--stage written` on the same fixture exits 0 with a redaction count of at least 1).
// `auth-leak-detector.test.ts` uses the words for other controls (the spelled-out transcript), and this file does not.

const ORIGIN = "http://127.0.0.1:1";
const STATE_SESSION = "statesessioncookie-4b7e19";
const STATE_TOKEN = "state-bearer-token-0a1b2c3d4e";
const STATE: StorageState = {
  cookies: [{ name: "sid", value: STATE_SESSION, domain: "127.0.0.1" }, { name: "theme", value: "dark", domain: "127.0.0.1" }],
  origins: [{ origin: ORIGIN, localStorage: [{ name: "auth", value: JSON.stringify({ token: STATE_TOKEN }) }] }],
};
const STATE_CREDENTIALS = credentialsFromState(STATE, { origin: ORIGIN, publicText: [] }).credentials;
const STATE_ECHO = { ...QUIET, transcript: [...QUIET.transcript, `Session, edit, ${STATE_SESSION}`, `Token, edit, ${STATE_TOKEN}`] };

test("STATE control 1: --stage raw over a transcript that echoes a state cookie exits EXACTLY 1, naming a place and never the value", () => {
  const outcome = examineRaw(STATE_ECHO, STATE_CREDENTIALS);
  assert.equal(outcome.exit, 1, "exactly 1: exit 2 means the command could not run and is not a pass");
  assert.match(outcome.lines.join("\n"), /LEAK: state cookie 1 \(contiguous, raw\), state localStorage 1 \(contiguous, raw\)/);
  assert.ok(!outcome.lines.join("\n").includes(STATE_SESSION) && !outcome.lines.join("\n").includes(STATE_TOKEN));
});

test("STATE control 2: --stage written over the same transcript exits 0 with at least one redaction, and the files hold neither value", () => {
  cleanly((path) => {
    const outcome = examineWritten(STATE_ECHO, STATE_CREDENTIALS, path);
    assert.equal(outcome.exit, LEAK_EXIT.clean);
    assert.equal(redactionCountIn(outcome.lines), 2);
    const written = readFileSync(join(path, "witness.json"), "utf8");
    assert.ok(!written.includes(STATE_SESSION) && !written.includes(STATE_TOKEN));
    assert.ok(written.includes(`Session, edit, ${MARKER}`));
  });
});

test("STATE real run: a transcript that echoes nothing from the state exits 0 with a non-zero examined count, and nothing is redacted", () => {
  cleanly((path) => {
    const outcome = examineWritten(QUIET, STATE_CREDENTIALS, path);
    assert.equal(outcome.exit, LEAK_EXIT.clean);
    assert.match(outcome.lines.join("\n"), /examined 1 file and 4 announcements/);
    assert.equal(redactionCountIn(outcome.lines), 0);
  });
});

test("STATE short value (choice 4): a value below the floor is neither a leak nor redacted, and the run counts it instead of staying silent", () => {
  const found = credentialsFromState(STATE, { origin: ORIGIN, publicText: [] });
  assert.equal(found.skippedShort, 1, "the theme cookie, `dark`");
  const page = { ...QUIET, transcript: [...QUIET.transcript, "Theme, edit, dark"] };
  assert.equal(examineRaw(page, found.credentials).exit, LEAK_EXIT.clean);
  cleanly((path) => {
    const outcome = examineWritten(page, found.credentials, path);
    assert.equal(outcome.exit, LEAK_EXIT.clean);
    assert.ok(readFileSync(join(path, "witness.json"), "utf8").includes("Theme, edit, dark"), "the page's own word is not rewritten");
  });
});

// ---- ADR 0038, amendment 7: THE TOOL WRITES NO STATE FILE, as a test ----------------------------------------------------

const REPO = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "../../../..");
/** Write-capable node:fs names. `open` and `cp` are left out: they are ordinary method names and would flag readers. */
const WRITERS = ["writeFile", "writeFileSync", "appendFile", "appendFileSync", "createWriteStream", "copyFile", "copyFileSync",
  "cpSync", "rename", "renameSync", "truncate", "truncateSync", "writev", "writevSync"];
const NAMES = WRITERS.join("|");
const CALL = new RegExp(`\\b(${NAMES})\\s*\\(`);
const FS_IMPORT = new RegExp(`import\\s*\\{[^}]*\\b(${NAMES})\\b[^}]*\\}\\s*from\\s*["'](?:node:)?fs(?:/promises)?["']`, "s");

/** Comment lines are prose, and prose may say `writeFileSync`. A trailing comment after code is still code's line. */
const isComment = (line: string): boolean => /^\s*(\/\/|\/\*|\*)/.test(line);

interface WriteSite { file: string; kind: "call" | "import"; line: number }

/** Every write-capable call, and every import of a write-capable name, in the given files (paths relative to the repo). */
function writeSitesIn(files: readonly string[], root: string): WriteSite[] {
  return files.flatMap((file) => {
    const text = readFileSync(join(root, file), "utf8");
    const calls = text.split("\n").flatMap((line, index) => (!isComment(line) && CALL.test(line) ? [{ file, kind: "call" as const, line: index + 1 }] : []));
    return FS_IMPORT.test(text) ? [...calls, { file, kind: "import" as const, line: 0 }] : calls;
  });
}

/** The auth directory alone holds more than this many non-test sources; fewer scanned means the walk missed the population. */
const MIN_SCANNED_FILES = 10;
const AUTH_DIR = "packages/cli/src/auth";
const WORKER_AUTH_FILES = ["packages/nvda-worker/src/auth-flow.mjs", "packages/nvda-worker/src/capture-auth.mjs"];
const inspected = (root: string): string[] => [
  ...readdirSync(join(root, AUTH_DIR)).filter((name) => /\.(ts|mjs)$/.test(name) && !name.endsWith(".test.ts")).map((name) => `${AUTH_DIR}/${name}`),
  ...WORKER_AUTH_FILES,
];

/** The ONE writer: `leak-check.ts` writes its own scrubbed output into the temp directory it was handed, and no state. */
const ALLOWED = [{ file: `${AUTH_DIR}/leak-check.ts`, kind: "call" }, { file: `${AUTH_DIR}/leak-check.ts`, kind: "import" }];

test("THE TOOL WRITES NO STATE FILE: every write under the auth code and the worker's login is the one allowlisted writer", () => {
  const files = inspected(REPO);
  // Positive control for the emptiness below: the scan really visited the population it claims to (the three files a state
  // would most plausibly be written from, and enough of the directory that an empty read cannot pass).
  for (const must of [`${AUTH_DIR}/leak-check.ts`, `${AUTH_DIR}/interpreter.ts`, `${AUTH_DIR}/scrub.ts`, ...WORKER_AUTH_FILES]) {
    assert.ok(files.includes(must), `${must} was not scanned`);
  }
  assert.ok(files.length >= MIN_SCANNED_FILES, `only ${files.length} files were scanned`);
  const sites = writeSitesIn(files, REPO).map(({ file, kind }) => ({ file, kind }));
  assert.deepEqual(sites.sort((a, b) => a.kind.localeCompare(b.kind)), [...ALLOWED].sort((a, b) => a.kind.localeCompare(b.kind)),
    "a new file write in the auth code: it may not be a state, and if it is legitimate it joins ALLOWED here with its reason");
  // What the one allowed write is: under the directory it was HANDED, and it is the scrubbed artifact, not an input.
  const source = readFileSync(join(REPO, `${AUTH_DIR}/leak-check.ts`), "utf8");
  assert.equal(source.split("\n").filter((line) => !isComment(line) && CALL.test(line)).length, 1);
  assert.match(source, /writeFileSync\(join\(dir, "witness\.json"\), text\)/);
});

test("THE NO-WRITE GUARD CAN FAIL: a scratch module that writes a state is caught, an aliased import too, and a reader is not", () => {
  const root = mkdtempSync(join(tmpdir(), "no-write-guard-"));
  try {
    mkdirSync(join(root, "scratch"));
    const scratch = (name: string, body: string) => { writeFileSync(join(root, "scratch", name), body); return `scratch/${name}`; };
    const writes = scratch("writes-state.ts", 'import { writeFileSync } from "node:fs";\nexport const save = (s: string) => writeFileSync("/tmp/state.json", s);\n');
    const aliased = scratch("aliased.ts", 'import {\n  readFileSync,\n  writeFileSync as w,\n} from "node:fs";\nexport const save = (s: string) => w("/tmp/state.json", s);\n');
    const stream = scratch("stream.mjs", 'import fs from "node:fs";\nexport const open = (p) => fs.createWriteStream(p);\n');
    const reads = scratch("reads.ts", 'import { readFileSync } from "node:fs";\n// writeFileSync( is only prose here\nexport const load = (p: string) => readFileSync(p, "utf8");\n');
    assert.deepEqual(writeSitesIn([writes], root).map((site) => site.kind).sort(), ["call", "import"]);
    assert.deepEqual(writeSitesIn([aliased], root).map((site) => site.kind), ["import"], "an alias hides the call, and the import is what still shows it");
    assert.deepEqual(writeSitesIn([stream], root).map((site) => site.kind), ["call"]);
    assert.deepEqual(writeSitesIn([reads], root), [], "the marker stops complaining when there is nothing to find");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
