/**
 * #3924: a documented `pnpm run <script> -- -e job=x` cannot run when the script is a bare `ansible-playbook`.
 *
 * pnpm 10 forwards the literal `--` to the script (measured 2026-10-07: `pnpm run t -- -e job=x` gives the script `["--","-e","job=x"]`,
 * `pnpm run t -e job=x` gives `["-e","job=x"]`; npm strips it). A script that is `ansible-playbook <file>` then reads `--` as the end of its
 * options and `-e` as a playbook: `the playbook: -e could not be found`, a parse error before anything is dispatched (#3919 fixed it for
 * `lab:job` by wrapping it in node; `lab:status` and `lab:stop` are still bare). The documented form is the one WITHOUT the `--`.
 *
 * THE POPULATION IS READ, NOT LISTED: every `package.json` script whose command is `ansible-playbook` is one that forwards its argv unstripped,
 * so a script added tomorrow is covered by the same read. `docs/backlog.md` is the RECORD of past runs and is not a documented form.
 *
 * POSITIVE CONTROLS: the population holds `lab:status` and `lab:stop`; a fixture with the `--` form, one wrapped across a line break, and an
 * `npm run` one are each flagged; the form without `--`, and `lab:job` (a node wrapper that strips it), are not.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const RECORD = new Set(["docs/backlog.md"]);

/** The scripts that hand their whole argv to `ansible-playbook` as written in `package.json`. */
export function ansibleScripts(scripts: Record<string, string>): string[] {
  return Object.entries(scripts).filter(([, command]) => /\bansible-playbook\b/.test(command)).map(([name]) => name);
}

/** The documented examples that put `--` after one of `scripts`; a line wrap between the words does not hide one. */
export function doubleDashExamples(text: string, scripts: string[]): string[] {
  const names = scripts.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const found = new RegExp(`\\b(?:pnpm|npm)\\s+run\\s+(?:${names})\\s+--(?=\\s)`, "g");
  return [...text.matchAll(found)].map((match) => match[0].replace(/\s+/g, " "));
}

const SCRIPTS = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")).scripts as Record<string, string>;

test("POSITIVE CONTROL: the population is read from package.json and holds lab:status and lab:stop, not the node wrapper lab:job", () => {
  const population = ansibleScripts(SCRIPTS);
  assert.ok(population.includes("lab:status") && population.includes("lab:stop"), population.join(","));
  assert.ok(!population.includes("lab:job"), "lab:job is a node wrapper that strips the --");
});

test("POSITIVE CONTROL: the `--` form is flagged, wrapped or under npm, and the form without it is not", () => {
  const population = ["lab:status", "lab:stop"];
  assert.deepEqual(doubleDashExamples("run `pnpm run lab:status -- -e job=capture`", population), ["pnpm run lab:status --"]);
  assert.deepEqual(doubleDashExamples("or use `pnpm run\n  lab:stop -- -e job=<name>` to end it", population), ["pnpm run lab:stop --"]);
  assert.deepEqual(doubleDashExamples("npm run lab:status -- -e job=x", population), ["npm run lab:status --"]);
  assert.deepEqual(doubleDashExamples("pnpm run lab:status -e job=capture\npnpm run lab:job -- -e job=x\npnpm run lab:status", population), []);
});

test("no documented example puts `--` after a script that forwards its argv to ansible-playbook", () => {
  const tracked = execFileSync("git", ["ls-files", "*.md"], { cwd: REPO_ROOT, encoding: "utf8" }).split("\n").filter((file) => file && !RECORD.has(file));
  assert.ok(tracked.length > 50, `read ${tracked.length} documents`);
  const population = ansibleScripts(SCRIPTS);
  const offenders = tracked.flatMap((file) => doubleDashExamples(readFileSync(join(REPO_ROOT, file), "utf8"), population).map((hit) => `${file}: ${hit}`));
  assert.deepEqual(offenders, []);
});
