#!/usr/bin/env tsx
// command: decide whether the outside repository's `outsider-job.yml` must be rewritten for a promoted release (#4359)
//
// THE QUESTION `release.yml`'s `refresh-outsider-pin` JOB ASKS after `latest` moves. Three releases in a row (0.3.2, 0.4.0, 0.5.0) left the
// outsider run red until somebody ran `generate.ts --sha=<tag sha> --version=<v>` by hand (#4041, #4349), and #4349 measured that Dependabot
// had never opened a pin pull request on the outside repository: its log said `No update needed for a11ign/a11ign 0.1.0`.
//
// The pin is a literal that a workflow cannot commit under `.github/workflows` with `GITHUB_TOKEN`, so the release run writes it with a token
// Octo STS mints for the outside repository (`outsider-pin-write.sts.yaml`, installed THERE: a repository policy reaches only the repository
// it sits in). This file is the decision between the generated text and what the outside repository carries; the workflow is the actor.
//
// THE DECISION IS A PURE READING OF TWO TEXTS AND A VERSION, and it reads no git history, so a re-run of the release step is harmless:
//   current   the outside file already equals what the generator makes for this release -- nothing to write, and a second run commits nothing.
//   newer     the outside file's `# v<version>` comment names a LATER release than the one promoted -- a re-run of an older promotion must
//             never move the pin backwards (the same rule `promote-action-tag` keeps for the major tag).
//   write     anything else, including a file whose pin carries no readable version: not being able to read it is not a reason to leave it.
import { appendFileSync, readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { refuseUnknownFlags } from "../cli-flags.ts";

/** The path in the outside repository the release writes: the only file the minted token is ever used on. */
export const OUTSIDER_JOB_PATH = ".github/workflows/outsider-job.yml";
export const WRITE = "write";
export const CURRENT = "current";
export const NEWER = "newer";

/** The comment `generate.ts --version` writes and Dependabot reads: `uses: a11ign/a11ign@<sha> # v1.2.3`. */
const PIN_VERSION_COMMENT = /^\s*(?:- )?uses:\s*a11ign\/a11ign@[0-9a-f]{40} # v(\d+\.\d+\.\d+)$/m;
const PLAIN_VERSION = /^\d+\.\d+\.\d+$/;

export type RefreshDecision = { action: typeof WRITE | typeof CURRENT | typeof NEWER; reason: string };

/** The release the pin line names, or `undefined` when it names none (a pin written without `--version`, or by hand). */
export function pinnedVersion(workflowText: string): string | undefined {
  return PIN_VERSION_COMMENT.exec(workflowText)?.[1];
}

/** Negative, zero or positive as `left` is older than, equal to or newer than `right`; both must be `x.y.z`. */
function compareVersions(left: string, right: string): number {
  const [a, b] = [left, right].map((version) => version.split(".").map(Number));
  return a.reduce((order, part, index) => order || part - b[index], 0);
}

export function refreshDecision({ currentText, generatedText, version }: { currentText: string; generatedText: string; version: string }): RefreshDecision {
  if (!PLAIN_VERSION.test(version)) throw new Error(`'${version}' is not an x.y.z, which is all a promotion names`);
  if (currentText === generatedText) return { action: CURRENT, reason: `the outside file already equals what the generator makes for ${version}` };
  const pinned = pinnedVersion(currentText);
  if (pinned !== undefined && compareVersions(pinned, version) > 0) {
    return { action: NEWER, reason: `the outside file pins ${pinned}, later than ${version}; the pin never moves backwards` };
  }
  return {
    action: WRITE,
    reason: pinned === undefined
      ? `the outside file's pin names no release, so it is rewritten for ${version}`
      : `the outside file pins ${pinned}, and ${version} is the release promoted`,
  };
}

function setOutput(name: string, value: string): void {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

/** `flag` is `--name=`; a missing one is an error, because a decision made without its input is a guess. */
function requiredFlag(flag: string): string {
  const argument = process.argv.slice(2).find((a) => a.startsWith(flag));
  if (argument === undefined) throw new Error(`${flag}<value> is required`);
  return argument.slice(flag.length);
}

function main() {
  const { action, reason } = refreshDecision({
    currentText: readFileSync(requiredFlag("--current="), "utf8"),
    generatedText: readFileSync(requiredFlag("--generated="), "utf8"),
    version: requiredFlag("--version="),
  });
  console.log(`${action.toUpperCase()}  ${OUTSIDER_JOB_PATH}: ${reason}`);
  setOutput("action", action);
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  try {
    refuseUnknownFlags(["--current=", "--generated=", "--version="], { entry: import.meta.url, command: "pnpm exec tsx scripts/outsider/refresh-pin.ts" });
    main();
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
  }
}
