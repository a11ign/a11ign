/**
 * `scripts/coverage-failure-classifier.ts` (#169): says WHICH of three unrelated things made the nightly coverage job fail, because "coverage failed" is not a finding.
 *
 *   INFRA         `npm ci` or the build failed: nothing was measured, so nothing about coverage can be said.
 *   TEST_FAILURE  a test failed: a regression in a test, NOT in coverage, and reporting it as the latter reads #169 backwards.
 *   REGRESSION    a metric is below its threshold: the actual finding.
 *   UNKNOWN       anything else, and it must stay unknown: never silently "fine" and never guessed into one of the others.
 *
 * What is pinned, and why each matters:
 *   1. THE ORDER OF EVIDENCE. `npm ci` outranks the build step, which outranks the log; an unreadable or empty log is UNKNOWN; a threshold miss outranks a test failure
 *      (and says how many tests ALSO failed); a test failure is named when its names can be read.
 *   2. BOTH TEST REPORTERS (#1089). CI prints TAP (`# fail N`, `not ok N - name`), a terminal prints spec (`ℹ fail N`, `✖ name (1.2ms)`). `testFailuresIn` reads both and
 *      returns `null`, not zero, for a log carrying NEITHER summary, because a log it cannot parse and a log with nothing wrong are different facts.
 *   3. THE THRESHOLD WORDING is `scripts/coverage.ts`'s `thresholdMissLines`, the real producer; this test feeds the classifier that producer's own output.
 *   4. THE CLI takes its facts as flags, refuses an unknown one, exits 2 on a missing required one, and treats an unreadable log as UNKNOWN rather than as an error.
 *
 * THE POSITIVE CONTROLS: every UNKNOWN case differs from a classified one by the one line the classifier looks for, and `testFailuresIn`'s null sits beside a TAP and a spec log that parse.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const TSX = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SCRIPT = join(REPO_ROOT, "scripts/coverage-failure-classifier.ts");
const { KIND, testFailuresIn, classifyCoverageFailure, commentBody } = await import("../../../scripts/coverage-failure-classifier.ts");
const { thresholdMissLines } = await import("../../../scripts/coverage.ts");

const TAP_LOG = "TAP version 13\nok 1 - fine\nnot ok 2 - fails on purpose\nnot ok 3 - also fails\n# tests 3\n# fail 2\n";
const SPEC_LOG = "✔ fine (0.2ms)\n✖ fails on purpose (0.36ms)\n✖ no timing\nℹ tests 3\nℹ fail 2\n";
const MISS = "ERROR: Coverage for lines (76.2%) does not meet threshold (78%)";
const ok = { ciOutcome: "success", buildOutcome: "success" };

test("the kinds are the four names", () => {
  assert.deepEqual(KIND, { INFRA: "INFRA", TEST_FAILURE: "TEST_FAILURE", REGRESSION: "REGRESSION", UNKNOWN: "UNKNOWN" });
});

test("testFailuresIn reads the TAP reporter's summary and case lines", () => {
  assert.deepEqual(testFailuresIn(TAP_LOG), { count: 2, names: ["fails on purpose", "also fails"] });
});

test("testFailuresIn reads the spec reporter's summary and case lines, with or without a timing suffix", () => {
  assert.deepEqual(testFailuresIn(SPEC_LOG), { count: 2, names: ["fails on purpose", "no timing"] });
});

test("testFailuresIn is null for a log with neither summary, which is not the same as zero failures", () => {
  assert.equal(testFailuresIn("Error: something else entirely\n"), null);
  assert.equal(testFailuresIn(""), null);
  assert.deepEqual(testFailuresIn("# tests 4\n# fail 0\n"), { count: 0, names: [] });
  assert.deepEqual(testFailuresIn("ℹ fail 0\n"), { count: 0, names: [] });
});

test("testFailuresIn dedupes a name printed twice, drops the `failing tests:` heading, and a summary with no case lines has no names", () => {
  const log = "not ok 1 - same\n✖ failing tests:\n✖ same (1ms)\n# fail 2\n";
  assert.deepEqual(testFailuresIn(log), { count: 2, names: ["same"] });
  assert.deepEqual(testFailuresIn("# fail 3\n"), { count: 3, names: [] });
});

test("`npm ci` failing is INFRA and outranks a failing build and a readable log", () => {
  const verdict = classifyCoverageFailure({ ciOutcome: "failure", buildOutcome: "failure", coverageLog: MISS });
  assert.equal(verdict.kind, KIND.INFRA);
  assert.match(verdict.detail, /^`npm ci` failed before coverage could run\./);
  assert.equal(classifyCoverageFailure({ ...ok, coverageLog: MISS }).kind, KIND.REGRESSION, "positive control: with ci green the same log is a regression");
});

test("the build failing is INFRA, naming the build", () => {
  const verdict = classifyCoverageFailure({ ciOutcome: "success", buildOutcome: "failure", coverageLog: TAP_LOG });
  assert.equal(verdict.kind, KIND.INFRA);
  assert.match(verdict.detail, /^`npm run build` failed before coverage could run\./);
});

test("an unreadable or empty log is UNKNOWN and says it is inconclusive, not a regression", () => {
  for (const coverageLog of [null, ""]) {
    const verdict = classifyCoverageFailure({ ...ok, coverageLog });
    assert.equal(verdict.kind, KIND.UNKNOWN);
    assert.match(verdict.detail, /could not be read -- this is INCONCLUSIVE, not a confirmed regression/);
  }
});

test("a threshold miss is a REGRESSION carrying the metric, the reading and the threshold", () => {
  const verdict = classifyCoverageFailure({ ...ok, coverageLog: `noise\n${MISS}\nmore noise\n` });
  assert.deepEqual(verdict, {
    kind: KIND.REGRESSION,
    thresholdMisses: [{ metric: "lines", actual: 76.2, threshold: 78 }],
    testsFailed: 0,
    detail: "**lines**: 76.2% (threshold 78%)",
  });
});

test("several misses are all reported, and both the old `global threshold` and the current wording are read", () => {
  const log = `${MISS}\nERROR: Coverage for statements (70%) does not meet global threshold (72%)\n`;
  const verdict = classifyCoverageFailure({ ...ok, coverageLog: log });
  assert.deepEqual(verdict.thresholdMisses, [
    { metric: "lines", actual: 76.2, threshold: 78 },
    { metric: "statements", actual: 70, threshold: 72 },
  ]);
  assert.equal(verdict.detail, "**lines**: 76.2% (threshold 78%), **statements**: 70% (threshold 72%)");
});

test("a regression that also had failing tests says how many, and still is a REGRESSION", () => {
  const verdict = classifyCoverageFailure({ ...ok, coverageLog: `${TAP_LOG}${MISS}\n` });
  assert.equal(verdict.kind, KIND.REGRESSION);
  assert.equal(verdict.testsFailed, 2);
  assert.equal(verdict.detail, "**lines**: 76.2% (threshold 78%) — and 2 test(s) also failed");
});

test("the classifier reads the real producer's own threshold-miss line (scripts/coverage.ts)", () => {
  const produced = thresholdMissLines({ lines: { pct: 50, covered: 50, total: 100 }, statements: { pct: 60, covered: 60, total: 100 } }, { lines: 51, statements: 51 });
  assert.deepEqual(produced, ["ERROR: Coverage for lines (50%) does not meet threshold (51%)"]);
  const verdict = classifyCoverageFailure({ ...ok, coverageLog: produced.join("\n") });
  assert.deepEqual(verdict.thresholdMisses, [{ metric: "lines", actual: 50, threshold: 51 }]);
});

test("failing tests with no threshold miss are a TEST_FAILURE naming them, under either reporter", () => {
  for (const log of [TAP_LOG, SPEC_LOG]) {
    const verdict = classifyCoverageFailure({ ...ok, coverageLog: log });
    assert.equal(verdict.kind, KIND.TEST_FAILURE);
    assert.equal(verdict.testsFailed, 2);
    assert.match(verdict.detail, /^2 test\(s\) failed: fails on purpose, (also fails|no timing)\. This is a TEST regression, not a coverage regression/);
  }
});

test("a test failure whose names cannot be read is still reported by count", () => {
  const verdict = classifyCoverageFailure({ ...ok, coverageLog: "# fail 3\n" });
  assert.equal(verdict.kind, KIND.TEST_FAILURE);
  assert.match(verdict.detail, /^3 test\(s\) failed\. This is a TEST regression/);
});

test("a log with neither reporter's summary is UNKNOWN as an unparseable log, not as a run with nothing wrong", () => {
  const verdict = classifyCoverageFailure({ ...ok, coverageLog: "Segmentation fault\n" });
  assert.equal(verdict.kind, KIND.UNKNOWN);
  assert.match(verdict.detail, /carries NEITHER reporter's test summary/);
  assert.match(verdict.detail, /a log this classifier cannot parse, not a run with nothing wrong/);
});

test("a log with a zero-failure summary and no threshold miss is UNKNOWN for a third reason", () => {
  const verdict = classifyCoverageFailure({ ...ok, coverageLog: "# tests 10\n# fail 0\n" });
  assert.equal(verdict.kind, KIND.UNKNOWN);
  assert.match(verdict.detail, /neither a threshold miss nor a test failure was found in its output/);
});

test("commentBody has a distinct headline per kind, then the detail, then the run URL", () => {
  const headlines = new Map<string, string>();
  for (const kind of Object.values(KIND) as string[]) {
    const body = commentBody({ verdict: { kind, detail: `detail for ${kind}` }, runUrl: "https://example.invalid/run/1" });
    assert.ok(body.startsWith("**Nightly coverage "), kind);
    assert.ok(body.endsWith(`\n\ndetail for ${kind}\n\nhttps://example.invalid/run/1`), kind);
    headlines.set(kind, body.split("\n")[0]);
  }
  assert.equal(new Set(headlines.values()).size, Object.keys(KIND).length, "no two kinds share a headline");
  assert.equal(headlines.get(KIND.REGRESSION), "**Nightly coverage REGRESSION**");
  assert.match(headlines.get(KIND.INFRA) ?? "", /INFRASTRUCTURE FAILURE, not a coverage finding/);
  assert.match(headlines.get(KIND.TEST_FAILURE) ?? "", /failed a TEST, not a coverage threshold/);
  assert.match(headlines.get(KIND.UNKNOWN) ?? "", /CANNOT TELL why/);
});

function runCli(args: string[]) {
  return spawnSync(process.execPath, ["--import", TSX, SCRIPT, ...args], { encoding: "utf8" });
}

function withLog(text: string, body: (logPath: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "coverage-classifier-test-"));
  try {
    const logPath = join(dir, "coverage.log");
    writeFileSync(logPath, text);
    body(logPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("CLI: prints the comment body for a log, with the run URL, and no trailing newline", () => {
  withLog(`${MISS}\n`, (logPath) => {
    const result = runCli(["--ci-outcome=success", "--build-outcome=success", `--log=${logPath}`, "--run-url=https://example.invalid/run/9"]);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "**Nightly coverage REGRESSION**\n\n**lines**: 76.2% (threshold 78%)\n\nhttps://example.invalid/run/9");
  });
});

test("CLI: without --run-url the body ends after the detail's blank line, and an INFRA outcome wins over the log", () => {
  withLog(`${MISS}\n`, (logPath) => {
    const infra = runCli(["--ci-outcome=failure", "--build-outcome=success", `--log=${logPath}`]);
    assert.equal(infra.status, 0);
    assert.match(infra.stdout, /^\*\*Nightly coverage did not run/);
    assert.ok(infra.stdout.endsWith("no coverage measurement to read.\n\n"));
  });
});

test("CLI: a log path that cannot be read gives the UNKNOWN verdict, not an error", () => {
  const result = runCli(["--ci-outcome=success", "--build-outcome=success", `--log=${join(tmpdir(), "no-such-coverage-log-3998.txt")}`]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^\*\*Nightly coverage failed — CANNOT TELL why\*\*/);
  assert.match(result.stdout, /could not be read/);
});

test("CLI: a missing required flag prints usage and exits 2, and an unknown flag is refused", () => {
  for (const args of [[], ["--ci-outcome=success", "--build-outcome=success"], ["--build-outcome=success", "--log=x"], ["--ci-outcome=success", "--log=x"]]) {
    const result = runCli(args);
    assert.equal(result.status, 2, JSON.stringify(args));
    // The script's usage line names its own loader, and a sibling slice of #4596 removes it from `scripts/`: accept the line before and after.
    assert.match(result.stderr, /^Usage: node (?:--import \S+ )?scripts\/coverage-failure-classifier\.ts --ci-outcome=/);
    assert.equal(result.stdout, "");
  }
  const unknown = runCli(["--ci-outcome=success", "--build-outcome=success", "--log=x", "--bogus"]);
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /unknown flag --bogus/);
});
