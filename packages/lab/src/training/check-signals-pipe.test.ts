// no-token: gh -- nothing here calls `gh`; the only import is node's own, and check-signals is SPAWNED, never imported
// writes: runs/screenreader-dataset
// (every test builds its own fixture manifest of that shape under a temp dir and points the script at it; the real corpus is never read)
/**
 * #2452 -- `check-signals` MUST DELIVER ITS VERDICT LINE TO A READER THAT IS SLOW TO START.
 *
 * `main()` ended with `process.exit(exitCode)` straight after some 1,765 `console.log` lines. Into a pipe, Node's
 * stdout is asynchronous, so `process.exit` discarded everything the reader had not yet taken -- everything past
 * the 64 KB pipe buffer -- and the verdict is the LAST thing printed. `corpus-restore-drill.mjs` reads the gate
 * through a pipe and looks for the verdict line, so it reddened `main`'s `ts` job at random, on PRs whose diff
 * could not reach it. A fast reader keeps the line in both forms, which is why a local run always passed.
 *
 * THE SCRIPT IS SPAWNED, not imported: the test's own import closure stays clear of the corpus reader the token-less
 * acceptance job lacks, and only a child process has a real pipe on its stdout. The READER is late on purpose:
 * its stdout is paused for `READER_DELAY_MS`, so the pipe fills to its buffer and the child has either called
 * exit with output still queued in its own memory (the defect) or is blocked writing (the fix).
 *
 * POSITIVE CONTROLS: the fixture must print MORE than the pipe buffer (asserted, so a manifest that shrinks
 * cannot turn this into a test of a small run), and the mutation `process.exitCode = exitCode` -> `process.exit(exitCode)`
 * makes it FAIL (pasted on the PR).
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Resolved from THIS FILE, and not imported from `dataset-paths.mjs`: that module is the corpus reader, and importing
// it charges this test the `runs/` the token-less acceptance job does not have.
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const CHECK_SIGNALS = resolve(REPO_ROOT, "packages/lab/src/training/check-signals.mjs");

/** Linux's default pipe buffer. Anything the child prints beyond it waits for the reader. */
const PIPE_BUFFER_BYTES = 64 * 1024;
/** Long enough that the child has filled the pipe and is blocked on it before the reader shows up. */
const READER_DELAY_MS = 1500;
/** Each case prints ~150 bytes, so this clears the pipe buffer several times over. */
const FIXTURE_CASES = 1500;

/**
 * A manifest sharing no id with `CASES` is a fixture, reported and let through (`capture-corpus-guards.test.ts`
 * drives the script the same way). No captures exist for it, so every case prints one `NO CAPTURES` line and the
 * run ends INCONCLUSIVE, exit 2 -- an exit status that is not the default, so "unchanged" means something.
 */
function bigFixtureRoot() {
  const root = mkdtempSync(resolve(tmpdir(), "a11y-check-signals-pipe-"));
  const cases = Array.from({ length: FIXTURE_CASES }, (_, index) => ({
    id: `pipe-fixture-case-${String(index).padStart(5, "0")}-${"x".repeat(60)}`,
    criterion: "1.1.1",
    badSignal: { type: "regex", pattern: "^bad$", flags: "i" },
    source: "test fixture",
    mutation: "test mutation",
  }));
  writeFileSync(resolve(root, "manifest.json"), JSON.stringify({ cases }));
  return root;
}

/** Runs the script with stdout on a real pipe that nobody reads until `READER_DELAY_MS` has passed. */
function runIntoLateReader(root: string) {
  return new Promise<{ status: number | null; output: string }>((resolveRun, reject) => {
    const child = spawn(process.execPath, [CHECK_SIGNALS], {
      cwd: REPO_ROOT,
      env: { ...process.env, DATASET_ROOT: root },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.on("error", reject);
    child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
    child.on("close", (status) => resolveRun({ status, output }));
    // ATTACHED BUT PAUSED, not attached late: an unattached stdout is destroyed when the child exits, so 'close'
    // fires with nothing read and the test would report "printed 0" against a correct script as well as a broken one.
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
    child.stdout.pause();
    setTimeout(() => child.stdout.resume(), READER_DELAY_MS);
  });
}

test("a run printing more than the pipe buffer still delivers its verdict line to a late reader, with its exit status", async () => {
  const root = bigFixtureRoot();
  try {
    const { status, output } = await runIntoLateReader(root);
    assert.ok(Buffer.byteLength(output) > PIPE_BUFFER_BYTES,
      `the fixture must print more than the ${PIPE_BUFFER_BYTES}-byte pipe buffer or this tests nothing; it printed ${Buffer.byteLength(output)}`);
    assert.match(output, /^INCONCLUSIVE/m, `no verdict line reached the reader; output ended: ${JSON.stringify(output.slice(-120))}`);
    assert.match(output, /\d+ discriminating, 0 blind, 0 contaminated, 1500 uncaptured/, "the totals line before the verdict was lost too");
    assert.equal(status, 2, "the exit status must still be the verdict's");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
