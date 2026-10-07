/**
 * #3855 (incident #3846, 1): EVERY RUN HAS A PRIVATE `TMPDIR` THAT IS REMOVED WHEN THE RUN ENDS, AND A TEST FILE THAT LEAVES AN ENTRY IN IT IS NAMED.
 *
 * Acceptance: `npx rstest run --config scripts/rstest/rstest.config.mjs --include scripts/private-tmp.test.ts`.
 *
 * TWO KINDS OF READING. The first test reads THIS run: the file is running under the repository's config, so its own `TMPDIR` must already be a
 * subdirectory of a `run-<id>` under `~/.cache/a11ign/tmp`. The rest drive the helper, and the end-to-end ones start a SECOND rstest run in a
 * throwaway project whose `HOME` is a directory of this test's own, so "the run's directory is gone" is a read of a directory that nothing else writes.
 *
 * POSITIVE CONTROLS, named where the emptiness assertions are: `clean.test.mjs` makes a directory and removes it, `leaky.test.mjs` makes one and does not, and
 * the report must name the second and never the first, so "no leak reported" is a reading of a run that CAN report one. The failed run has a file that
 * throws, so "removed on a failed run" is read after a run that did fail (non-zero exit), not assumed from a green one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tempDir } from "../packages/guards/src/test-tmp.mjs";
import { adoptFileDirectory, endRun, fileDirectoryName, formatLeftovers, PRIVATE_TMP_ROOT, privateRunRoot, privateRunTmp, removeInSmallCalls, reportLeftovers, requirePrivateRunDir, withPrivateTmp } from "./private-tmp.mjs";
import config from "./rstest/rstest.config.mjs";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const HELPER = join(REPO, "scripts/private-tmp.mjs");
const RSTEST = join(REPO, "node_modules/.bin/rstest");
const RUN_ENV = "A11Y_PRIVATE_TMP_RUN";
const READ_ONLY_MODE = 0o555;
const WRITABLE_MODE = 0o755;
/** Longer than the 255 bytes a filename may be on any filesystem this runs on. */
const BEYOND_NAME_MAX = 300;

test("this run's TMPDIR is a subdirectory of a private run-<id> under ~/.cache/a11ign/tmp, and it exists", () => {
  const fileDir = process.env.TMPDIR ?? "";
  assert.equal(tmpdir(), fileDir, "os.tmpdir() follows TMPDIR, which is how every mkdtempSync(join(tmpdir(), ...)) in the suite lands inside it");
  if (!process.env[RUN_ENV]) {
    // A TMPDIR the caller set is the caller's and `setup` made no run (the last test below reads that): `verify` hands its own run down, and a sandbox that can
    // write only /tmp hands one in (#3932). The ordinary run sets RUN_ENV for every worker, so the reading below is still made wherever the config made the run.
    assert.ok(existsSync(fileDir) && fileDir !== "/tmp", `a caller's TMPDIR is a real directory of their own: ${fileDir}`);
    return;
  }
  const runDir = dirname(fileDir);
  assert.equal(dirname(runDir), join(homedir(), PRIVATE_TMP_ROOT));
  assert.match(basename(runDir), /^run-/);
  assert.equal(basename(fileDir), fileDirectoryName(fileURLToPath(import.meta.url)), "the file's own subdirectory, named for it");
  assert.ok(existsSync(fileDir));
});

test("the repository's config carries both pieces, and the toolchain's reporters are left exactly as they were", () => {
  const { globalSetup, setupFiles } = withPrivateTmp({});
  assert.deepEqual(config.globalSetup, [HELPER]);
  assert.deepEqual(config.globalSetup, globalSetup);
  assert.deepEqual(config.setupFiles, setupFiles);
  assert.match(setupFiles[0] ?? "", /^data:text\/javascript;base64,/, "a virtual module: this file cannot be in both lists, since rstest sorts an entry by the first it is in");
  const source = Buffer.from((setupFiles[0] ?? "").split(",")[1] ?? "", "base64").toString();
  assert.match(source, /adoptAndWatch\(\);/);
  assert.ok(source.includes(JSON.stringify(HELPER)), "and it imports this helper by its absolute path");
  const reporters = (config.reporters ?? []) as unknown[];
  assert.ok(reporters.every((reporter) => typeof reporter === "string" || Array.isArray(reporter) || typeof (reporter as { onTestRunEnd?: unknown }).onTestRunEnd === "function"));
  assert.ok(!reporters.some((reporter) => typeof reporter === "object" && !Array.isArray(reporter) && "onTestRunStart" in (reporter as object)), "test-verdict-line pins the list: no reporter of ours");
});

