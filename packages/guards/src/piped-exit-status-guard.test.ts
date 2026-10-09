/**
 * `piped-exit-status-guard.mjs` (#180, #375, #535, #1642): `cmd | head; echo $?` reports `head`'s status, not `cmd`'s.
 *
 * What is pinned, and why each matters:
 *   1. THE HAZARD NEEDS BOTH HALVES. A pipeline ending in head/tail/grep is refused only when a `$?` is read in the same text; a pipe with
 *      nothing reading status, a mid-pipeline tool, and a `pipefail` mention are all ALLOWED (a guard that fires on legitimate use gets disabled).
 *   2. THE FILE-AWARE CHECK IS SCOPED PER FUNCTION (#375): a piped statement in one function and an unrelated `$?` in another is not a hazard,
 *      while the same two statements in ONE function are.
 *   3. BATCH MODE (#1642) answers one `ALLOW:`/`REFUSE:` line per input line, in order, so the caller's Nth verdict is its Nth line.
 *   4. THE CLI'S THREE EXIT CODES (#535): 0 allow, 1 hazard, 2 error. The caller discriminates on output text, and an exit 2 must never be
 *      confused with a hazard's 1. The CLI is run as a child process because its entry point exits.
 *
 * THE POSITIVE CONTROLS: each ALLOW case sits next to a one-token variant that is REFUSED (drop the `pipefail`, add the `$?`, end the pipe in grep).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { checkPipedExitStatus, checkPipedExitStatusInText, judgeLines, splitIntoBlocks } from "./piped-exit-status-guard.ts";

const SCRIPT = join(resolve(dirname(fileURLToPath(import.meta.url))), "piped-exit-status-guard.mjs");
const EXIT = { ALLOW: 0, HAZARD: 1, ERROR: 2 };

test("a pipe into head/tail/grep followed by a $? read is a hazard, naming the statement", () => {
  const verdict = checkPipedExitStatus("agent-org merge-guard 148 | head -4; echo EXIT=$?");
  assert.equal(verdict.hazard, true);
  assert.match(verdict.reason, /"agent-org merge-guard 148 \| head -4" pipes into a status tool/);
  for (const tool of ["head", "tail", "grep"]) {
    assert.equal(checkPipedExitStatus(`make | ${tool} -n 1\nexit $?`).hazard, true, tool);
  }
});

test("the same pipe is allowed when nothing reads $?, and the reason says why", () => {
  const verdict = checkPipedExitStatus("cat README.md | head -5");
  assert.deepEqual(verdict, { hazard: false, reason: 'pipes into a status tool ("cat README.md | head -5") but nothing reads $?' });
  assert.equal(checkPipedExitStatus("cat README.md | head -5; echo $?").hazard, true);
});

test("a tool in the middle of a pipeline does not own the status, and no pipe at all is allowed", () => {
  assert.deepEqual(checkPipedExitStatus("cmd | head -3 | sort; echo $?"), { hazard: false, reason: "no pipeline ends in head/tail/grep" });
  assert.equal(checkPipedExitStatus("cmd | head -3 | grep x; echo $?").hazard, true);
  assert.equal(checkPipedExitStatus("cmd; echo $?").reason, "no pipeline ends in head/tail/grep");
  assert.equal(checkPipedExitStatus("").hazard, false);
});

test("statements are split on ; && || and newlines", () => {
  for (const joiner of [";", "&&", "||", "\n", "\r\n"]) {
    assert.equal(checkPipedExitStatus(`build | tail -2 ${joiner} echo $?`).hazard, true, JSON.stringify(joiner));
  }
});

test("a pipefail mention anywhere in the text is taken as handled, but only as a whole word", () => {
  const handled = checkPipedExitStatus("set -o pipefail; cmd | head -1; echo $?");
  assert.deepEqual(handled, { hazard: false, reason: "pipefail is mentioned in the same text -- assumed handled" });
  assert.equal(checkPipedExitStatus("cmd | head -1; echo $?  # nopipefailing").hazard, true);
});

test("splitIntoBlocks cuts before each function definition and never inside one", () => {
  const text = ["set -e", "a() {", "  x | head", "}", "function b() {", "  y", "}", "c() { # note", "  z", "}"].join("\n");
  assert.deepEqual(splitIntoBlocks(text), [
    "set -e",
    "a() {\n  x | head\n}",
    "function b() {\n  y\n}",
    "c() { # note\n  z\n}",
  ]);
});

test("splitIntoBlocks does not cut at the paren-less `function name {` form, though the source's comment lists it", () => {
  // Pinned as observed: FUNCTION_START_RE requires `()`. A missed boundary only widens the window back toward the whole-text behaviour.
  const text = "a() {\n  :\n}\nfunction b {\n  :\n}";
  assert.deepEqual(splitIntoBlocks(text), [text]);
});

test("splitIntoBlocks: empty text and text with no function are one block, a function on the first line does not open an empty block", () => {
  assert.deepEqual(splitIntoBlocks(""), [""]);
  assert.deepEqual(splitIntoBlocks("echo a\necho b"), ["echo a\necho b"]);
  assert.deepEqual(splitIntoBlocks("f() {\n  :\n}\ng() {\n  :\n}"), ["f() {\n  :\n}", "g() {\n  :\n}"]);
});

test("a piped statement and an unrelated $? read in DIFFERENT functions is not a hazard, in the SAME function it is (#375)", () => {
  const separate = ["note() {", "  git diff | grep -q x", "}", "run() {", "  cmd > out", "  echo $?", "}"].join("\n");
  const same = ["note() {", "  git diff | grep -q x", "  echo $?", "}", "run() {", "  cmd", "}"].join("\n");
  assert.equal(checkPipedExitStatus(separate).hazard, true, "the whole-text check bleeds across functions");
  assert.deepEqual(checkPipedExitStatusInText(separate), {
    hazard: false, reason: "no block pipes into a status tool with a $? read in the same function" });
  assert.equal(checkPipedExitStatusInText(same).hazard, true);
});

test("top-level code before the first function is its own block", () => {
  const text = ["cmd | tail -1", "echo $?", "later() {", "  :", "}"].join("\n");
  assert.equal(checkPipedExitStatusInText(text).hazard, true);
  assert.match(checkPipedExitStatusInText(text).reason, /"cmd \| tail -1"/);
});

test("judgeLines answers one verdict per line in order, treating only the final newline as a terminator", () => {
  const { verdicts, hazard } = judgeLines("fi\nmake | head; echo $?\n\ncat x | grep y\n");
  assert.deepEqual(verdicts.map((v) => v.split(":")[0]), ["ALLOW", "REFUSE", "ALLOW", "ALLOW"]);
  assert.equal(hazard, true);
  assert.match(String(verdicts.at(-1)), /^ALLOW: pipes into a status tool \("cat x \| grep y"\) but nothing reads \$\?$/);
});

test("judgeLines on lines that are all allowed reports no hazard, and an input with no trailing newline keeps its last line", () => {
  const clean = judgeLines("echo a\necho b");
  assert.equal(clean.hazard, false);
  assert.deepEqual(clean.verdicts, ["ALLOW: no pipeline ends in head/tail/grep", "ALLOW: no pipeline ends in head/tail/grep"]);
  assert.deepEqual(judgeLines("\n").verdicts, ["ALLOW: no pipeline ends in head/tail/grep"], "a lone newline terminates one EMPTY line, which keeps its slot");
});

interface Run { status: number | null; stdout: string; stderr: string }

function runCli(args: string[], input?: string): Run {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", input: input ?? "" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test("CLI: a command argument is judged and the exit code follows the verdict", () => {
  const refused = runCli(["make | head -2; echo $?"]);
  assert.equal(refused.status, EXIT.HAZARD);
  assert.match(refused.stdout, /^REFUSE: "make \| head -2" pipes into a status tool/);
  const allowed = runCli(["make | head -2"]);
  assert.equal(allowed.status, EXIT.ALLOW);
  assert.match(allowed.stdout, /^ALLOW: pipes into a status tool .* but nothing reads \$\?\n$/);
});

test("CLI: an argument shaped like a flag is a payload, not an unknown flag (#349)", () => {
  const yamlMarker = runCli(["---"]);
  assert.equal(yamlMarker.status, EXIT.ALLOW);
  assert.match(yamlMarker.stdout, /^ALLOW: no pipeline ends/);
});

test("CLI: a second argument, or an empty command, exits 2 (error), never 1 (hazard)", () => {
  const extra = runCli(["echo", "--flag", "x"]);
  assert.equal(extra.status, EXIT.ERROR);
  assert.match(extra.stderr, /takes no flags; unexpected argument\(s\): --flag, x/);
  const empty = runCli([""]);
  assert.equal(empty.status, EXIT.ERROR);
  assert.match(empty.stderr, /usage: piped-exit-status-guard\.mjs '<shell command string>'/);
});

test("CLI: with no argument it judges stdin line by line (batch), and empty stdin is a usage error", () => {
  const batch = runCli([], "echo ok\nmake | tail -1; echo $?\n");
  assert.equal(batch.status, EXIT.HAZARD);
  assert.deepEqual(batch.stdout.trim().split("\n").map((l) => l.split(":")[0]), ["ALLOW", "REFUSE"]);
  const clean = runCli([], "echo ok\n");
  assert.equal(clean.status, EXIT.ALLOW);
  const none = runCli([], "");
  assert.equal(none.status, EXIT.ERROR);
  assert.match(none.stderr, /\(or lines on stdin\)/);
});

test("CLI: a path to a file is checked whole-file and function-aware", () => {
  const dir = mkdtempSync(join(tmpdir(), "piped-guard-test-"));
  try {
    const scoped = join(dir, "scoped.sh");
    writeFileSync(scoped, "note() {\n  git diff | grep -q x\n}\nrun() {\n  cmd\n  echo $?\n}\n");
    const hazardous = join(dir, "hazard.sh");
    writeFileSync(hazardous, "note() {\n  git diff | grep -q x\n  echo $?\n}\n");
    const allowed = runCli([scoped]);
    assert.equal(allowed.status, EXIT.ALLOW);
    assert.match(allowed.stdout, /no block pipes into a status tool/);
    assert.equal(runCli([hazardous]).status, EXIT.HAZARD);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI: a file that cannot be read exits 2 with GUARD ERROR, not node's default 1", { skip: process.getuid?.() === 0 && "root reads any file" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "piped-guard-test-"));
  try {
    const locked = join(dir, "locked.sh");
    writeFileSync(locked, "echo hi\n", { mode: 0 });
    const result = runCli([locked]);
    assert.equal(result.status, EXIT.ERROR);
    assert.match(result.stderr, /^GUARD ERROR: piped-exit-status-guard\.mjs could not examine its input: /);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
