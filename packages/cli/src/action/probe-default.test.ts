// #4089 (part of #4084 outcome 5): A DEFAULT ACTION RUN PRESSES NO BUTTON on the page it is pointed at.
//
// `probe-forms` defaulted to "true" here, guarded only by a word match between a button's announced name and the `task`, so
// an adopter pointing the Action at a staging app that holds seeded data had "Save", "Send" and "Submit" pressed on every
// run. It now defaults to "false" (ADR 0024, amended 2026-10-08). This reads the three SHIPPED files that carry the decision
// and RUNS the step's own argument-building script, so what is tested is the YAML a consumer gets, not a copy of its logic.
//
// EVERY CHECK IS A FUNCTION OF THE FILE'S TEXT, so the controls can hand it a mutated copy: the same function that passes the
// shipped file must FAIL the copy with the decision put back. A check that cannot be shown to fail is not a check.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

const ROOT = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "../../../..");
const read = (relative: string): string => readFileSync(resolve(ROOT, relative), "utf8");

interface Step { name?: string; id?: string; uses?: string; run?: string; with?: Record<string, string> }
const stepsOf = (workflowText: string, job: string): Step[] =>
  (parse(workflowText) as { jobs: Record<string, { steps: Step[] }> }).jobs[job].steps;

// ---- action.yml -----------------------------------------------------------------------------------------------------

function probeFormsDefault(actionText: string): unknown {
  const action = parse(actionText) as { inputs: Record<string, { default?: unknown }> };
  return action.inputs["probe-forms"].default;
}

