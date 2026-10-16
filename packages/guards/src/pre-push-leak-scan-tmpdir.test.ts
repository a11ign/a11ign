/**
 * #5578: the pre-push leak scan reported `FAILED` when the caller's `TMPDIR` was long, and the leak scan had not leaked anything. tsx opens an IPC
 * socket at `<TMPDIR>/tsx-<uid>/<pid>.pipe`, a unix socket path is capped near 108 bytes, and a per-session scratchpad alone is over 90 characters:
 * `listen EINVAL`, a runner that never started, reported by the hook as a leak. The fix is `TMPDIR=/tmp` on that one statement, in the hook.
 *
 * THIS TEST RUNS THE HOOK'S OWN STATEMENT, extracted from `scripts/git-hooks/pre-push` by its `run "leak scan"` line and the continuation lines after
 * it, never a copy of it. So an edit that drops the prefix, or moves the scan elsewhere, changes what runs here.
 *
 * Three claims, each over the same long `TMPDIR`:
 *   1. The statement exits 0 under a `TMPDIR` of at least `LONG_TMPDIR_LENGTH` bytes: the scan ran, and no socket error is printed.
 *   2. The statement still exits NON-ZERO when a leak is present, and the failure is the leak, not the socket: the two guard files are swapped for a
 *      fixture that asserts a planted address is absent. The fix did not turn the scan off.
 *   3. THE CONTROL: the same statement with the `env TMPDIR=/tmp` prefix removed reproduces `listen EINVAL` under the long `TMPDIR`, so claims 1
 *      and 2 pass because of the prefix and not because the long path was never a problem here.
 */
import { test } from "@rstest/core";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const HOOK = join(REPO_ROOT, "scripts/git-hooks/pre-push");
const LEAK_PATTERNS_MODULE = join(REPO_ROOT, "packages/guards/src/leak-patterns.ts");
const LEAK_SCAN_LABEL = 'run "leak scan"';
const FIX_PREFIX = "env TMPDIR=/tmp ";
const GUARD_FILES = [
  "packages/guards/src/tracked-source-leak-guard.test.ts",
  "packages/guards/src/tracked-prose-leak-guard.test.ts",
];
/** Longer than the ~108-byte unix socket limit once tsx's `tsx-<uid>/<pid>.pipe` is appended, so the control really trips the bug. */
const LONG_TMPDIR_LENGTH = 120;
/**
 * A planted address the private-LAN pattern in `leak-patterns.ts` matches, so the fixture's assertion has a real leak to refuse. Built from its
 * octets, not written out: the tracked-source scan refuses a LAN literal in any tracked file, and this one is tracked, with EXEMPT pinned empty.
 */
const PLANTED_ADDRESS = ["10", "20", "30", "40"].join(".");
/** The end of a failing run's output, enough to show the assertion that failed without dumping a whole rstest log. */
const OUTPUT_TAIL_CHARS = 2000;

/** The hook's leak-scan statement as the shell reads it: its `run` line and the backslash-continued lines after it. */
function leakScanStatement(hookText: string): string {
  const lines = hookText.split("\n");
  const starts = lines.flatMap((line, index) => (line.trimStart().startsWith(LEAK_SCAN_LABEL) ? [index] : []));
  assert.equal(starts.length, 1, `the hook must carry exactly one ${LEAK_SCAN_LABEL} line, found ${starts.length}`);
  let end = starts[0];
  while (lines[end].endsWith("\\")) end += 1;
  return lines.slice(starts[0], end + 1).join("\n");
}

/** A directory whose path is at least `LONG_TMPDIR_LENGTH` bytes, created for real, so the tsx socket path is built under it. */
function longTmpdir(scratch: string): string {
  const padding = "x".repeat(Math.max(1, LONG_TMPDIR_LENGTH - scratch.length - 1));
  const dir = join(scratch, padding);
  mkdirSync(dir);
  assert.ok(dir.length >= LONG_TMPDIR_LENGTH, `the long TMPDIR must be at least ${LONG_TMPDIR_LENGTH} bytes, got ${dir.length}`);
  return dir;
}

/** Runs one statement in a bash script file, with `run` reduced to its own command, under the caller's `TMPDIR`. */
function runStatement(statement: string, scratch: string, tmpdirValue: string) {
  const script = join(scratch, `leak-scan-${Math.random().toString(36).slice(2)}.sh`);
  writeFileSync(script, `run() { shift; "$@"; }\n${statement}\n`);
  const result = spawnSync("bash", [script], {
    cwd: REPO_ROOT,
    env: { ...process.env, TMPDIR: tmpdirValue },
    encoding: "utf8",
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

const scratch = mkdtempSync(join(tmpdir(), "pre-push-tmpdir-"));
const hookStatement = leakScanStatement(readFileSync(HOOK, "utf8"));
const longTmp = longTmpdir(scratch);

test("the leak scan's statement exits 0 under a long TMPDIR, with no socket error", () => {
  assert.ok(hookStatement.includes(FIX_PREFIX), `the hook's leak-scan statement must set ${FIX_PREFIX.trim()}`);
  const { status, output } = runStatement(hookStatement, scratch, longTmp);
  assert.doesNotMatch(output, /EINVAL/);
  assert.equal(status, 0, output.slice(-OUTPUT_TAIL_CHARS));
});

test("the leak scan's statement still exits non-zero when a leak is present, and the failure is the leak", () => {
  const fixture = join(scratch, "planted-leak.test.ts");
  writeFileSync(fixture, [
    'import { test } from "node:test";',
    'import assert from "node:assert/strict";',
    `import { allLeaksIn } from ${JSON.stringify(LEAK_PATTERNS_MODULE)};`,
    `test("planted leak is refused", () => assert.deepEqual(allLeaksIn("gateway ${PLANTED_ADDRESS}"), []));`,
    "",
  ].join("\n"));
  const swapped = GUARD_FILES.reduce((text, file) => text.split(file).join(fixture), hookStatement);
  assert.notEqual(swapped, hookStatement, "the statement must name the two guard files, or the swap is vacuous");
  const { status, output } = runStatement(swapped, scratch, longTmp);
  assert.doesNotMatch(output, /EINVAL/);
  assert.notEqual(status, 0, "a planted leak must fail the scan");
  assert.match(output, /✖ planted leak is refused/);
  assert.match(output, /private LAN IPv4 address/);
});

test("CONTROL: without the TMPDIR prefix the same statement reproduces listen EINVAL under the long TMPDIR", () => {
  const unfixed = hookStatement.replace(FIX_PREFIX, "");
  assert.equal(unfixed.includes(FIX_PREFIX), false, "the control's statement must run without the prefix");
  const { status, output } = runStatement(unfixed, scratch, longTmp);
  assert.notEqual(status, 0);
  assert.match(output, /listen EINVAL/);
});