test("withPrivateTmp refuses a config that already names globalSetup or setupFiles, rather than dropping one", () => {
  assert.throws(() => withPrivateTmp({ globalSetup: ["x.mjs"] }), /already sets globalSetup/);
  assert.throws(() => withPrivateTmp({ setupFiles: ["x.mjs"] }), /already sets setupFiles/);
  assert.deepEqual(withPrivateTmp({ include: ["a"] }).include, ["a"], "the control: a config that names neither passes through whole");
});

test("removeInSmallCalls removes a tree, never follows a symlink out of it, and takes a directory with no permissions", () => {
  const scratch = tempDir("private-tmp-remove-");
  const outside = join(scratch, "outside");
  const tree = join(scratch, "tree");
  mkdirSync(outside);
  writeFileSync(join(outside, "keep"), "x");
  mkdirSync(join(tree, "a", "b"), { recursive: true });
  writeFileSync(join(tree, "a", "b", "file"), "x");
  symlinkSync(outside, join(tree, "link"));
  mkdirSync(join(tree, "locked"));
  writeFileSync(join(tree, "locked", "file"), "x");
  chmodSync(join(tree, "locked"), 0);
  removeInSmallCalls(tree);
  assert.equal(existsSync(tree), false);
  assert.deepEqual(readdirSync(outside), ["keep"], "the symlink was removed, its target was not walked");
  removeInSmallCalls(tree);
});

test("removeInSmallCalls refuses an empty, unset or relative name, and removes nothing", () => {
  const scratch = tempDir("private-tmp-refuse-");
  writeFileSync(join(scratch, "sentinel"), "x");
  for (const name of ["", undefined]) assert.throws(() => removeInSmallCalls(name), /empty directory name/);
  assert.throws(() => removeInSmallCalls("some/relative"), /relative directory name/);
  assert.deepEqual(readdirSync(scratch), ["sentinel"]);
});

test("endRun refuses when beginRun made nothing, and requirePrivateRunDir refuses what is not a run-<id> under the private root", () => {
  const scratch = tempDir("private-tmp-endrun-");
  const decoy = join(scratch, "run-decoy");
  mkdirSync(decoy);
  assert.throws(() => endRun(), /no run directory was begun/);
  for (const dir of [decoy, scratch, "", undefined, "relative/run-x", join(scratch, PRIVATE_TMP_ROOT, "run-x", "nested")]) {
    assert.throws(() => requirePrivateRunDir(dir, join(scratch, PRIVATE_TMP_ROOT)), /no run directory to remove|not a run-<id> directory under/, String(dir));
  }
  const made = madeWithTmpdirRestored(scratch);
  assert.equal(requirePrivateRunDir(made, join(scratch, PRIVATE_TMP_ROOT)), made, "the control: a real run directory under the home it was made for is accepted");
  removeInSmallCalls(made);
  assert.ok(existsSync(decoy));
});

