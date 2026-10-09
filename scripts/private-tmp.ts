// @ts-check
/**
 * A PRIVATE `TMPDIR` FOR A RUN, REMOVED WHEN THE RUN ENDS (incident #3846, the chairman's 16:55Z correction, 1; #3855).
 *
 * `/tmp` held about 121,425 top-level entries, test temp directories nothing removes, on a root disk nothing clears, and the kernel's `rmdir` lockup
 * was the walk of that one directory. This gives each run `~/.cache/a11ign/tmp/run-<id>`, points `TMPDIR` at it before the first test file, and removes
 * it when the run ends, pass or fail. `os.tmpdir()` reads `TMPDIR` on every call, so every `mkdtempSync(join(tmpdir(), ...))` in the suite and every child a
 * test spawns lands inside it without a line changing in them.
 *
 * THE INTERFACE `scripts/verify.ts` CALLS (#3847 wrote `privateRunTmp` and `removeInSmallCalls` there first, with this signature, so it can import them
 * from here and delete its copies): `privateRunTmp({ home? }) -> dir`, which makes the directory, sets `process.env.TMPDIR` and removes it on `exit`; and
 * `removeInSmallCalls(dir)`, which removes any directory in small calls and refuses an empty or relative name.
 *
 * THE RSTEST WIRING (`withPrivateTmp`) HAS TWO PARTS, because "a test file left an entry" needs the file's name, which one shared directory cannot give:
 * - `globalSetup` (`setup` and `teardown` here) makes the run directory before any test file and removes it after the last, a failed run included. rstest
 *   runs it in its own process and hands the environment it changed to every test worker, so `TMPDIR` and `A11Y_PRIVATE_TMP_RUN` reach them;
 * - `setupFiles` is a VIRTUAL module (a `data:` URL, which rstest materialises) that calls `adoptAndWatch`, once per test file: the file gets its OWN
 *   subdirectory `file-<hash>-<name>` of the run's, that worker's `TMPDIR` points at it, and an `afterAll` names the file on stderr if anything is left in
 *   it. It reports and never fails the run. That is written by the worker as the file ends, so it prints BEFORE the summary: a report written at the run's end
 *   would land after the VERDICT line, which `test-verdict-line.test.ts` pins as the last line of an agent's report (#2541).
 *   A file that throws while it is being COLLECTED never reaches its `afterAll` and is not named; its entries are still removed with the run.
 *
 * WHY A VIRTUAL SETUP FILE (measured on @rstest/core 0.12.3): rstest sorts an entry by the FIRST list it is in, setup files before global setup, so this
 * module cannot be both, and the row's Region is three files. And why not a reporter: `test-verdict-line.test.ts` reads the config's `reporters` and pins the
 * verdict reporter as the last of exactly three, so a fourth is a red test of the toolchain's contract.
 *
 * A TMPDIR THE CALLER SET IS THE CALLER'S. `setup` does nothing when `TMPDIR` is already set to something other than the shared `/tmp`: `verify` hands its
 * run's directory down so one `rm` covers both, and `test-tmp-leak.test.ts` starts a run with a `TMPDIR` of its own to read what the run left in it. It
 * also clears the enclosing run's `A11Y_PRIVATE_TMP_RUN`, which such a child inherits and which is not its own.
 *
 * REMOVAL IS IN SMALL CALLS: one `unlink` or `rmdir` per entry, depth first, never one `rm -r` of a large tree, because the walk of a large tree is what locked
 * the kernel. What it cannot remove it records and throws at the end, after trying the rest.
 */
