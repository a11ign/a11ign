// @ts-check
/**
 * #2457: A TEST'S TEMP DIRECTORY, AND ITS REMOVAL, IN ONE PLACE.
 *
 * `mkdtempSync(join(tmpdir(), "x-"))` is a writer with no remover, and 134 test files called it. About 15,000 entries a
 * day reached `/tmp` that way until its INODES ran out (1,048,576 of 1,048,576 at 73% of the bytes), which no
 * disk-usage check sees and every session met as `ENOSPC`. A janitor is the backstop; this is the writer being taught to
 * clean up after itself.
 *
 * `tempDir(prefix)` is `mkdtempSync(join(tmpdir(), prefix))` that remembers what it made. Two things remove it, and the
 * caller can forget neither, because neither is the caller's:
 *
 * - **An after-hook registered when this module is imported.** It runs when the file's tests are done, whether they
 *   passed or threw. It is registered at IMPORT rather than at the first `tempDir` call because a runner only accepts a
 *   hook while a file is being collected, and a first call inside a running test is too late.
 * - **`exit`, `uncaughtExceptionMonitor` and `SIGTERM`/`SIGINT`/`SIGHUP` listeners**, for the case the hook cannot cover: a file that throws while it
 *   is still being collected (a fixture built at the top level) never reaches its after-hook. They are synchronous, which
 *   is all they may be.
 *
 * It creates under `os.tmpdir()` on every call, so a private `TMPDIR` steers it: that is how
 * `test-tmp-leak.test.ts` measures what a run leaves behind.
 *
 * **What it does not cover.** A run killed with `SIGKILL` runs neither. No hook survives that; the host's age rule on
 * `/tmp` is the backstop for it. And it removes only what `tempDir` made: a child process a test spawns still writes
 * wherever ITS `TMPDIR` points, so a test that spawns one hands it a `TMPDIR` from `tempDir` (see `corpus-restore-drill.test.ts`).
 */
import { after } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** @type {Set<string>} */
const owned = new Set();

/**
 * A new directory under `os.tmpdir()`, removed when this file's tests are done.
 * @param {string} prefix the leading part of the directory's name, exactly as `mkdtempSync` takes it (`"promote-"`)
 * @returns {string} the directory's path
 */
export function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  owned.add(dir);
  return dir;
}

/** Remove every directory `tempDir` made and has not yet removed. Idempotent, so the hook and the listener may both run it. */
export function removeTempDirs() {
  for (const dir of owned) {
    rmSync(dir, { recursive: true, force: true });
    owned.delete(dir);
  }
}

/**
 * Remove, then die of the same signal. `once` takes the listener off first, so the re-raise meets the default action
 * and the process ends exactly as it would have without this module. Measured under rstest 0.11: a file that throws
 * while it is collected is ended by `SIGTERM`, and `exit` never fires in that worker.
 * @param {NodeJS.Signals} signal
 */
function removeThenDieOf(signal) {
  process.once(signal, () => {
    removeTempDirs();
    process.kill(process.pid, signal);
  });
}

after(removeTempDirs);
process.once("exit", removeTempDirs);
// Observes an uncaught exception without handling it. Under `node:test` a file that throws while it is loaded ends with
// exit code 7 and no `exit` event, so this is the only place that case can be reached.
process.once("uncaughtExceptionMonitor", removeTempDirs);
for (const signal of /** @type {const} */ (["SIGTERM", "SIGINT", "SIGHUP"])) removeThenDieOf(signal);