/** `privateRunTmp` points this worker's TMPDIR at what it makes, so a test that calls it puts TMPDIR back, or every later `tempDir` lands in a removed directory. */
function madeWithTmpdirRestored(home: string, observe: (dir: string) => void = () => {}) {
  const before = process.env.TMPDIR;
  try {
    const dir = privateRunTmp({ home });
    observe(dir);
    return dir;
  } finally {
    if (before === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = before;
  }
}

test("privateRunTmp makes run-<id> under the given home and points TMPDIR at it", () => {
  const home = tempDir("private-tmp-home-");
  const dir = madeWithTmpdirRestored(home, (made) => assert.equal(process.env.TMPDIR, made));
  assert.equal(dirname(dir), join(home, PRIVATE_TMP_ROOT));
  assert.ok(existsSync(dir));
});

/** A home that cannot be written, as the reviewer's sandbox has: the directory exists and has no write bit. A test cleans it up with the mode restored. */
function readOnlyHome(prefix: string) {
  const home = tempDir(prefix);
  chmodSync(home, READ_ONLY_MODE);
  return home;
}

/** Runs `body` with `TMPDIR` as the caller's (`undefined` for unset) and puts it back, since `privateRunTmp` and a refusal both read it. */
function withCallersTmpdir<T>(callers: string | undefined, body: () => T): T {
  const before = process.env.TMPDIR;
  if (callers === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = callers;
  try {
    return body();
  } finally {
    if (before === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = before;
  }
}

test("#3932: a read-only home with a writable TMPDIR of the caller's makes its run directory under that TMPDIR, points TMPDIR at it, and removes it with the run", () => {
  const home = readOnlyHome("private-tmp-ro-home-");
  const callers = tempDir("private-tmp-callers-");
  try {
    const dir = withCallersTmpdir(callers, () => {
      const made = privateRunTmp({ home });
      assert.equal(process.env.TMPDIR, made, "TMPDIR now names the run, so every child inherits it");
      return made;
    });
    assert.equal(dirname(dir), callers, "made directly under the caller's TMPDIR, not under the read-only home");
    assert.match(basename(dir), /^run-/);
    assert.ok(existsSync(dir));
    assert.ok(!existsSync(join(home, ".cache")), "nothing was made under the read-only home");
    removeInSmallCalls(requirePrivateRunDir(dir, callers));
    assert.ok(!existsSync(dir));
  } finally {
    chmodSync(home, WRITABLE_MODE);
  }
});

test("#3932 controls: a writable home is still used when the caller set a TMPDIR, so the fallback is not taken unconditionally", () => {
  const home = tempDir("private-tmp-rw-home-");
  const callers = tempDir("private-tmp-callers-unused-");
  const dir = withCallersTmpdir(callers, () => madeWithTmpdirRestored(home));
  assert.equal(dirname(dir), join(home, PRIVATE_TMP_ROOT));
  assert.equal(privateRunRoot({ home, env: { TMPDIR: callers } }), join(home, PRIVATE_TMP_ROOT));
  assert.deepEqual(readdirSync(callers), [], "the caller's directory was left alone");
});

test("#3932 controls: a read-only home with no usable TMPDIR refuses once, naming both places, rather than an EROFS from inside the runner", () => {
  const home = readOnlyHome("private-tmp-ro-refuse-");
  const notWritable = tempDir("private-tmp-callers-ro-");
  chmodSync(notWritable, READ_ONLY_MODE);
  try {
    for (const callers of [undefined, "", "/tmp", "/tmp/", "/var/tmp", join(notWritable, "missing"), notWritable]) {
      const refusal = (withCallersTmpdir(callers, () => {
        try {
          privateRunTmp({ home });
        } catch (error) {
          return error as Error;
        }
        return new Error("did not refuse");
      }));
      assert.match(refusal.message, /no place to make a run directory/, String(callers));
      assert.ok(refusal.message.includes(join(home, PRIVATE_TMP_ROOT)), `names the cache location: ${refusal.message}`);
      assert.ok(refusal.message.includes("TMPDIR"), `names TMPDIR: ${refusal.message}`);
      assert.equal((refusal.cause as NodeJS.ErrnoException).code, "EACCES", "the underlying refusal travels as the cause");
    }
  } finally {
    chmodSync(home, WRITABLE_MODE);
    chmodSync(notWritable, WRITABLE_MODE);
  }
});

test("#3932 controls: a failure of the home that is not an access error is rethrown, not answered with the caller's TMPDIR", () => {
  const home = tempDir("private-tmp-longname-home-");
  const callers = tempDir("private-tmp-callers-longname-");
  // A name too long for any filesystem is a defect of the path, not of who may write, so it must not be quietly answered with another directory.
  assert.throws(() => privateRunRoot({ home: join(home, "x".repeat(BEYOND_NAME_MAX)), env: { TMPDIR: callers } }), (error: NodeJS.ErrnoException) => error.code === "ENAMETOOLONG");
});

test("#3932 controls: requirePrivateRunDir judges against the root actually used, so a widened parent widens nothing that is removed", () => {
  const callers = tempDir("private-tmp-callers-widen-");
  const sibling = join(callers, "run-sibling");
  mkdirSync(sibling);
  mkdirSync(join(callers, "keep", "run-nested"), { recursive: true });
  assert.equal(requirePrivateRunDir(sibling, callers), sibling, "the control: run-<id> directly under the root used");
  for (const refused of [callers, join(callers, "keep"), join(callers, "keep", "run-nested"), join(callers, "not-a-run")]) {
    assert.throws(() => requirePrivateRunDir(refused, callers), /not a run-<id> directory under|no run directory/, refused);
  }
  assert.throws(() => requirePrivateRunDir(sibling, join(callers, "elsewhere")), /not a run-<id> directory under/, "a run under another root is refused");
});

test("adoptFileDirectory is inert without a run, and idempotent for one test path", () => {
  const run = tempDir("private-tmp-adopt-");
  const testPath = "/repo/packages/x/src/y.test.ts";
  const inert: NodeJS.ProcessEnv = { TMPDIR: "/untouched" };
  assert.equal(adoptFileDirectory({ env: inert, testPath }), undefined);
  assert.equal(inert.TMPDIR, "/untouched");
  const env: NodeJS.ProcessEnv = { TMPDIR: "/before", [RUN_ENV]: run };
  const adopted = adoptFileDirectory({ env, testPath });
  assert.equal(adopted, join(run, fileDirectoryName(testPath)));
  assert.equal(env.TMPDIR, adopted);
  assert.ok(existsSync(adopted ?? ""));
  assert.equal(adoptFileDirectory({ env, testPath }), undefined, "a second import for the same file does not nest a second directory");
  assert.equal(env.TMPDIR, adopted);
  assert.notEqual(adoptFileDirectory({ env, testPath: "/repo/packages/x/src/z.test.ts" }), undefined, "a different file in a reused worker gets its own");
  assert.notEqual(env.TMPDIR, adopted);
});

/**
 * THE FIRST CI RUN OF THIS ROW FAILED HERE (#3873, 4 test files): a file's directory is the TMPDIR of the `ansible-playbook` its tests spawn, and ansible-core's local RPC
 * server binds a unix socket at `<TMPDIR>/pymp-XXXXXXXX/listener-XXXXXXXX`. A unix socket path is capped at 107 bytes (read with Python's `socket.bind`: 107 binds, 108 is
 * "AF_UNIX path too long"). The runner's `/home/runner/.cache/a11ign/tmp/run-XXXXXX/file-<hash>-<80 characters of name>` put four files at 112-117. The positive control is
 * the OLD name length, which this same arithmetic puts over the limit, so the assertion can fail.
 */
const SOCKET_PATH_LIMIT = 107;
const RPC_SOCKET_SUFFIX = join("pymp-XXXXXXXX", "listener-XXXXXXXX");
const RUNNER_HOME = "/home/runner";
const LONGEST_HOME_WE_FIT = 19;
const FIRST_VERSION_NAME_LENGTH = 80;
const LONGER_THAN_ANY_TEST_FILE_NAME = 200;

function longestSocketPath(home: string, nameLength: number): number {
  const testPath = `/repo/packages/control/src/${"n".repeat(nameLength)}.test.ts`;
  return join(home, PRIVATE_TMP_ROOT, "run-XXXXXX", fileDirectoryName(testPath), RPC_SOCKET_SUFFIX).length;
}

test("a file's directory is short enough that a socket an ansible child binds under it fits the 107-byte path limit, on the runner and on a longer home", () => {
  assert.ok(longestSocketPath(RUNNER_HOME, LONGER_THAN_ANY_TEST_FILE_NAME) <= SOCKET_PATH_LIMIT, "the longest test file name, on the runner");
  assert.ok(longestSocketPath("/home/".padEnd(LONGEST_HOME_WE_FIT, "h"), LONGER_THAN_ANY_TEST_FILE_NAME) <= SOCKET_PATH_LIMIT, `a home of ${LONGEST_HOME_WE_FIT} characters`);
  const first = join(RUNNER_HOME, PRIVATE_TMP_ROOT, "run-XXXXXX", `file-xxxxxxxx-${"n".repeat(FIRST_VERSION_NAME_LENGTH)}`, RPC_SOCKET_SUFFIX).length;
  assert.ok(first > SOCKET_PATH_LIMIT, `the control: the first version's name was ${first} bytes, over the limit`);
  assert.match(fileDirectoryName("/repo/a/layer-control-lab.test.ts"), /^file-[0-9a-f]{8}-layer-contro$/, "still carries a hint of the file, after the hash that makes it unique");
});

test("reportLeftovers names the file that left an entry, and says nothing for the one that cleaned up", () => {
  const run = tempDir("private-tmp-leftovers-");
  const root = "/repo";
  const [leaky, clean] = [`${root}/a/leaky.test.ts`, `${root}/a/clean.test.ts`];
  const written: string[] = [];
  const [leakyDir, cleanDir] = [leaky, clean].map((testPath) => adoptFileDirectory({ env: { [RUN_ENV]: run }, testPath }) ?? "");
  assert.deepEqual(reportLeftovers({ dir: cleanDir, testPath: clean, root, write: (text) => written.push(text) }), [], "the control: a file that left nothing");
  assert.deepEqual(written, []);
  writeFileSync(join(leakyDir, "left-behind"), "x");
  assert.deepEqual(reportLeftovers({ dir: leakyDir, testPath: leaky, root, write: (text) => written.push(text) }), ["left-behind"]);
  assert.equal(written.length, 1);
  assert.match(written[0] ?? "", /^private-tmp: a\/leaky\.test\.ts left 1 entry in its TMPDIR \(left-behind\)/);
  for (const cache of ["tsx-1000", "v8-compile-cache-1000", "node-compile-cache", "jiti"]) mkdirSync(join(cleanDir, cache));
  assert.deepEqual(reportLeftovers({ dir: cleanDir, testPath: clean, root, write: (text) => written.push(text) }), [], "the runtime's own caches are not a leak");
  mkdirSync(join(cleanDir, "tsx-1000-x"));
  assert.deepEqual(reportLeftovers({ dir: cleanDir, testPath: clean, root, write: () => {} }), ["tsx-1000-x"], "and a look-alike name still is");
  assert.match(formatLeftovers({ label: "f", entries: ["a", "b", "c", "d", "e", "f", "g"] }), /left 7 entries .*\(a, b, c, d, e, and 2 more\)/);
});

/** A throwaway rstest project whose HOME is its own, run with the helper wired exactly as the repository's config wires it. */
function throwawayProject(fixtures: Record<string, string>) {
  const project = tempDir("private-tmp-project-");
  const home = join(project, "home");
  mkdirSync(home);
  const recorded = join(project, "recorded-tmpdir");
  const configText = [
    `import { fileURLToPath } from "node:url";`,
    `import { withPrivateTmp } from ${JSON.stringify(pathToFileURL(HELPER).href)};`,
    `const root = fileURLToPath(new URL(".", import.meta.url));`,
    `export default withPrivateTmp({ root, include: ["*.test.mjs"], globals: true, reporters: ["default"] });`,
  ].join("\n");
  writeFileSync(join(project, "cfg.mjs"), configText);
  for (const [name, body] of Object.entries(fixtures)) {
    writeFileSync(join(project, name), `import { mkdirSync, rmSync, writeFileSync } from "node:fs";\nimport { tmpdir } from "node:os";\nimport { join } from "node:path";\n${body}`);
  }
  /** `givenTmpdir` is the child's TMPDIR: unset by default, which is the case a run is private for. */
  const run = (givenTmpdir?: string) => {
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home, RECORDED: recorded };
    delete env.TMPDIR;
    if (givenTmpdir !== undefined) env.TMPDIR = givenTmpdir;
    const result = spawnSync(RSTEST, ["run", "--config", join(project, "cfg.mjs")], { cwd: project, env, encoding: "utf8" });
    return { status: result.status, report: `${result.stdout}${result.stderr}`, privateRoot: join(home, PRIVATE_TMP_ROOT), recorded };
  };
  return { run, project };
}

const LEAKY = `test("leaks", () => { writeFileSync(process.env.RECORDED, process.env.TMPDIR); mkdirSync(join(tmpdir(), "leaked-by-fixture")); });`;
const CLEAN = `test("cleans", () => { const dir = join(tmpdir(), "made-and-removed"); mkdirSync(dir); rmSync(dir, { recursive: true }); });`;
const FAILING = `test("fails", () => { mkdirSync(join(tmpdir(), "left-by-a-failing-file")); throw new Error("this file fails on purpose"); });`;

function runDirectories(privateRoot: string) {
  return existsSync(privateRoot) ? readdirSync(privateRoot).filter((name) => name.startsWith("run-")) : [];
}

test("a run points TMPDIR into ~/.cache/a11ign/tmp/run-<id> for its first test file, names the file that left a directory, and removes the run's directory", () => {
  const { run } = throwawayProject({ "leaky.test.mjs": LEAKY, "clean.test.mjs": CLEAN });
  const { status, report, privateRoot, recorded } = run();
  assert.equal(status, 0, report);
  // the name part is cut at 12 characters (the socket path budget above), so `leaky.test.mjs` is `leaky.test.m` in the directory and whole in the report
  assert.match(readFileSync(recorded, "utf8"), new RegExp(`^${privateRoot}/run-[^/]+/file-[0-9a-f]{8}-leaky\\.test\\.m$`.replaceAll("/", "\\/")));
  assert.match(report, /private-tmp: leaky\.test\.mjs left 1 entry in its TMPDIR \(leaked-by-fixture\)/);
  assert.doesNotMatch(report, /private-tmp: clean\.test\.mjs/, "the control: the file that removed what it made is not named");
  assert.deepEqual(runDirectories(privateRoot), [], "the run's directory is gone, the leaked entry with it");
});

test("a run with no leaking file reports none, so the report above is not printed unconditionally", () => {
  const { run } = throwawayProject({ "clean.test.mjs": CLEAN });
  const { status, report, privateRoot } = run();
  assert.equal(status, 0, report);
  assert.doesNotMatch(report, /private-tmp:/);
  assert.deepEqual(runDirectories(privateRoot), []);
});

test("a FAILED run removes its directory too, and still names the leaking file", () => {
  const { run } = throwawayProject({ "failing.test.mjs": FAILING, "clean.test.mjs": CLEAN });
  const { status, report, privateRoot } = run();
  assert.notEqual(status, 0, "the control: this run failed, so removal after a failure is what is read");
  assert.match(report, /private-tmp: failing\.test\.mjs left 1 entry in its TMPDIR \(left-by-a-failing-file\)/);
  assert.deepEqual(runDirectories(privateRoot), []);
});

test("a TMPDIR the caller set is the caller's: no run directory is made, nothing is reported, and what the run leaves lands where the caller said", () => {
  const { run, project } = throwawayProject({ "leaky.test.mjs": LEAKY });
  const given = join(project, "given-tmpdir");
  mkdirSync(given);
  const { status, report, privateRoot, recorded } = run(given);
  assert.equal(status, 0, report);
  assert.equal(readFileSync(recorded, "utf8"), given, "the file ran with the TMPDIR it was given, not a subdirectory of a private one");
  assert.deepEqual(readdirSync(given), ["leaked-by-fixture"], "so the caller's own reading of its directory sees the leak");
  assert.deepEqual(runDirectories(privateRoot), []);
  assert.doesNotMatch(report, /private-tmp:/);
});
