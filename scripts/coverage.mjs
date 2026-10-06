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
// meet threshold (<pct>%)`. `scripts/coverage-failure-classifier.mjs` (#169) parses exactly this shape out of
// nightly's captured log to tell a real regression from a test failure, against a regex that was pinned to
// c8's own installed source until #1321 (rstest adoption step 5/5) removed c8 as a dependency -- reusing the
// wording here is what keeps that classifier working without editing it, now that this function is the
// wording's only producer. The coupling is pinned in `coverage-is-rstest.test.ts`.
//
// EXCLUDED FROM ITS OWN COVERAGE MEASUREMENT (`.c8rc.json`, which already names this file) for the same
// reason `scripts/build-packages.mjs` is: it spawns the test runner, so measuring the measurer is circular.
//
// RELATIVE IMPORTS, NOT `@a11ign/screenreader-fleet/cli-flags` -- a root script, the same rule `build-packages.mjs`
// and `coverage-failure-classifier.mjs` give for their own identical choice.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CoverageProvider } from "@rstest/coverage-v8";
import { refuseUnknownFlags } from "./cli-flags.mjs";
// The toolchain's SOURCE by relative path, for the reason `scripts/rstest/rstest.config.mjs` gives: a tree with no `dist` must run this.
import { coverageOptionsFromC8rc, coverageTotals, runChildCoverage } from "../packages/toolchain/src/merge-child-coverage.mjs";
// #492: a bare "pnpm" spawn is ENOENT on windows-2022; `npm-cli-windows-spawn.test.ts` refuses one.
import { pnpmCliInvocation } from "./npm-cli-executable.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const REPORTS_DIRECTORY = join(ROOT, "coverage", "rstest");
const MERGED_REPORT = join(REPORTS_DIRECTORY, "coverage-final.merged.json");
const TEST_GLOB = "packages/*/src/**/*.test.ts";
const MIN_TEST_FILES = 300;

/**
 * Which of `totals`' metrics read below `c8rc`'s own threshold for that metric, in c8's own error wording --
 * see this file's header for why the wording matters and must not drift from it.
 * @param {ReturnType<typeof coverageTotals>} totals @param {{ lines: number, statements: number }} c8rc
 * @returns {string[]}
 */
export function thresholdMissLines(totals, c8rc) {
  return /** @type {const} */ (["lines", "statements"])
    .filter((metric) => totals[metric].pct < c8rc[metric])
    .map((metric) => `ERROR: Coverage for ${metric} (${totals[metric].pct}%) does not meet threshold (${c8rc[metric]}%)`);
}

/** Runs a step, inheriting stdio -- a real spawn, not a shell string (this repo's own rule).
 * @param {string[]} args */
function step(args) {
  return spawnSync(process.execPath, args, { cwd: ROOT, stdio: "inherit" });
}

async function main() {
  refuseUnknownFlags([], { entry: import.meta.url, command: "node scripts/coverage.mjs" });
  const floor = step([join(ROOT, "packages/guards/src/assert-glob-not-empty.mjs"), TEST_GLOB, `--min=${MIN_TEST_FILES}`]);
  if (floor.status !== 0) process.exit(floor.status ?? 1);

  const c8rc = JSON.parse(readFileSync(join(ROOT, ".c8rc.json"), "utf8"));
  const rstest = pnpmCliInvocation(["exec", "rstest", "run", "--config", "scripts/rstest/rstest.config.mjs"]);
  const mergeStatus = await runChildCoverage({ root: ROOT, population: c8rc, rstest: { command: rstest.command, args: rstest.args } });
  if (!existsSync(MERGED_REPORT)) {
    process.stderr.write(`coverage: no merged report at ${MERGED_REPORT} (merge exited ${mergeStatus}) -- nothing to check.\n`);
    process.exit(mergeStatus ?? 1);
  }

  const options = coverageOptionsFromC8rc(c8rc, REPORTS_DIRECTORY);
  const map = new CoverageProvider(/** @type {any} */ (options), ROOT).createCoverageMap();
  map.merge(JSON.parse(readFileSync(MERGED_REPORT, "utf8")));
  const totals = coverageTotals(map);
  process.stdout.write(`coverage: lines ${totals.lines.pct}%  statements ${totals.statements.pct}%  `
    + `(threshold ${c8rc.lines}%/${c8rc.statements}%)\n`);

  if (mergeStatus !== 0) {
    process.stderr.write("coverage: the suite did not pass -- coverage was measured but this is a test "
      + "failure, not a coverage miss.\n");
    process.exit(mergeStatus ?? 1);
  }
  const misses = thresholdMissLines(totals, c8rc);
  if (misses.length) {
    for (const line of misses) process.stderr.write(`${line}\n`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) await main();
