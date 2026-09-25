#!/usr/bin/env node
// @ts-check
// command: prove no credential is in what a REAL run produced -- scans every text file under a path (markdown, comment, log, JSON, whatever the extension) for the values of two environment variables. Exit 0 clean, 1 a leak, 2 could not examine.
//
//   export FAKE_USER=... FAKE_SECRET=...     # the values the run used, or a stand-in you know it echoed
//   npm run auth:artifact-scan -- --path "$RUNNER_TEMP/a11ign-summary.md" --user-env FAKE_USER --secret-env FAKE_SECRET
//   npm run auth:artifact-scan -- --path ./artifacts-dir --user-env FAKE_USER --secret-env FAKE_SECRET
//
// `auth:leak-check` (ADR 0038) reads only the `.json` it writes itself from a fixture; this is the check for a real run's output. It
// uses the same detector (`packages/cli/src/auth/leak-detector.ts`) and the same exit codes, and it prints how much it examined
// before it says clean. A directory with no text file in it is exit 2, and a binary file is named as skipped. It looks only where it
// is pointed: a credential that reached a channel you did not point it at is not covered. The decisions and tests are in
// `packages/cli/src/auth/artifact-scan.ts`; this file is the I/O.
//
// Run it with `tsx` (the npm script does): it imports the CLI's TypeScript directly, so the machine needs no build.
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { refuseUnknownFlags } from "@a11ign/worker-fleet/cli-flags";

import { parseArtifactScanArgs, scanArtifacts } from "../packages/cli/src/auth/artifact-scan.ts";

const EXIT_COULD_NOT_EXAMINE = 2;

/** @param {string[]} argv @param {Record<string, string | undefined>} env @returns {number} */
export function main(argv, env) {
  const outcome = scanArtifacts(parseArtifactScanArgs(argv), env);
  for (const line of outcome.lines) console.log(line);
  return outcome.exit;
}

const isProgram = process.argv[1] !== undefined && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (isProgram) {
  refuseUnknownFlags(["--path", "--user-env", "--secret-env"], { entry: import.meta.url, command: "npm run auth:artifact-scan" });
  try {
    process.exit(main(process.argv.slice(2), process.env));
  } catch (error) {
    // A usage problem or a path that is not there is "could not examine", and never a verdict: exit 2 is not a pass.
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(EXIT_COULD_NOT_EXAMINE);
  }
}
