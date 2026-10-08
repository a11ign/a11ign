// #4221 (#4090 readings, #4084 outcome 6): THE DOCUMENTED MULTI-LINE `urls: |` SCANNED ONE PAGE OF TEN, with the Action green.
//
// `examples/nightly-workflow.yml` and `docs/github-action.md` both show `urls: |` with one URL per line, and a11ign 0.4.0 scanned the
// first of ten on a `windows-2022` runner: the capture step pasted the list into shell text as `--urls "<newline list>"` and ran
// `npx tsx` under Git Bash, and `npx.cmd` cuts an argument at a newline. The same ten URLs on one line, space separated, scanned all ten.
// The fix is in the Action: the three page inputs arrive through `env:` (never `${{ inputs.* }}` inside `run:`, GitHub's documented
// script-injection pattern) and the list is flattened to one line before it is handed to the CLI.
//
// This reads the SHIPPED `action.yml` and RUNS the step's own argument-building lines under bash with a stub `npx`. A Linux bash does not
// cut at a newline, so the stub does what `npx.cmd` does: it keeps each argument only up to its first newline, and the assertion counts the
// URLs that survive that, which is 3 for the fixed step and 1 for the step as it was. The real Windows run is the row's Done-when 2.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parse } from "yaml";
import { splitUrlList } from "../multi-page.js";

const ROOT = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "../../../..");
const shippedAction = (): string => readFileSync(resolve(ROOT, "action.yml"), "utf8");

interface Step { name?: string; env?: Record<string, string>; run?: string }
const stepsOf = (actionText: string): Step[] => (parse(actionText) as { runs: { steps: Step[] } }).runs.steps;

const PAGES = ["https://example.test/one", "https://example.test/two?ids=1,2", "https://example.test/three"];
const PAGE_INPUTS = /\$\{\{\s*inputs\.(url|urls|max-pages)\s*\}\}/;

function stepNamed(actionText: string, name: string): Step & { run: string } {
  const step = stepsOf(actionText).find((candidate) => candidate.name === name);
  assert.ok(step?.run, `no step named ${name}`);
  return step as Step & { run: string };
}

// ---- no page input is interpolated into a script ----------------------------------------------------------------------------

/** The steps whose `run:` text carries a page input as `${{ }}`: the script-injection shape, and the one a newline breaks. */
const interpolating = (actionText: string): string[] =>
  stepsOf(actionText).filter((step) => PAGE_INPUTS.test(step.run ?? "")).map((step) => step.name ?? "(unnamed)");

test("action.yml: no run block interpolates url, urls or max-pages with ${{ }}", () => {
  assert.deepEqual(interpolating(shippedAction()), []);
});

test("CONTROL: a copy with one page input put back into a run block is named", () => {
  // The positive control for the emptiness assertion above: the same function must find the offender when there is one.
  const regressed = shippedAction().replace('[ -n "$URLS" ] &&', '[ -n "${{ inputs.urls }}" ] &&');
  assert.notEqual(regressed, shippedAction(), "the mutation changed nothing, so it controls nothing");
  assert.deepEqual(interpolating(regressed), ["Capture and judge"]);
});

test("action.yml: the three page inputs are declared in the env of every step that reads them", () => {
  for (const [name, variables] of [["Check exactly one of url and urls is given", ["URL", "URLS"]], ["Capture and judge", ["URL", "URLS", "MAX_PAGES"]]] as const) {
    const step = stepNamed(shippedAction(), name);
    for (const variable of variables) {
      assert.match(step.env?.[variable] ?? "", /^\$\{\{ inputs\.[\w-]+ \}\}$/, `${name}: ${variable} does not come from an input`);
    }
  }
});

// ---- the capture step hands the CLI ONE line ---------------------------------------------------------------------------------

/** What `npx.cmd` does to an argument: it ends at the first line break. Everything after is lost, and the run is still green. */
const STUB_NPX = `#!/bin/bash
printf '%s\\0' "$@" > "$STUB_ARGS_FILE"
`;

/** From `args=(--json)` to the `npx tsx` line: where the arguments are built and handed over, and none of the worker setup. */
function argumentBuilder(actionText: string): string {
  const run = stepNamed(actionText, "Capture and judge").run;
  const start = run.indexOf("args=(--json)");
  const npx = run.indexOf("npx tsx packages/cli/src/cli.ts");
  assert.ok(start >= 0 && npx > start, "the argument builder moved: this test slices from `args=(--json)` to the `npx tsx` line");
  return run.slice(start, run.indexOf("\n", npx));
}

interface Handed { args: string[]; status: number | null; stderr: string }

