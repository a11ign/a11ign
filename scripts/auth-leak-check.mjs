#!/usr/bin/env node
// @ts-check
// command: prove a login's credential never reaches what a run writes (ADR 0038) -- drives a real capture on THIS machine's worker with a fake credential, then searches for it. Exit 0 clean, 1 a leak, 2 could not examine.
//
// THE ADR'S THREE COMMANDS, and what each must exit (ADR 0038, Constraint 4; `docs/adr/0038-authenticated-capture.md`):
//
//   export FAKE_USER=canaryuser6d3f2a FAKE_SECRET=canarysecretb81c94     # letters and digits only
//   npm run auth:leak-check -- --fixture login-quiet --stage written --user-env FAKE_USER --secret-env FAKE_SECRET   # 0, examined > 0
//   npm run auth:leak-check -- --fixture login-echo  --stage raw     --user-env FAKE_USER --secret-env FAKE_SECRET   # EXACTLY 1
//   npm run auth:leak-check -- --fixture login-echo  --stage written --user-env FAKE_USER --secret-env FAKE_SECRET   # 0, redactions >= 1
//
// It must run ON THE MACHINE THE WORKER RUNS ON: an authenticated capture is refused for any worker that is not on this
// machine (clause 1), and the WORKER's environment must hold the two variables too, because the worker performs the login
// and reads them itself. Start the worker from a shell that exported them. Nothing about the login crosses the wire
// but the steps and the variables' NAMES.
//
// Run it with `tsx` (the `auth:leak-check` npm script does): it imports the CLI's TypeScript directly, so the machine needs
// no build. The decisions are in `packages/cli/src/auth/leak-check.ts`, which has the tests; this file is the I/O.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { refuseUnknownFlags } from "@a11ign/worker-fleet/cli-flags";

import { LeakCheckUsageError, credentialsFrom, examine, parseLeakCheckArgs, redactionCountIn } from "../packages/cli/src/auth/leak-check.ts";
import { buildScrubSet } from "../packages/cli/src/auth/scrub.ts";
import { captureViaWorker } from "../packages/cli/src/cli.ts";
import { isAuthFault } from "../packages/cli/src/auth/auth-faults.ts";
import { formatAuthFaultMessage } from "../packages/cli/src/fault-remediation.ts";
import { requestJson } from "@a11ign/worker-fleet/worker-http";
import { loginFlow, startFixtureSite } from "./auth-leak-fixtures.mjs";

const EXIT_COULD_NOT_EXAMINE = 2;
const HEALTH_TIMEOUT_MS = 8_000;

/**
 * Fail fast when there is no worker to ask. `captureViaWorker` retries a refused connection for a whole capture's budget
 * (minutes), which is right for a fleet run and wrong for a person who mistyped a port.
 * @param {string} worker
 */
async function assertWorkerAnswers(worker) {
  try {
    await requestJson(`${worker}/health`, { timeoutMs: HEALTH_TIMEOUT_MS });
  } catch (error) {
    throw new LeakCheckUsageError(`Could not reach the capture worker at ${worker} (${error instanceof Error ? error.message : String(error)}). `
      + "This command runs on the machine the worker runs on, with the worker started from a shell that exported the two variables.");
  }
}

/** @param {string[]} argv @param {Record<string, string | undefined>} env @returns {Promise<number>} */
export async function main(argv, env) {
  const args = parseLeakCheckArgs(argv);
  const credentials = credentialsFrom(args, env);
  buildScrubSet(credentials); // the floor, before a worker is asked for anything
  await assertWorkerAnswers(args.worker);
  const [user, secret] = credentials.map((credential) => credential.value);
  const site = await startFixtureSite({ fixture: args.fixture, user, secret });
  const dir = mkdtempSync(join(tmpdir(), "auth-leak-check-"));
  try {
    const url = `${site.origin}/${args.fixture}/account`;
    console.log(`auth:leak-check ${args.fixture} --stage ${args.stage}: capturing ${url} through ${args.worker}`);
    const capture = await captureViaWorker(url, {
      task: "read the account page behind the login", worker: args.worker,
      probeForms: false, probeFocus: false, probeNavigation: false, probeFocusContext: false, probeFocusReveal: false,
      auth: { login: loginFlow({ fixture: args.fixture, userEnv: args.userEnv, secretEnv: args.secretEnv }) },
    });
    const outcome = examine(args, capture, credentials, dir);
    for (const line of outcome.lines) console.log(line);
    if (args.stage === "written") console.log(`redaction count: ${redactionCountIn(outcome.lines)}`);
    return outcome.exit;
  } finally {
    await site.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

const isProgram = process.argv[1] !== undefined && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (isProgram) {
  refuseUnknownFlags(["--fixture", "--stage", "--user-env", "--secret-env", "--worker"], { entry: import.meta.url, command: "npm run auth:leak-check" });
  main(process.argv.slice(2), process.env).then((code) => process.exit(code), (error) => {
    // A refusal or a usage problem is "could not examine", and never a verdict: exit 2 is not a pass.
    const fault = /** @type {{ fault?: unknown }} */ (error)?.fault;
    console.error(error instanceof LeakCheckUsageError ? error.message
      : error instanceof Error ? (isAuthFault(fault) ? formatAuthFaultMessage(fault, error.message) : error.message) : String(error));
    process.exit(EXIT_COULD_NOT_EXAMINE);
  });
}