import { accessSync, chmodSync, constants, lstatSync, mkdirSync, mkdtempSync, opendirSync, rmdirSync, statSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** Where a run's private temp directories are made, under the user's cache as the chairman's correction names. */
export const PRIVATE_TMP_ROOT = ".cache/a11ign/tmp";

const RUN_DIR_PREFIX = "run-";
const FILE_DIR_PREFIX = "file-";
/** The run's directory, exported to every worker. Unset outside a run that `setup` began, which is what keeps the per-file step inert elsewhere. */
const RUN_ENV = "A11Y_PRIVATE_TMP_RUN";
/** The test path whose subdirectory this process's `TMPDIR` already is, so a second import for the same file changes nothing. */
const FILE_ENV = "A11Y_PRIVATE_TMP_FILE";
/** The directories a caller means by "no private choice": setting `TMPDIR` to one of these is the same as leaving it unset. */
const SHARED_TMP = ["/tmp", "/var/tmp"];
/** What a directory that cannot be made or written reports: a read-only filesystem, a missing permission, or a path under a file. */
const NOT_WRITABLE = ["EACCES", "EROFS", "EPERM", "ENOTDIR"];
const OWNER_RWX = 0o700;
/**
 * A file's directory is the `TMPDIR` of everything its tests spawn, and a unix socket path is capped at 107 bytes (measured: `bind` succeeds at 107 and fails with
 * "AF_UNIX path too long" at 108). ansible-core's local RPC server binds `<TMPDIR>/pymp-XXXXXXXX/listener-XXXXXXXX`, 32 more, so `TMPDIR` has 75 and the first
 * version's name (up to 80 characters of the file's basename) put four ansible-driving test files at 112-117 on the CI runner, `/home/runner/.cache/a11ign/tmp/run-XXXXXX/`
 * being 41 of them: "Local RPC server did not start". The name is a hint for whoever finds a directory left after a SIGKILL, the hash is what makes it unique, so the
 * hint is short: `file-` + 8 + `-` + 12 is 26, which fits a home of up to 19 characters (the runner's is 12).
 */
const NAME_PART_LIMIT = 12;
const PATH_HASH_LENGTH = 8;
const ENTRIES_NAMED_PER_FILE = 5;
/**
 * Caches the RUNTIME writes into `TMPDIR` for any process, which no test made and none can remove: `tsx-<uid>` (tsx's transform cache), `v8-compile-cache-<uid>`, `jiti`
 * (measured in this repository's first full run: 12, 6 and 3 test files "left" them). They go with the run like everything else, but naming the test that merely
 * spawned a child would bury the fixtures that really leak. The same list as `a11ign/agent-org`'s `private-tmp.ts` (its #312) plus `jiti`; exact names only,
 * so `tsx-1000-x` is still a leak.
 */
const RUNTIME_CACHE = /^(?:(?:tsx|v8-compile-cache)-\d+|node-compile-cache|jiti)$/;
const SIGNALS = /** @type {const} */ (["SIGINT", "SIGTERM", "SIGHUP"]);
const SELF = fileURLToPath(import.meta.url);

/**
 * Removes `dir` and everything under it one entry per call. Refuses an empty or relative name, the `${D:?}` rule: a relative name would resolve against
 * the working directory, which here is the repository.
 * @param {string | undefined} dir
 */
export function removeInSmallCalls(dir: string | undefined) {
  if (!dir) throw new Error("removeInSmallCalls: refusing an empty directory name");
  if (!isAbsolute(dir)) throw new Error(`removeInSmallCalls: refusing a relative directory name (${dir})`);
  /** @type {string[]} */
  const failures: string[] = [];
  removeTree(dir, failures);
  if (failures.length > 0) {
    const shown = failures.slice(0, ENTRIES_NAMED_PER_FILE).join("; ");
    throw new Error(`removeInSmallCalls: ${failures.length} entries under ${dir} would not go: ${shown}`);
  }
}

/**
 * @param {string} path
 * @param {string[]} failures the entries that would not go, each with why
 */
function removeTree(path: string, failures: string[]) {
  try {
    const stat = lstatSync(path);
    if (!stat.isDirectory()) return unlinkSync(path);
    if ((stat.mode & OWNER_RWX) !== OWNER_RWX) chmodSync(path, OWNER_RWX);
    const entries = opendirSync(path);
    for (let entry = entries.readSync(); entry !== null; entry = entries.readSync()) removeTree(join(path, entry.name), failures);
    entries.closeSync();
    rmdirSync(path);
  } catch (error) {
    const code = /** @type {NodeJS.ErrnoException} */ (error).code;
    if (code !== "ENOENT") failures.push(`${path}: ${code ?? String(error)}`);
  }
}

/**
 * The one place a run's directories may be removed from: `run-<id>` directly under the root the run was made in (`privateRunRoot`'s answer), never `/tmp` itself
 * or a path a caller typed. A wider parent (a caller's `TMPDIR`) widens where a run is made, never what is removed.
 */
export function requirePrivateRunDir(/** @type {string | undefined} */ dir: string | undefined, /** @type {string} */ root: string) {
  if (!dir) throw new Error("private-tmp: no run directory to remove, so nothing is removed");
  const insideRoot = isAbsolute(dir) && relative(root, dir) === basename(dir);
  if (!insideRoot || !basename(dir).startsWith(RUN_DIR_PREFIX)) {
    throw new Error(`private-tmp: refusing to remove ${dir}, which is not a ${RUN_DIR_PREFIX}<id> directory under ${root}`);
  }
  return dir;
}

/** @type {Set<string>} */
const removeOnExit: Set<string> = new Set();
let exitHandlersInstalled = false;

function removeEverythingOwned() {
  for (const dir of [...removeOnExit]) {
    removeOnExit.delete(dir);
    removeInSmallCalls(dir);
  }
}

/** The backstop for a run the runner's own teardown did not reach (an uncaught exit, a signal). A SIGKILL runs nothing; the host's age rule on the cache is that backstop. */
function installExitHandlers() {
  if (exitHandlersInstalled) return;
  exitHandlersInstalled = true;
  process.on("exit", removeEverythingOwned);
  for (const signal of SIGNALS) {
    process.once(signal, () => {
      removeEverythingOwned();
      process.kill(process.pid, signal);
    });
  }
}

/**
 * The directory a run's `run-<id>` is made in: `~/.cache/a11ign/tmp` when that can be made and written, else the `TMPDIR` the caller set. A sandbox that can write
 * only `/tmp` (the reviewer's: `workspace-write` with `writable_roots = ["/tmp"]`) has a read-only home, and its caller's `TMPDIR=/tmp/<dir>` is the only place
 * left (#3932). With neither it refuses ONCE, naming both, instead of a bare `EROFS` from inside the runner. Only access errors fall through to the caller's
 * directory: any other failure of the home is a defect in it and is rethrown. A caller's `TMPDIR` is not made for them: it must already be a writable directory.
 * @param {{ home?: string, env?: NodeJS.ProcessEnv }} [where]
 * @returns {string}
 */
export function privateRunRoot({ home = homedir(), env = process.env }: { home?: string; env?: NodeJS.ProcessEnv; } = {}): string {
  const preferred = join(home, PRIVATE_TMP_ROOT);
  try {
    mkdirSync(preferred, { recursive: true });
    accessSync(preferred, constants.W_OK);
    return preferred;
  } catch (cause) {
    const code = /** @type {NodeJS.ErrnoException} */ (cause).code;
    if (!NOT_WRITABLE.includes(code ?? "")) throw cause;
    return callersWritableTmpdir({ preferred, env, cause });
  }
}

/** @param {{ preferred: string, env: NodeJS.ProcessEnv, cause: unknown }} refused */
function callersWritableTmpdir({ preferred, env, cause }: { preferred: string; env: NodeJS.ProcessEnv; cause: unknown; }) {
  const callers = env.TMPDIR;
  const refusal = `private-tmp: no place to make a run directory: ${preferred} cannot be made or written, and TMPDIR is ${isShared(callers) ? `${callers ? `the shared ${callers}` : "unset"}, which is not a private choice` : `${callers}, which is not a writable directory either`}. Set TMPDIR to a writable directory of your own, e.g. TMPDIR=/tmp/<dir>`;
  if (isShared(callers)) throw new Error(refusal, { cause });
  const root = /** @type {string} */ (callers);
  try {
    // A writable FILE passes `W_OK` and fails later in `mkdtemp` with ENOTDIR, so the caller's path must be a directory as well.
    if (!statSync(root).isDirectory()) throw new Error(`${root} is not a directory`);
    accessSync(root, constants.W_OK);
  } catch {
    throw new Error(refusal, { cause });
  }
  return root;
}

/**
 * Makes `run-<id>` under `privateRunRoot` (`~/.cache/a11ign/tmp`, or the caller's `TMPDIR` when the home is not writable), points this process's `TMPDIR` at it,
 * and removes it when the process exits.
 * @param {{ home?: string }} [where]
 * @returns {string} the run's directory
 */
export function privateRunTmp({ home = homedir() }: { home?: string; } = {}): string {
  return makeRun({ home }).dir;
}

/** `privateRunTmp`, also saying which root the run was made in, so `endRun` checks its removal against the root that was USED rather than one read back off the directory. */
function makeRun({ home = homedir() } = {}) {
  const root = privateRunRoot({ home });
  const dir = mkdtempSync(join(root, RUN_DIR_PREFIX));
  process.env.TMPDIR = dir;
  removeOnExit.add(requirePrivateRunDir(dir, root));
  installExitHandlers();
  return { dir, root };
}

/** @param {string} testPath */
export function fileDirectoryName(testPath: string) {
  const hash = createHash("sha1").update(testPath).digest("hex").slice(0, PATH_HASH_LENGTH);
  return `${FILE_DIR_PREFIX}${hash}-${basename(testPath).replaceAll(/[^\w.-]/g, "_").slice(0, NAME_PART_LIMIT)}`;
}

/**
 * Per-file step: this worker's `TMPDIR` becomes the file's own subdirectory of the run's. Inert unless a run is open (`A11Y_PRIVATE_TMP_RUN` set) and the
 * runner has a test path to give; idempotent for one test path.
 * @param {{ env?: NodeJS.ProcessEnv, testPath?: string }} [reading] injectable so the test drives it without a runner
 * @returns {string | undefined} the file's directory, or undefined when nothing was adopted
 */
export function adoptFileDirectory({ env = process.env, testPath = currentTestPath() }: { env?: NodeJS.ProcessEnv; testPath?: string; } = {}): string | undefined {
  const run = env[RUN_ENV];
  if (!run || !testPath || env[FILE_ENV] === testPath) return undefined;
  const dir = join(run, fileDirectoryName(testPath));
  mkdirSync(dir, { recursive: true });
  env.TMPDIR = dir;
  env[FILE_ENV] = testPath;
  return dir;
}

/** The virtual setup file's one call: adopt the file's directory, and name the file on stderr if anything is left in it when its tests are done. */
export function adoptAndWatch() {
  const testPath = currentTestPath();
  const dir = adoptFileDirectory({ testPath });
  const afterAll = /** @type {any} */ (globalThis).afterAll;
  if (dir && testPath && typeof afterAll === "function") afterAll(() => reportLeftovers({ dir, testPath }));
}

/** @returns {string | undefined} the test file this worker is running, or undefined outside a runner */
function currentTestPath(): string | undefined {
  const runner = /** @type {any} */ (globalThis).expect;
  return typeof runner?.getState === "function" ? runner.getState().testPath : undefined;
}

/**
 * @param {{ dir: string, testPath: string, root?: string, write?: (text: string) => unknown }} file
 * @returns {string[]} what the file left that a test could have removed, for the test to read
 */
export function reportLeftovers({ dir, testPath, root = process.cwd(), write = (text) => process.stderr.write(text) }: { dir: string; testPath: string; root?: string; write?: (text: string) => unknown; }): string[] {
  const entries = listNames(dir).filter((name) => !RUNTIME_CACHE.test(name));
  if (entries.length > 0) write(formatLeftovers({ label: relative(root, testPath), entries }));
  return entries;
}

/** @param {string} dir */
function listNames(dir: string) {
  /** @type {string[]} */
  const names: string[] = [];
  const handle = opendirSync(dir);
  for (let entry = handle.readSync(); entry !== null; entry = handle.readSync()) names.push(entry.name);
  handle.closeSync();
  return names.sort();
}

/** @param {{ label: string, entries: string[] }} leftover */
export function formatLeftovers({ label, entries }: { label: string; entries: string[]; }) {
  const shown = entries.slice(0, ENTRIES_NAMED_PER_FILE).join(", ");
  const more = entries.length > ENTRIES_NAMED_PER_FILE ? `, and ${entries.length - ENTRIES_NAMED_PER_FILE} more` : "";
  return `private-tmp: ${label} left ${entries.length} entr${entries.length === 1 ? "y" : "ies"} in its TMPDIR (${shown}${more}); removed with the run, clean them up in the test\n`;
}

/** @type {{ dir: string, root: string } | null} the run this process began and has not ended */
let begun: { dir: string; root: string; } | null = null;

/** @param {string | undefined} tmpdir */
function isShared(tmpdir: string | undefined) {
  return !tmpdir || SHARED_TMP.includes(tmpdir.replace(/\/+$/, "") || "/");
}

/** Before the first test file. A run that begins while this process's last is still open closes it first, so none is orphaned. */
export function beginRun({ home = homedir() } = {}) {
  if (begun) endRun();
  delete process.env[FILE_ENV];
  const { dir, root } = makeRun({ home });
  begun = { dir, root };
  process.env[RUN_ENV] = dir;
}

/** After the run. Removes the directory `beginRun` made and nothing else, refusing when there is none. */
export function endRun() {
  const run = begun;
  begun = null;
  delete process.env[RUN_ENV];
  if (!run) throw new Error("private-tmp: no run directory was begun by this process, so nothing is removed");
  removeOnExit.delete(run.dir);
  removeInSmallCalls(requirePrivateRunDir(run.dir, run.root));
}

/** globalSetup, before the first test file. */
export function setup() {
  delete process.env[RUN_ENV];
  delete process.env[FILE_ENV];
  if (isShared(process.env.TMPDIR)) beginRun();
}

/** globalSetup, after the last test file: removes the run's directory. A run `setup` left to its caller has nothing to do. */
export function teardown() {
  if (begun) endRun();
}

/** The source of the virtual setup file: it imports this module by path and calls the per-file step, so importing the module stays free of side effects. */
const VIRTUAL_SETUP = `import { adoptAndWatch } from ${JSON.stringify(SELF)};\nadoptAndWatch();\n`;

/**
 * What the repository's config adds to the toolchain's: this module as `globalSetup`, and the virtual per-file setup. Keys the toolchain already sets are
 * kept; a config of its own that names `globalSetup` or `setupFiles` is not merged, it is refused, because dropping one silently is how a run stops being private.
 * @template {Record<string, any>} T
 * @param {T} config
 * @returns {T & { globalSetup: string[], setupFiles: string[] }}
 */
export function withPrivateTmp<T>(config: T): T & { globalSetup: string[]; setupFiles: string[]; } {
  for (const key of ["globalSetup", "setupFiles"]) {
    if (config[key] !== undefined) throw new Error(`withPrivateTmp: the config already sets ${key}; merge it by hand so neither is dropped`);
  }
  const virtualSetup = `data:text/javascript;base64,${Buffer.from(VIRTUAL_SETUP).toString("base64")}`;
  return { ...config, globalSetup: [SELF], setupFiles: [virtualSetup] };
}