function handedToCli({ actionText, env }: { actionText: string; env: Record<string, string> }): Handed {
  const work = mkdtempSync(join(tmpdir(), "urls-input-"));
  const argsFile = join(work, "args");
  writeFileSync(join(work, "npx"), STUB_NPX);
  chmodSync(join(work, "npx"), 0o755);
  // The other inputs are still interpolated (they are outside this row) and are empty here; `urls` is filled so a mutated copy that
  // pastes it back into the script text behaves as the old step did.
  const filled = argumentBuilder(actionText).replace(/\$\{\{\s*inputs\.([\w-]+)\s*\}\}/g, (_, name: string) => (name === "urls" ? (env.URLS ?? "") : ""));
  const script = `flows_path=""\nstate_path=""\nout="${work}/result.json"\n${filled}`;
  const run = spawnSync("bash", ["-eo", "pipefail", "-c", script], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${work}:${process.env.PATH}`, RUNNER_TEMP: work, STUB_ARGS_FILE: argsFile, URL: "", URLS: "", MAX_PAGES: "", ...env },
  });
  // `npx` is called as `npx tsx packages/cli/src/cli.ts ...`: the first two are the runner and the entry point, not arguments the step builds.
  const args = readFileSync(argsFile, "utf8").split("\0").slice(0, -1);
  return { args, status: run.status, stderr: run.stderr };
}

/** The `--urls` value as the CLI process receives it after `npx.cmd` has had its way, or null when the flag is absent. */
function urlsSeenByCli(handed: Handed): string[] | null {
  const at = handed.args.indexOf("--urls");
  if (at < 0) return null;
  assert.equal(handed.args.filter((arg) => arg === "--urls").length, 1, "--urls given more than once");
  const cut = handed.args[at + 1].split(/\r?\n/)[0];
  return splitUrlList(cut);
}

test("action.yml: a three-line urls input reaches the CLI as ONE argument with no newline in it, and all three pages survive", () => {
  const handed = handedToCli({ actionText: shippedAction(), env: { URLS: PAGES.join("\n") } });
  assert.equal(handed.status, 0, handed.stderr);
  const value = handed.args[handed.args.indexOf("--urls") + 1];
  assert.doesNotMatch(value, /[\r\n]/, "a line break survives into the argument");
  assert.deepEqual(urlsSeenByCli(handed), PAGES);
  assert.equal(urlsSeenByCli(handed)?.length, PAGES.length);
});

test("action.yml: a list with CRLF line endings, blank lines and indentation (a workflow file edited on Windows) is still three pages", () => {
  const messy = `\r\n  ${PAGES[0]}\r\n\r\n  ${PAGES[1]}\r\n\t${PAGES[2]}\r\n`;
  const handed = handedToCli({ actionText: shippedAction(), env: { URLS: messy } });
  assert.equal(handed.status, 0, handed.stderr);
  assert.deepEqual(urlsSeenByCli(handed), PAGES);
});

test("action.yml: the same URLs on one line still arrive as they did, and url and max-pages are passed verbatim", () => {
  const spaced = handedToCli({ actionText: shippedAction(), env: { URLS: PAGES.join(" ") } });
  assert.deepEqual(urlsSeenByCli(spaced), PAGES);
  const single = handedToCli({ actionText: shippedAction(), env: { URL: "https://example.test/a b", MAX_PAGES: "25" } });
  assert.deepEqual(single.args.slice(2), ["--json", "https://example.test/a b", "--max-pages", "25", "--no-axe"]);
  assert.equal(urlsSeenByCli(single), null);
});

test("action.yml: a value shaped like shell syntax is data, not a command (the injection the env form closes)", () => {
  const hostile = 'https://example.test/";echo-INJECTED;"';
  const handed = handedToCli({ actionText: shippedAction(), env: { URLS: hostile } });
  assert.equal(handed.status, 0, handed.stderr);
  assert.doesNotMatch(handed.stderr, /INJECTED/);
  assert.deepEqual(urlsSeenByCli(handed), [hostile]);
});

test("CONTROL: the step as it was on main (the list pasted into the script text) loses two of three pages", () => {
  const before = shippedAction()
    .replace('[ -n "$URLS" ] && args+=(--urls "$(printf \'%s\' "$URLS" | tr -s \'[:space:]\' \' \')")', '[ -n "$URLS" ] && args+=(--urls "${{ inputs.urls }}")');
  assert.notEqual(before, shippedAction(), "the mutation changed nothing, so it controls nothing");
  const handed = handedToCli({ actionText: before, env: { URLS: PAGES.join("\n") } });
  assert.equal(urlsSeenByCli(handed)?.length, 1, "the old form should be seen by the CLI as ONE page of three");
  assert.match(handed.args[handed.args.indexOf("--urls") + 1], /\n/);
});

test("CONTROL: a step that flattens nothing (the env variable passed as it is) is caught by the same assertion", () => {
  const unflattened = shippedAction().replace('"$(printf \'%s\' "$URLS" | tr -s \'[:space:]\' \' \')"', '"$URLS"');
  assert.notEqual(unflattened, shippedAction(), "the mutation changed nothing, so it controls nothing");
  const handed = handedToCli({ actionText: unflattened, env: { URLS: PAGES.join("\n") } });
  assert.equal(urlsSeenByCli(handed)?.length, 1);
});

// ---- the check step reads the same env ---------------------------------------------------------------------------------------

function checkExitStatus(env: Record<string, string>): number | null {
  const run = stepNamed(shippedAction(), "Check exactly one of url and urls is given").run;
  return spawnSync("bash", ["-eo", "pipefail", "-c", run], { encoding: "utf8", env: { ...process.env, URL: "", URLS: "", ...env } }).status;
}

test("action.yml: exactly one of url and urls is still required, and a multi-line list counts as given", () => {
  assert.equal(checkExitStatus({ URLS: PAGES.join("\n") }), 0);
  assert.equal(checkExitStatus({ URL: PAGES[0] }), 0);
  assert.equal(checkExitStatus({ URL: PAGES[0], URLS: PAGES.join("\n") }), 1, "both given");
  assert.equal(checkExitStatus({}), 1, "neither given");
  assert.equal(checkExitStatus({ URLS: " \n\n  \r\n" }), 1, "a list of only whitespace is no list");
});
