#!/usr/bin/env node
// @ts-check
// command: the whole-repo coverage gate `pnpm run coverage` runs, now through rstest, not c8
//
// #1320, STEP 4 OF THE RSTEST ADOPTION (#1317): coverage moves off c8 onto `@rstest/coverage-v8`. Three
// pieces, each already built and tested for a reason of its own, wired together here for the first time:
//
//   - THE SAME VACUITY FLOOR `test:ts`/`test:all` use (#355/#1319) -- `assert-glob-not-empty.mjs`, run as a
//     CHECK ONLY, never `--run`: the real run below is rstest's own, over the population `.c8rc.json`
//     already declares, and passing that population to the floor a second time would be a second copy of
//     the same fact typed twice.
//   - `runChildCoverage` from `@a11ign/toolchain` (#1350, moved there by #3578), called in this process with a11ign's own
//     rstest command: it runs the suite under rstest with coverage and folds in what a spawned `node` child
//     covered, so a script `NODE_V8_COVERAGE` would otherwise miss does not read 0%.
//   - THE THRESHOLD, CHECKED HERE, AFTER THE MERGE -- never by rstest's own `--coverage.thresholds`. That
//     would gate the PRE-MERGE report, where every file #1350 exists to fix still reads 0%: exactly the
//     numbers the merge corrects. So this script re-derives the same totals `coverage-final.merged.json`
//     already holds, through the same `CoverageProvider` the merge itself uses, and compares them against
//     `.c8rc.json`'s own `lines`/`statements` numbers -- the same 78 c8 enforced, read once, never retyped.
//
// THE THRESHOLD-MISS MESSAGE IS c8's OWN WORDING, VERBATIM: `ERROR: Coverage for <metric> (<pct>%) does not
// meet threshold (<pct>%)`. `scripts/coverage-failure-classifier.ts` (#169) parses exactly this shape out of
// nightly's captured log to tell a real regression from a test failure, against a regex that was pinned to
// c8's own installed source until #1321 (rstest adoption step 5/5) removed c8 as a dependency -- reusing the
// wording here is what keeps that classifier working without editing it, now that this function is the
// wording's only producer. The coupling is pinned in `coverage-is-rstest.test.ts`.
//
// EXCLUDED FROM ITS OWN COVERAGE MEASUREMENT (`.c8rc.json`, which already names this file) for the same
// reason `scripts/build-packages.mjs` is: it spawns the test runner, so measuring the measurer is circular.
//
// RELATIVE IMPORTS, NOT `@a11ign/screenreader-fleet/cli-flags` -- a root script, the same rule `build-packages.mjs`
// and `coverage-failure-classifier.ts` give for their own identical choice.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CoverageProvider } from "@rstest/coverage-v8";
import { refuseUnknownFlags } from "./cli-flags.mjs";
// The toolchain's SOURCE by relative path, for the reason `scripts/rstest/rstest.config.mjs` gives: a tree with no `dist` must run this.
import { coverageOptionsFromC8rc, coverageTotals, runChildCoverage } from "@a11ign/toolchain/merge-child-coverage";
// #492: a bare "pnpm" spawn is ENOENT on windows-2022; `npm-cli-windows-spawn.test.ts` refuses one.
import { pnpmCliInvocation } from "./npm-cli-executable.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const REPORTS_DIRECTORY = join(ROOT, "coverage", "rstest");
const MERGED_REPORT = join(REPORTS_DIRECTORY, "coverage-final.merged.json");
const TEST_GLOB = "packages/*/src/**/*.test.ts";
// Measured 2026-10-07 at e31b5ec69: the guard's own glob matched 140 files (it was 300 before the packages left the workspace, #3991).
// Set a little under the count so ordinary deletions pass, while a typo'd or moved glob (which matches ~0) is still refused.
const MIN_TEST_FILES = 130;

/**
 * Which of `totals`' metrics read below `c8rc`'s own threshold for that metric, in c8's own error wording --
 * see this file's header for why the wording matters and must not drift from it.
 * @param {ReturnType<typeof coverageTotals>} totals @param {{ lines: number, statements: number }} c8rc
 * @returns {string[]}
 */
export function thresholdMissLines(totals: ReturnType<typeof coverageTotals>, c8rc: { lines: number; statements: number; }): string[] {
  return /** @type {const} */ (["lines", "statements"])
    .filter((metric) => totals[metric].pct < c8rc[metric])
    .map((metric) => `ERROR: Coverage for ${metric} (${totals[metric].pct}%) does not meet threshold (${c8rc[metric]}%)`);
}

/** Runs a step, inheriting stdio -- a real spawn, not a shell string (this repo's own rule).
 * @param {string[]} args */
