// no-token: none -- reads two tracked files (the unit and package.json) and never reaches `gh`, the fleet or the network
/**
 * #4693: A `fleet-watch` THAT CRASHES BEFORE IT RUNS MUST NOT READ AS `Result=success`.
 *
 * `a11ign-fleet-watch.service` declares `SuccessExitStatus=0 1` because exit 1 is ATTENTION ("already posted"), and `pnpm run fleet:watch` turns an
 * uncaught `ERR_MODULE_NOT_FOUND` into exit 1 too. A script's exit code cannot tell the two apart, so the unit proves the module LOADS in an
 * `ExecStartPre` before the main process: `SuccessExitStatus` governs the main process only, so a failed pre-step fails the unit.
 *
 * WHAT IS PINNED: while exit 1 counts as success, the unit carries a pre-step that is not `-`-prefixed (which would swallow its failure) and
 * that imports the very file `package.json`'s `fleet:watch` runs, so the check and the script cannot drift apart.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel: string): string => readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), "utf8");

/** The `[Service]` directives with comments dropped, as [key, value] in file order. */
function serviceDirectives(unit: string): Array<[string, string]> {
  const lines = unit.split("\n").map((l) => l.trim()).filter((l) => l !== "" && !l.startsWith("#"));
  const from = lines.indexOf("[Service]");
  const rest = from < 0 ? [] : lines.slice(from + 1);
  const end = rest.findIndex((l) => l.startsWith("["));
  return (end < 0 ? rest : rest.slice(0, end)).map((l) => {
    const eq = l.indexOf("=");
    return [l.slice(0, eq), l.slice(eq + 1)] as [string, string];
  });
}

const directives = serviceDirectives(read(".agent-org/units/a11ign-fleet-watch.service"));
const values = (key: string): string[] => directives.filter(([k]) => k === key).map(([, v]) => v);

function entryOf(script: string): string {
  const scripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts;
  const entry = /packages\/control\/src\/[a-z-]+\.(?:ts|mjs)/.exec(scripts[script] ?? "");
  assert.ok(entry, `package.json has no entry point for ${script}`);
  return entry[0];
}

test("positive control: the unit parses to a ExecStart that runs fleet:watch and a SuccessExitStatus", () => {
  assert.equal(values("ExecStart").length, 1);
  assert.match(values("ExecStart")[0]!, /\bfleet:watch\b/);
  assert.equal(values("SuccessExitStatus").length, 1);
});

test("exit 1 counts as success only while a load failure is caught before the main process", () => {
  const exit1IsSuccess = values("SuccessExitStatus")[0]!.split(/\s+/).includes("1");
  if (!exit1IsSuccess) return;
  const entry = entryOf("fleet:watch");
  const preflights = values("ExecStartPre").filter((v) => !v.startsWith("-") && v.includes(`import('./${entry}')`));
  assert.equal(
    preflights.length,
    1,
    `SuccessExitStatus counts exit 1 as success, so a crash at import reads Result=success; the unit needs one non-'-' ExecStartPre importing ./${entry}`,
  );
});
