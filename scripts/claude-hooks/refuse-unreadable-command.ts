// @ts-check
// command: a Claude Code PreToolUse hook for Bash (wired in `.claude/settings.json`), the guard of failure class `safety-check-denied` (#5285)
//
// ## Why it exists
//
// Claude Code's built-in safety check refuses commands it cannot read, and the refusal STOPS THE TURN until a person answers it. Six
// denials were read from their transcripts (`scripts/fixtures/safety-check-denied-commands.json`, verbatim) and five of the six contain
// NO removal: they are a nested `bash -c` whose string carries a `$` expansion. The sixth is `rm -rf "$S/$m"`, a removal whose
// target is a variable. The engineer brief named the word `rm`, so it described one of six, and it is read only by engineers.
// This hook is read by every role that runs in this repository, because `.claude/settings.json` is.
//
// ## What it refuses, and what that claim is
//
// 1. `nested-shell-c`: `bash|sh|zsh|dash|ksh -c` anywhere in the command with a `$` or a backtick after it.
// 2. `variable-target`: an `rm` or `unlink` argument containing `$` and no `:?` guard (`"${D:?}"/x` is the sanctioned form).
//
// These are the shapes the six denials SHARE, inferred from six samples: they are not the check's own rule, which is not published.
// A command refused here that the check would have allowed costs one rewrite; one it would have stopped costs a turn.
//
// ## Contract
//
// Reads the hook JSON on stdin. Exit 2 with the rewrite on stderr refuses the call (the model reads stderr); exit 0 allows it.
// An unreadable input allows: a guard that blocks everything when its input changes shape is worse than the check it precedes.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export type DeniedShape = "nested-shell-c" | "variable-target";

const NESTED_SHELL_C = /\b(?:ba|z|da|k)?sh\s+(?:-[A-Za-z]+\s+)*-[A-Za-z]*c\b([\s\S]*)/;
const REMOVER = /^(?:(?:do|then|else|\{|\()\s+)?(?:sudo\s+)?(?:rm|unlink)\s+(.*)$/;
const SEGMENT_BREAK = /&&|\|\||[;|&\n]|\$\(|\)|`/;

function carriesExpansion(rest: string): boolean {
  return rest.includes("$") || rest.includes("`");
}

function hasNestedShellC(command: string): boolean {
  const match = NESTED_SHELL_C.exec(command);
  return match !== null && carriesExpansion(match[1] ?? "");
}

function hasVariableTargetRemoval(command: string): boolean {
  return command
    .split(SEGMENT_BREAK)
    .map((segment) => REMOVER.exec(segment.trim()))
    .some((match) => match !== null && (match[1] ?? "").split(/\s+/).some((arg) => !arg.startsWith("-") && arg.includes("$") && !arg.includes(":?")));
}

export function deniedShape(command: string): DeniedShape | null {
  if (hasNestedShellC(command)) return "nested-shell-c";
  if (hasVariableTargetRemoval(command)) return "variable-target";
  return null;
}

const REWRITES: Record<DeniedShape, string> = {
  "nested-shell-c":
    "Claude Code's safety check cannot read a nested `bash -c` that carries `$`, and a command it cannot read stops the turn. Write the script to a file in your scratchpad and run that file, or run the commands directly without the nested shell.",
  "variable-target":
    'Claude Code\'s safety check cannot resolve a removal whose target is a variable. Use a literal path, or `"${VAR:?}/name"` (`.claude/rules/guards-and-assertions.md`). A scratchpad is swept, so you rarely need the removal at all.',
};

export function refusal(command: string): string | null {
  const shape = deniedShape(command);
  return shape === null ? null : `REFUSED (${shape}, failure class safety-check-denied, a11ign#5285): ${REWRITES[shape]}`;
}

function commandOf(stdin: string): string {
  try {
    const input = JSON.parse(stdin);
    return input?.tool_name === "Bash" && typeof input.tool_input?.command === "string" ? input.tool_input.command : "";
  } catch {
    return "";
  }
}

const REFUSE_EXIT = 2;

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const message = refusal(commandOf(readFileSync(0, "utf8")));
  if (message !== null) {
    process.stderr.write(`${message}\n`);
    process.exit(REFUSE_EXIT);
  }
}