function step(args: string[]) {
  return spawnSync(process.execPath, args, { cwd: ROOT, stdio: "inherit" });
}

/**
 * What `@rstest/coverage-v8`'s `CoverageProvider` leaves in `process.exitCode`, taken out of it. The provider runs IN THIS
 * PROCESS (`runChildCoverage` folds child coverage in-process), and every time it logs "Failed to process coverage for ..."
 * (`dist/index.js` 1343, 1426, 1430: a child entry it cannot parse, such as a `node -e` script's `[eval1]`) it ALSO sets
 * `process.exitCode = 1` -- so this script used to exit 1 after printing a passing reading and none of its own messages
 * (#3865, release run 37504186973: 206 such lines, 596 files passed, exit 1). That is the provider's diagnostic about files
 * it could not read, not this gate's verdict, and an unread child file only lowers the totals, so the threshold stays the gate.
 * @returns {number}
 */
export function takeProviderExitCode(): number {
  const code = Number(process.exitCode ?? 0);
  process.exitCode = undefined;
  return code;
}

/**
 * Everything this script prints and exits with, derived from what it measured -- pure, so that "never exits non-zero
 * without saying why" (#3865) is a property a test can enumerate rather than a habit of `main()`.
 * @param {{ mergedReport: boolean, mergeStatus: number | null, providerExitCode: number,
 *   totals: ReturnType<typeof coverageTotals> | null, c8rc: { lines: number, statements: number } }} reading
 * @returns {{ code: number, stdout: string[], stderr: string[] }}
 */
export function coverageVerdict({ mergedReport, mergeStatus, providerExitCode, totals, c8rc }: {
        mergedReport: boolean; mergeStatus: number | null; providerExitCode: number;
        totals: ReturnType<typeof coverageTotals> | null; c8rc: { lines: number; statements: number; };
    }): { code: number; stdout: string[]; stderr: string[]; } {
  if (!mergedReport || !totals) {
    return { code: mergeStatus || 1, stdout: [], stderr: [
      `coverage: no merged report at ${MERGED_REPORT} (merge exited ${mergeStatus}) -- nothing to check.` ] };
  }
  const stdout = [`coverage: lines ${totals.lines.pct}%  statements ${totals.statements.pct}%  `
    + `(threshold ${c8rc.lines}%/${c8rc.statements}%)`];
  const stderr = providerExitCode === 0 ? [] : [
    `coverage: @rstest/coverage-v8 could not process coverage for some files (its "Failed to process coverage" lines `
    + `above) and set exit code ${providerExitCode}; those files read as uncovered, so the totals can only be low, and `
    + "the threshold is this gate's verdict, not that exit code." ];
  if (mergeStatus !== 0) {
    stderr.push("coverage: the suite did not pass -- coverage was measured but this is a test failure, not a coverage miss.");
    return { code: mergeStatus || 1, stdout, stderr };
  }
  const misses = thresholdMissLines(totals, c8rc);
  return { code: misses.length ? 1 : 0, stdout, stderr: [...stderr, ...misses] };
}

async function main() {
  refuseUnknownFlags([], { entry: import.meta.url, command: "node --import tsx scripts/coverage.ts" });
  const floor = step([join(ROOT, "packages/guards/src/assert-glob-not-empty.mjs"), TEST_GLOB, `--min=${MIN_TEST_FILES}`]);
  if (floor.status !== 0) {
    process.stderr.write(`coverage: the vacuity floor failed (${TEST_GLOB} matched fewer than ${MIN_TEST_FILES} files) -- not measuring.\n`);
    process.exit(floor.status ?? 1);
  }

  const c8rc = JSON.parse(readFileSync(join(ROOT, ".c8rc.json"), "utf8"));
  const rstest = pnpmCliInvocation(["exec", "rstest", "run", "--config", "scripts/rstest/rstest.config.mjs"]);
  const mergeStatus = await runChildCoverage({ root: ROOT, population: c8rc, rstest: { command: rstest.command, args: rstest.args } });
  const mergedReport = existsSync(MERGED_REPORT);
  let totals = null;
  if (mergedReport) {
    const options = coverageOptionsFromC8rc(c8rc, REPORTS_DIRECTORY);
    const map = new CoverageProvider(/** @type {any} */ (options), ROOT).createCoverageMap();
    map.merge(JSON.parse(readFileSync(MERGED_REPORT, "utf8")));
    totals = coverageTotals(map);
  }

  const { code, stdout, stderr } = coverageVerdict({ mergedReport, mergeStatus, providerExitCode: takeProviderExitCode(), totals, c8rc });
  for (const line of stdout) process.stdout.write(`${line}\n`);
  for (const line of stderr) process.stderr.write(`${line}\n`);
  if (code !== 0) process.exit(code);
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) await main();
