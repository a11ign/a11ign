/**
 * `mutation-check.ts` is a COMMAND, not a library: it exports nothing, so every case here runs it as a child process against a
 * fixture file in a temp directory (never a file of this repository: the tool rewrites the file it is given).
 *
 * What is pinned is the exit-code contract the header names, because callers read the code and not the prose:
 *   0 the guard BITES (clean pass, mutated fail, restored pass)      1 it DID NOT BITE (the mutated file still passes)
 *   2 REFUSED before mutating (already-red test, no-op mutation, bad flags)   3 THE RESTORE FAILED / the restored file fails the test
 * and the two promises behind them: the file is byte-identical afterwards on every path that exits 0, 1 or 2, and the copy-aside
 * directory is removed once the restore is proven (#2520) but LEFT when it is not (it is then the only copy of the original).
 *
 * THE POSITIVE CONTROLS: every refusal case has a sibling that differs by one argument and exits 0, so a refusal is the argument's
 * doing and not a fixture that could never have succeeded. `TMPDIR` is pointed at a per-test directory so "the stash was removed"
 * is a readdir of an otherwise empty directory, and "the stash was left" is the same readdir finding it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SCRIPT = join(REPO_ROOT, "packages/guards/src/mutation-check.ts");
const EXIT = { BITES: 0, DID_NOT_BITE: 1, REFUSED: 2, RESTORE_FAILED: 3 };
const GOOD = "value = good\n";
/** The tool names at most this many failing tests; the fixture reports two more than that. */
const FAILED_NAMED = 5;
const MORE_THAN_NAMED = FAILED_NAMED + 2;

interface Fixture { dir: string; file: string; scratch: string; stashes: () => string[] }

