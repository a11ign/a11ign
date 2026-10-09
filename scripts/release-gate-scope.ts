#!/usr/bin/env node
// @ts-check
// command: warn which release:gate stages release:gate:ci does not run, and how many
//
// #1397: the warning this replaces said "release:gate:ci ran 4 of release:gate's 12 stages" as literal
// text typed into the workflow step -- true the day it was written, wrong once release:gate grew a
// stage (the chain is 13 long; `release:gate:ci` runs 5 of them), and nothing would have caught the
// drift because nothing read the scripts the sentence claimed to describe. Reading `package.json`'s own
// two chains every run means the count can only ever describe the chain that is actually there.
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { refuseUnknownFlags } from "./cli-flags.mjs";

const REPO = fileURLToPath(new URL("../", import.meta.url));

/** The stage links a chained script invokes: `npm run x`, `pnpm run x` or `node scripts/pnpm.mjs run x`. */
const STAGE_LINK = /(?:npm|pnpm|pnpm\.mjs) run ([\w:.-]+)/g;

/** The stages a chained script invokes, in order. Refuses a chain that parses to none: the spelling of a link
 * changed once (`pnpm run` to `node scripts/pnpm.mjs run`, #3277) and the pattern read zero stages, which the
 * subset check below passed as `0 + 0 === 0` and the warning printed as "0 of 0".
 * @param {Record<string, string>} scripts
 * @param {string} name
 * @returns {string[]}
 */
export function stagesOf(scripts: Record<string, string>, name: string): string[] {
  const stages = [...(scripts[name] ?? "").matchAll(STAGE_LINK)].map((m) => m[1]);
  if (stages.length === 0) {
    throw new Error(`${name} parsed to zero stages -- expected links spelled ${STAGE_LINK} `
      + `(\`npm run x\`, \`pnpm run x\` or \`node scripts/pnpm.mjs run x\`), got: ${scripts[name]}`);
  }
  return stages;
}

/** Which of release:gate's stages release:gate:ci runs, and which it leaves to the lab.
 * @param {Record<string, string>} scripts
 */
export function gateScope(scripts: Record<string, string>) {
  const full = stagesOf(scripts, "release:gate");
  const ci = stagesOf(scripts, "release:gate:ci");
  const skipped = full.filter((stage) => !ci.includes(stage));
  if (skipped.length + ci.length !== full.length) {
    throw new Error("release:gate:ci is not a subset of release:gate -- fix the scripts, not this message");
  }
  return { full, ci, skipped };
}

function main() {
  refuseUnknownFlags([], { entry: import.meta.url, command: "node scripts/release-gate-scope.ts" });
  const { scripts } = JSON.parse(readFileSync(`${REPO}package.json`, "utf8"));
  const { full, ci, skipped } = gateScope(scripts);
  console.log(`::warning::release:gate:ci ran ${ci.length} of release:gate's ${full.length} stages. `
    + `The other ${skipped.length} need the Python`);
  console.log(`::warning::venv or the corpus and cannot run on a runner (${skipped.join(", ")}). Run `
    + "them on the lab BEFORE");
  console.log("::warning::publishing for real:  pnpm run lab:job -- -e job=release-gate");
}

// REALPATH'D, per `entry-points.test.ts` (#1086): reached through a symlink, the plain form skips main() and exits 0 silently.
if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
