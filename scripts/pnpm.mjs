#!/usr/bin/env node
// @ts-check
// command: run pnpm with the arguments given, for a package script's chain on a box with no `pnpm` on PATH
/**
 * `node scripts/pnpm.mjs run X --silent -- --flag` IS `pnpm run X --silent -- --flag`, REACHED WITHOUT A `pnpm` ON PATH (#3141).
 *
 * The lab runs every job as `/usr/bin/corepack pnpm run <script>` and has no `pnpm` on PATH by design (corepack,
 * pinned by `packageManager`). A script that chains `pnpm run X && pnpm run Y` hands the SHELL a first word the
 * unit does not have, so `release:gate` exited 1 in under a second at `sh: pnpm: not found` (#3141, the class
 * #2945 closed for the lifecycle scripts only). This is the same remedy: reach pnpm through `pnpmCliInvocation`,
 * whose first choice is `npm_execpath`, the pnpm that started the chain.
 *
 * ARGUMENTS ARE PASSED THROUGH, NEVER RE-PARSED, and the exit status is pnpm's own, so `&&` still stops a chain
 * at the first failing stage. A refusal to START (no pnpm reachable) exits 1 naming what was tried, never 0.
 */
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { pnpmCliInvocation } from "./npm-cli-executable.mjs";

/** A child ended by a signal has no exit status; that must read as a failure, never as the 0 a missing status would. */
const FAILED = 1;

/**
 * @param {string[]} args what to hand pnpm, verbatim
 * @returns {number} the exit status the chain should see
 */
export function runPnpm(args) {
  const { command, args: argv } = pnpmCliInvocation(args);
  const result = spawnSync(command, argv, { stdio: "inherit" });
  if (result.error) throw new Error(`could not start \`${command} ${argv.join(" ")}\``, { cause: result.error });
  return result.status ?? FAILED;
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  try {
    process.exitCode = runPnpm(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = FAILED;
  }
}