/** A fixture directory holding the file under mutation, plus a separate TMPDIR so leftovers of the tool are countable. */
function withFixture(body: (fx: Fixture) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "mutation-check-test-"));
  const scratch = join(dir, "tmp");
  const file = join(dir, "target.txt");
  try {
    spawnSync("mkdir", [scratch]);
    writeFileSync(file, GOOD);
    body({ dir, file, scratch, stashes: () => readdirSync(scratch).filter((name) => !name.startsWith("tsx-")) });  // tsx keeps its own cache in TMPDIR
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// #4273: the script is TypeScript, and a bare `node` cannot run one (ADR 0043 Decision 8: `node --import tsx`).
const TSX = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;

function runTool(fx: Fixture, args: string[]) {
  const result = spawnSync(process.execPath, ["--import", TSX, SCRIPT, ...args], {
    cwd: fx.dir, encoding: "utf8", env: { ...process.env, TMPDIR: fx.scratch },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const passesWhileGood = (fx: Fixture) => `--test=grep -q good ${fx.file}`;
const breakGood = (fx: Fixture) => `--mutate=perl -pi -e 's/good/bad/' ${fx.file}`;

test("a guard that fails on the mutant exits 0, restores the file byte for byte and removes its copy", () => {
  withFixture((fx) => {
    const r = runTool(fx, [`--file=${fx.file}`, breakGood(fx), passesWhileGood(fx)]);
    assert.equal(r.status, EXIT.BITES, r.stderr);
    assert.match(r.stdout, /clean: {4}test PASSES/);
    assert.match(r.stdout, /mutated: {2}test FAILS, as it must/);
    assert.match(r.stdout, /restored: .* is byte-identical and the test PASSES again/);
    assert.match(r.stdout, /THE GUARD BITES\./);
    assert.equal(readFileSync(fx.file, "utf8"), GOOD);
    assert.deepEqual(fx.stashes(), []);
  });
});

test("a test that still passes on the broken file exits 1, and the file is still restored", () => {
  withFixture((fx) => {
    const r = runTool(fx, [`--file=${fx.file}`, breakGood(fx), "--test=true"]);
    assert.equal(r.status, EXIT.DID_NOT_BITE);
    assert.match(r.stderr, /THE GUARD DID NOT BITE/);
    assert.match(r.stderr, /SUSPECT THE GUARD BEFORE THE CODE/);
    assert.equal(readFileSync(fx.file, "utf8"), GOOD);
  });
});

test("a mutation that changes nothing is refused (exit 2) instead of read as a guard that does not bite", () => {
  withFixture((fx) => {
    const r = runTool(fx, [`--file=${fx.file}`, "--mutate=true", passesWhileGood(fx)]);
    assert.equal(r.status, EXIT.REFUSED);
    assert.match(r.stderr, /the mutation command changed nothing/);
    assert.doesNotMatch(r.stderr, /The mutation command itself failed/);
    assert.equal(readFileSync(fx.file, "utf8"), GOOD);
  });
});

test("a no-op mutation whose command also failed says so, with its output", () => {
  withFixture((fx) => {
    const r = runTool(fx, [`--file=${fx.file}`, "--mutate=echo mangled-quoting >&2; exit 4", passesWhileGood(fx)]);
    assert.equal(r.status, EXIT.REFUSED);
    assert.match(r.stderr, /The mutation command itself failed:\nmangled-quoting/);
  });
});

test("a test that is already red is refused before anything is touched", () => {
  withFixture((fx) => {
    const r = runTool(fx, [`--file=${fx.file}`, breakGood(fx), "--test=echo red-before >&2; exit 1"]);
    assert.equal(r.status, EXIT.REFUSED);
    assert.match(r.stderr, /ALREADY FAILING/);
    assert.match(r.stderr, /red-before/);
    assert.equal(readFileSync(fx.file, "utf8"), GOOD);
    assert.deepEqual(fx.stashes(), []);
  });
});

test("a clean run that ran zero tests (VERDICT REFUSED) is refused, but a VERDICT line of a real run is quoted", () => {
  withFixture((fx) => {
    const empty = runTool(fx, [`--file=${fx.file}`, breakGood(fx), "--test=echo 'VERDICT REFUSED 0 tests ran'"]);
    assert.equal(empty.status, EXIT.REFUSED);
    assert.match(empty.stderr, /RAN NOTHING \(VERDICT REFUSED 0 tests ran\)/);

    const real = runTool(fx, [`--file=${fx.file}`, breakGood(fx),
      `--test=grep -q good ${fx.file} && echo 'VERDICT PASS 7 tests -- full report: /x'`]);
    assert.equal(real.status, EXIT.BITES, real.stderr);
    assert.match(real.stdout, /test PASSES \(VERDICT PASS 7 tests\)\./);
  });
});

test("the mutated failure is reported by its VERDICT line and failing test names when the report has them", () => {
  withFixture((fx) => {
    const report = "printf '### [F01] a.test.ts :: first\\n### [F02] b.test.ts :: second\\nVERDICT FAIL 2 failed -- full report: /x\\n'";
    const test = `--test=if grep -q good ${fx.file}; then echo 'VERDICT PASS'; else ${report}; exit 1; fi`;
    const r = runTool(fx, [`--file=${fx.file}`, breakGood(fx), test]);
    assert.equal(r.status, EXIT.BITES, r.stderr);
    assert.match(r.stdout, /VERDICT FAIL 2 failed\n {2}failed: a\.test\.ts :: first\n {2}failed: b\.test\.ts :: second/);
    assert.doesNotMatch(r.stdout, /First lines of why/);
  });
});

test("a failing test with no verdict is explained by the first six lines of its output only", () => {
  withFixture((fx) => {
    const noisy = "i=1; while [ $i -le 8 ]; do echo line$i; i=$((i+1)); done; exit 1";
    const test = `--test=if grep -q good ${fx.file}; then true; else ${noisy}; fi`;
    const r = runTool(fx, [`--file=${fx.file}`, breakGood(fx), test]);
    assert.equal(r.status, EXIT.BITES, r.stderr);
    assert.match(r.stdout, /First lines of why:\n {2}line1\n {2}line2\n {2}line3\n {2}line4\n {2}line5\n {2}line6\n/);
    assert.doesNotMatch(r.stdout, /line7/);
  });
});

test("failing tests are named at most five at a time", () => {
  withFixture((fx) => {
    const names = Array.from({ length: MORE_THAN_NAMED }, (_, i) => `### [F0${i + 1}] t.test.ts :: case${i + 1}`).join("\\n");
    const test = `--test=if grep -q good ${fx.file}; then true; else printf '${names}\\n'; exit 1; fi`;
    const r = runTool(fx, [`--file=${fx.file}`, breakGood(fx), test]);
    assert.equal(r.status, EXIT.BITES, r.stderr);
    assert.equal(r.stdout.match(/failed: /g)?.length, FAILED_NAMED);
    assert.match(r.stdout, /failed: t\.test\.ts :: case5/);
    assert.doesNotMatch(r.stdout, /case6/);
  });
});

test("missing arguments and a missing file are refused with the usage or the path", () => {
  withFixture((fx) => {
    const bare = runTool(fx, []);
    assert.equal(bare.status, EXIT.REFUSED);
    assert.match(bare.stderr, /this needs --file=<path> --mutate=/);

    const noTest = runTool(fx, [`--file=${fx.file}`, breakGood(fx)]);
    assert.equal(noTest.status, EXIT.REFUSED);

    const missing = runTool(fx, ["--file=nowhere.txt", "--mutate=true", "--test=true"]);
    assert.equal(missing.status, EXIT.REFUSED);
    assert.match(missing.stderr, /REFUSING: nowhere\.txt does not exist\./);
  });
});

test("an unknown flag is refused, naming the flags the command takes", () => {
  withFixture((fx) => {
    const r = runTool(fx, ["--bogus"]);
    assert.equal(r.status, EXIT.REFUSED);
    assert.match(r.stderr, /unknown flag --bogus/);
    assert.match(r.stderr, /--prove-restored/);
  });
});

test("--per-mutant needs --baseline-passed and the reverse, and both together skip the clean run and the re-run", () => {
  withFixture((fx) => {
    const base = [`--file=${fx.file}`, breakGood(fx), passesWhileGood(fx)];
    const alone = runTool(fx, [...base, "--per-mutant"]);
    assert.equal(alone.status, EXIT.REFUSED);
    assert.match(alone.stderr, /--per-mutant skips the clean run/);

    const reverse = runTool(fx, [...base, "--baseline-passed"]);
    assert.equal(reverse.status, EXIT.REFUSED);
    assert.match(reverse.stderr, /--baseline-passed only means something with --per-mutant/);

    const both = runTool(fx, [...base, "--per-mutant", "--baseline-passed"]);
    assert.equal(both.status, EXIT.BITES, both.stderr);
    assert.match(both.stdout, /clean: {4}test assumed to PASS \(--baseline-passed\)/);
    assert.match(both.stdout, /The test was NOT re-run \(--per-mutant\)/);
    assert.equal(readFileSync(fx.file, "utf8"), GOOD);
    assert.deepEqual(fx.stashes(), []);
  });
});

test("--prove-restored runs the test once: exit 0 when it passes, 3 when it fails, refused with batch flags", () => {
  withFixture((fx) => {
    const ok = runTool(fx, [`--file=${fx.file}`, passesWhileGood(fx), "--prove-restored"]);
    assert.equal(ok.status, EXIT.BITES);
    assert.match(ok.stdout, /restored: the test PASSES on .* after the batch\./);

    const red = runTool(fx, [`--file=${fx.file}`, "--test=echo cache-leftover; exit 1", "--prove-restored"]);
    assert.equal(red.status, EXIT.RESTORE_FAILED);
    assert.match(red.stderr, /THE TEST FAILS ON .* AFTER THE BATCH/);
    assert.match(red.stderr, /cache-leftover/);

    const withMutate = runTool(fx, [`--file=${fx.file}`, passesWhileGood(fx), breakGood(fx), "--prove-restored"]);
    assert.equal(withMutate.status, EXIT.REFUSED);
    assert.match(withMutate.stderr, /takes --file and --test only/);

    const noTest = runTool(fx, [`--file=${fx.file}`, "--prove-restored"]);
    assert.equal(noTest.status, EXIT.REFUSED);
    assert.match(noTest.stderr, /--prove-restored needs --file=<path> --test=/);

    const missing = runTool(fx, ["--file=nowhere.txt", passesWhileGood(fx), "--prove-restored"]);
    assert.equal(missing.status, EXIT.REFUSED);
  });
});

test("a restored file that fails the test anyway exits 3 and LEAVES the copy-aside directory", () => {
  withFixture((fx) => {
    // Passes on the clean run (count 0) and the mutated run fails on content; the third run (the re-run) fails on count alone.
    const counter = join(fx.dir, "runs");
    writeFileSync(join(fx.dir, "check.sh"), `echo x >> ${counter}\n[ "$(wc -l < ${counter})" -lt 3 ] && grep -q good ${fx.file}\n`);
    const r = runTool(fx, [`--file=${fx.file}`, breakGood(fx), `--test=sh ${join(fx.dir, "check.sh")}`]);
    assert.equal(r.status, EXIT.RESTORE_FAILED);
    assert.match(r.stderr, /THE FILE IS RESTORED BYTE FOR BYTE AND THE TEST NOW FAILS ANYWAY/);
    assert.equal(readFileSync(fx.file, "utf8"), GOOD);
    assert.equal(fx.stashes().length, 1, "the copy is the only original left, so it stays");
    assert.match(fx.stashes()[0], /^mutate-/);
  });
});

test("a restore that does not reproduce the original bytes exits 3 and says where the copy is", () => {
  withFixture((fx) => {
    // The mutation command also corrupts the copy-aside file, which is what a failed restore looks like from the outside.
    const mutate = `--mutate=perl -pi -e 's/good/bad/' ${fx.file}; perl -pi -e 's/good/evil/' ${fx.scratch}/mutate-*/target.txt`;
    const r = runTool(fx, [`--file=${fx.file}`, mutate, passesWhileGood(fx)]);
    assert.equal(r.status, EXIT.RESTORE_FAILED);
    assert.match(r.stderr, /THE RESTORE FAILED\./);
    assert.match(r.stderr, /has NOT been deleted/);
    assert.equal(fx.stashes().length, 1);
  });
});