/** The `if … fi` block of the step that builds the CLI arguments, with `${{ inputs.x }}` filled in and run under bash. */
function argumentsFor(actionText: string, inputs: Record<string, string>): string {
  const action = parse(actionText) as { runs: { steps: Step[] } };
  const script = action.runs.steps.map((step) => step.run ?? "").find((run) => run.includes("args+=(--probe-forms)"));
  assert.ok(script, "no step passes --probe-forms to the CLI");
  const lines = script.split("\n");
  const first = lines.findIndex((line) => line.includes("args+=(--probe-forms)")) - 1;
  const last = lines.findIndex((line, index) => index > first && line.trim() === "fi");
  assert.ok(first >= 0 && last > first, "the probe-forms branch is not an if … fi block this test can read");
  const block = lines.slice(first, last + 1).join("\n")
    .replace(/\$\{\{\s*inputs\.([\w-]+)\s*\}\}/g, (_, name: string) => inputs[name] ?? "");
  const run = spawnSync("bash", ["-c", `args=(--json)\n${block}\necho "ARGS: \${args[*]}"`], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout;
}

const argsLine = (output: string): string => /^ARGS: (.*)$/m.exec(output)?.[1] ?? assert.fail("no ARGS line");

test("action.yml: probe-forms defaults to \"false\"", () => {
  assert.equal(probeFormsDefault(read("action.yml")), "false");
});

test("action.yml: --probe-forms is passed only when the input is exactly \"true\"", () => {
  const action = read("action.yml");
  assert.equal(argsLine(argumentsFor(action, { "probe-forms": "true" })), "--json --probe-forms");
  for (const value of ["false", "", "True", "yes"]) {
    assert.equal(argsLine(argumentsFor(action, { "probe-forms": value })), "--json", `probe-forms: ${JSON.stringify(value)}`);
  }
});

test("action.yml: a default run says in its log that 3.3.1 and 4.1.3 were NOT assessed, and a probing run does not", () => {
  const action = read("action.yml");
  assert.match(argumentsFor(action, { "probe-forms": "false", forms: "" }), /::notice::.*3\.3\.1 and 4\.1\.3 were NOT assessed/);
  assert.doesNotMatch(argumentsFor(action, { "probe-forms": "true", forms: "" }), /::notice::/);
  // A forms config presses exactly what it names, so "no form was submitted" would be false there.
  assert.doesNotMatch(argumentsFor(action, { "probe-forms": "false", forms: "forms.yml" }), /::notice::/);
});

test("CONTROL: action.yml with the default put back to \"true\" fails the default assertion", () => {
  const regressed = read("action.yml").replace(/( {2}probe-forms:[\s\S]*?\n {4}default: )"false"/, '$1"true"');
  assert.notEqual(regressed, read("action.yml"), "the mutation changed nothing, so it controls nothing");
  assert.equal(probeFormsDefault(regressed), "true");
  assert.notEqual(probeFormsDefault(regressed), "false");
});

test("CONTROL: a step that passes --probe-forms unconditionally fails the argument assertion", () => {
  const always = read("action.yml").replace('if [ "${{ inputs.probe-forms }}" = "true" ]; then', "if true; then");
  assert.notEqual(always, read("action.yml"), "the mutation changed nothing, so it controls nothing");
  assert.equal(argsLine(argumentsFor(always, { "probe-forms": "false" })), "--json --probe-forms");
});

// ---- examples/workflow.yml ------------------------------------------------------------------------------------------

/** The explicit opt-in an adopter copies, and the comment above it that states the cost. */
function exampleOptIn(exampleText: string): { value: unknown; comment: string } {
  const steps = stepsOf(exampleText, "screen-reader");
  const witness = steps.find((step) => step.uses?.startsWith("a11ign/"));
  const lines = exampleText.split("\n");
  const at = lines.findIndex((line) => /^\s*probe-forms:\s*"true"/.test(line));
  let start = at;
  while (start > 0 && /^\s*#/.test(lines[start - 1])) start -= 1;
  return { value: witness?.with?.["probe-forms"], comment: at < 0 ? "" : lines.slice(start, Math.max(at, 0)).join("\n") };
}

test("examples/workflow.yml: sets probe-forms \"true\" explicitly and states the cost beside it", () => {
  const { value, comment } = exampleOptIn(read("examples/workflow.yml"));
  assert.equal(value, "true");
  assert.match(comment, /3\.3\.1/);
  assert.match(comment, /4\.1\.3/);
  assert.match(comment, /unreachable/);
});

test("CONTROL: an example with the explicit line deleted fails", () => {
  const without = read("examples/workflow.yml").replace(/^\s*probe-forms: "true"\n/m, "");
  assert.notEqual(without, read("examples/workflow.yml"), "the mutation changed nothing, so it controls nothing");
  assert.notEqual(exampleOptIn(without).value, "true");
});

test("CONTROL: an example whose comment no longer states the cost fails", () => {
  const silent = read("examples/workflow.yml").replace(/unreachable/g, "fine");
  assert.notEqual(silent, read("examples/workflow.yml"), "the mutation changed nothing, so it controls nothing");
  assert.doesNotMatch(exampleOptIn(silent).comment, /unreachable/);
});

// ---- .github/workflows/action-smoke.yml -----------------------------------------------------------------------------

const SMOKE = ".github/workflows/action-smoke.yml";

/** The `uses: ./` step an assertion step reads, named by `steps.<id>.outputs.result-json`. */
function runAssertedBy(steps: Step[], assertion: Step): Step | undefined {
  const id = /steps\.([\w-]+)\.outputs\.result-json/.exec(assertion.run ?? "")?.[1];
  return steps.find((step) => step.uses === "./" && step.id === id);
}

/** Every `uses: ./` run whose result is asserted to ACTIVATE something, as the run steps themselves. */
function runsAssertedToActivate(smokeText: string): Step[] {
  const steps = stepsOf(smokeText, "consumer");
  return steps.filter((step) => step.run?.includes("--expect-activation"))
    .map((assertion) => runAssertedBy(steps, assertion) ?? assert.fail(`${assertion.name}: asserts activation on no \`uses: ./\` run`));
}

/** Every `uses: ./` run with NO probe-forms input, whose result is asserted to activate NOTHING. */
function defaultRunsAssertedInert(smokeText: string): Step[] {
  const steps = stepsOf(smokeText, "consumer");
  return steps.filter((step) => step.run?.includes("activationCount") && step.run.includes("n !== 0"))
    .map((assertion) => runAssertedBy(steps, assertion) ?? assert.fail(`${assertion.name}: asserts inertness on no \`uses: ./\` run`));
}

test("action-smoke.yml: the run that asserts --expect-activation sets probe-forms \"true\", and so does every other that does", () => {
  const asserted = runsAssertedToActivate(read(SMOKE));
  assert.ok(asserted.length >= 1, "no run is asserted to activate: the probing path would be unproven");
  for (const run of asserted) assert.equal(run.with?.["probe-forms"], "true", `${run.name} asserts activation without asking for probing`);
});

test("action-smoke.yml: a run with no probe-forms input is asserted to activate NOTHING", () => {
  const inert = defaultRunsAssertedInert(read(SMOKE));
  assert.ok(inert.length >= 1, "no default run is asserted inert: the new default is unproven where it counts");
  for (const run of inert) {
    assert.equal(run.with?.["probe-forms"], undefined, `${run.name} sets probe-forms, so it is not the default run`);
    assert.ok(run.with?.task, `${run.name} names no task, so it does not exercise the word match that used to press a button`);
  }
});

test("CONTROL: run 1 without probe-forms \"true\" fails (the smoke would assert activation of a default run)", () => {
  const smoke = read(SMOKE);
  const regressed = smoke.replace(/^\s*probe-forms: "true"\n/m, "");
  assert.notEqual(regressed, smoke, "the mutation changed nothing, so it controls nothing");
  assert.ok(runsAssertedToActivate(regressed).some((run) => run.with?.["probe-forms"] !== "true"));
});

test("CONTROL: a smoke whose default run was deleted has no inert assertion", () => {
  const smoke = read(SMOKE);
  const withoutRun = smoke.replace(/\n {6}- name: A run with no probe-forms input\n[\s\S]*?(?=\n {6}- name: A default run must operate NOTHING)/, "");
  assert.notEqual(withoutRun, smoke, "the mutation changed nothing, so it controls nothing");
  assert.throws(() => defaultRunsAssertedInert(withoutRun), /asserts inertness on no `uses: \.\/` run/);
});
