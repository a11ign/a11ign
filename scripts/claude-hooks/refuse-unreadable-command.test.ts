/**
 * #5285: THE HOOK REFUSES THE SHAPE OF EVERY COMMAND THE SAFETY CHECK DENIED IN THE SIX TRANSCRIPTS, AND ALLOWS THE REWRITES.
 *
 * Acceptance: `npx rstest run --config scripts/rstest/rstest.config.ts --include scripts/claude-hooks/refuse-unreadable-command.test.ts`.
 *
 * POSITIVE CONTROL for the emptiness reading: the fixture holds six verbatim denials and the first test asserts there are six, so
 * "every denial is refused" is not vacuously true; the `allowed` list is the control the other way, so a hook that refuses everything fails.
 * The wiring test reads `.claude/settings.json`, so deleting the hook entry fails it as deleting the code does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deniedShape, refusal } from "./refuse-unreadable-command.ts";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const HOOK = "scripts/claude-hooks/refuse-unreadable-command.ts";
const FIXTURE = JSON.parse(readFileSync(`${REPO}scripts/fixtures/safety-check-denied-commands.json`, "utf8")) as {
  denied: { session: string; shape: string; command: string }[];
};
const SIX = 6;

test("the fixture is the six denials, so the loop below is not over an empty list", () => {
  assert.equal(FIXTURE.denied.length, SIX);
  assert.ok(FIXTURE.denied.every((d) => d.command.length > 0));
});

test("every verbatim denied command is refused, under the shape the fixture names", () => {
  for (const d of FIXTURE.denied) assert.equal(deniedShape(d.command), d.shape, d.session);
});

test("the sanctioned rewrites and ordinary commands are allowed", () => {
  const allowed = [
    'rm -f "${D:?}"/*.md',
    "rm -rf /home/agent/repos/wt-1/build",
    "git status && pnpm run lint",
    'bash "$S/script.sh"',
    "bash -c 'echo hi'",
    "grep -n 'foo' src/a.ts | head -5",
    'echo "$HOME"; ls',
  ];
  for (const command of allowed) assert.equal(refusal(command), null, command);
});

test("a variable removal after a pipe or `&&` is still refused", () => {
  assert.equal(deniedShape('cd x && rm -rf "$S/$m"'), "variable-target");
  assert.equal(deniedShape("ls | xargs sh -c 'rm $0'"), "nested-shell-c");
});

test("as a process: exit 2 and the rewrite on stderr for a denied command, exit 0 for an allowed one", () => {
  const run = (command: string) => spawnSync("node", [HOOK], { cwd: REPO, input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }), encoding: "utf8" });
  const denied = run(FIXTURE.denied[0]!.command);
  assert.equal(denied.status, 2);
  assert.match(denied.stderr, /scratchpad/);
  assert.equal(run("ls").status, 0);
  assert.equal(spawnSync("node", [HOOK], { cwd: REPO, input: "not json", encoding: "utf8" }).status, 0);
});

test("the hook is wired as a PreToolUse hook on Bash in .claude/settings.json", () => {
  const settings = JSON.parse(readFileSync(`${REPO}.claude/settings.json`, "utf8"));
  const entry = settings.hooks.PreToolUse.find((e: { matcher: string }) => e.matcher === "Bash");
  assert.ok(entry.hooks.some((h: { command: string }) => h.command.includes(HOOK)));
});
