// no-token: gh -- runs the workflow's own step script against a fake `gh` and a stand-in tool in a temp directory; no `gh` or network is reached
/**
 * #4138: CI'S ACCEPTANCE JOB IS GIVEN THE LABELS OF THE ROWS A PR CLOSES, so the `Class:` check of #4123 refuses in CI and not only in `pr:open`.
 *
 * `reusable-acceptance.yml` passes its last step no token (the author's own `Acceptance:` command runs in it), so `acceptance-commands` reads the labels
 * from `ACCEPTANCE_ROW_LABELS` and prints `CLASS: NOT CHECKED` and PASSES when it is unset. The `live-body` step is the one that holds a token, so it
 * reads the labels and hands them on as the step output `row-labels`.
 *
 * WHAT IS PINNED, in two halves. THE WIRING (read off the parsed workflow): the final step's `env:` carries `ACCEPTANCE_ROW_LABELS` from the live-body
 * step's output, as data and never in a `run:`, and carries no token. THE STEP'S BEHAVIOUR (its own `run:` script executed under bash against a fake `gh`):
 * a row whose read fails gets NO ENTRY, never `[]`, because the tool reads an absent row as `CLASS: UNKNOWN` and refuses while `[]` reads as "no `defect`
 * label" and passes. Each case has a twin that changes one fact.
 *
 * THE TOOL IS A STAND-IN HERE: `extractClosesDeclaration` and `closesReferences` are agent-org's and are tested there; the stand-in lists the rows the
 * body's `Closes` line names, so what this file tests is what THIS step does with them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const WORKFLOW = join(REPO, ".github/workflows/reusable-acceptance.yml");
const EXECUTABLE = 0o755;
const ROW_CAP = 20;
const FIRST_ROW = 100;
const OUTPUT = "${{ steps.live-body.outputs.row-labels }}";

type Step = { id?: string; name?: string; run?: string; env?: Record<string, string> };
type Workflow = { jobs: { run: { steps: Step[] } } };

const stepsOf = (yaml: string): Step[] => (parseYaml(yaml) as Workflow).jobs.run.steps;
const liveBodyOf = (steps: Step[]) => steps.find((step) => step.id === "live-body");
const finalOf = (steps: Step[]) => steps[steps.length - 1];
const THE_TREE = stepsOf(readFileSync(WORKFLOW, "utf8"));

const WIRED = `
jobs:
  run:
    steps:
      - id: live-body
        env: { GH_TOKEN: "\${{ github.token }}" }
        run: echo hi
      - name: Run the PR's own stated Acceptance command(s)
        env:
          PR_BODY: "\${{ steps.live-body.outputs.body }}"
          ACCEPTANCE_ROW_LABELS: "${OUTPUT}"
        run: agent-org acceptance-commands
`;

/** Why the final step is NOT wired as required, or `undefined` when it is. */
function finalStepFault(steps: Step[]): string | undefined {
  const last = finalOf(steps);
  if (last.env?.ACCEPTANCE_ROW_LABELS !== OUTPUT) return `ACCEPTANCE_ROW_LABELS is ${JSON.stringify(last.env?.ACCEPTANCE_ROW_LABELS)}, not the live-body step's output`;
  const credential = Object.entries(last.env).find(([name, value]) => /token|secret/i.test(name) || /github\.token|secrets\./.test(value));
  if (credential) return `the final step is handed ${credential[0]}`;
  if (/\$\{\{/.test(last.run ?? "")) return "the final step interpolates an expression into its shell text";
  return undefined;
}

test("CONTROL: a final step wired as the row asks is not faulted, and each one-fact change is", () => {
  assert.equal(finalStepFault(stepsOf(WIRED)), undefined);
  assert.match(finalStepFault(stepsOf(WIRED.replace(`ACCEPTANCE_ROW_LABELS: "${OUTPUT}"`, "OTHER: x"))) ?? "", /ACCEPTANCE_ROW_LABELS is undefined/);
  assert.match(finalStepFault(stepsOf(WIRED.replace("row-labels", "labels"))) ?? "", /not the live-body step's output/);
  assert.match(finalStepFault(stepsOf(WIRED.replace("PR_BODY:", 'GH_TOKEN: "${{ github.token }}"\n          PR_BODY:'))) ?? "", /handed GH_TOKEN/);
  assert.match(finalStepFault(stepsOf(WIRED.replace("run: agent-org acceptance-commands", 'run: echo "${{ steps.live-body.outputs.row-labels }}"'))) ?? "", /interpolates/);
});

test("the final step takes ACCEPTANCE_ROW_LABELS from the live-body step's output as data, and holds no token (#4138)", () => {
  assert.ok(liveBodyOf(THE_TREE), "the live-body step is not found, so the wiring below would be read off nothing");
  assert.equal(finalStepFault(THE_TREE), undefined);
});

/** A fake `gh api <path> [--jq ...]`: the PR body for `pulls/`, and for `issues/` the labels in `FAKE_LABELS[path]`, or a failure when it has none. */
const FAKE_GH = `#!/usr/bin/env bash
path="$2"
case "$path" in
  repos/*/pulls/*) printf '%s' "$FAKE_BODY" ;;
  repos/*/issues/*) jq -ce --arg path "$path" '.[$path] | select(. != null)' <<<"$FAKE_LABELS" || exit 1 ;;
  *) exit 1 ;;
esac
`;

/** Lists `Closes #N` and `Closes owner/repo#N` the way the tool's `closesReferences` hands rows over (`repo` null for a bare `#N`). */
const STAND_IN_TOOL = `
export const extractClosesDeclaration = (body) => ({ kind: "closes", body });
export const closesReferences = ({ body }) =>
  [...body.matchAll(/Closes:?\\s+(?:([\\w.-]+\\/[\\w.-]+))?#(\\d+)/g)].map(([, repo, number]) => ({ repo: repo ?? null, number: Number(number) }));
`;

/**
 * The stand-in is reached the way the real tool is (#4411): by the `agent-org/acceptance-commands` name its `package.json` DECLARES in `exports`, under
 * the tool's own `tsx`, so a step that went back to an `src/` path would not find `src/acceptance-commands.ts` named anywhere it reads.
 */
function installStandInTool(root: string): void {
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "node_modules"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "agent-org", type: "module", exports: { "./acceptance-commands": "./src/stand-in.ts" } }));
  writeFileSync(join(root, "src/stand-in.ts"), STAND_IN_TOOL);
  symlinkSync(join(REPO, "node_modules/tsx"), join(root, "node_modules/tsx"));
}

/** Runs the live-body step's own script; returns the parsed `row-labels` output, or the failure. */
function runLiveBodyStep(input: { body: string; labels: Record<string, string[]> }): { rowLabels?: Record<string, string[]>; status: number } {
  const dir = mkdtempSync(join(tmpdir(), "row-labels-"));
  try {
    const bin = join(dir, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "gh"), FAKE_GH);
    chmodSync(join(bin, "gh"), EXECUTABLE);
    installStandInTool(join(dir, "tool"));
    const output = join(dir, "output");
    writeFileSync(output, "");
    const script = liveBodyOf(THE_TREE)?.run ?? "";
    const ran = spawnSync("bash", ["-e", "-c", script], {
      encoding: "utf8",
      env: {
        PATH: `${bin}:${process.env.PATH}`, HOME: dir, GITHUB_OUTPUT: output, AGENT_ORG_TOOL: join(dir, "tool"),
        GH_TOKEN: "not-a-real-token", REPO: "a11ign/a11ign", PR_NUMBER: "7",
        FAKE_BODY: input.body, FAKE_LABELS: JSON.stringify(input.labels),
      },
    });
    const line = readFileSync(output, "utf8").split("\n").find((entry) => entry.startsWith("row-labels="));
    return { status: ran.status ?? -1, rowLabels: line === undefined ? undefined : JSON.parse(line.slice("row-labels=".length)) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const BODY = "## Acceptance\n\nnode -e 0\n\n";

test("CONTROL: the harness reads a row's labels through the step, so an empty answer below is not the harness failing to run", () => {
  const ran = runLiveBodyStep({ body: `${BODY}Closes #4107\n`, labels: { "repos/a11ign/a11ign/issues/4107": ["defect", "ready"] } });
  assert.deepEqual(ran, { status: 0, rowLabels: { "a11ign/a11ign#4107": ["defect", "ready"] } });
});

test("a row whose label read FAILS gets no entry, never `[]` (#4138)", () => {
  const ran = runLiveBodyStep({ body: `${BODY}Closes #4107\n`, labels: {} });
  assert.equal(ran.status, 0, "a failed read of a row does not fail the job: the tool refuses that row as UNKNOWN");
  assert.deepEqual(ran.rowLabels, {});
});

test("its twin: a row that really carries NO labels is `[]`, which is an answer and not a failed read", () => {
  const ran = runLiveBodyStep({ body: `${BODY}Closes #4107\n`, labels: { "repos/a11ign/a11ign/issues/4107": [] } });
  assert.deepEqual(ran.rowLabels, { "a11ign/a11ign#4107": [] });
});

test("one failed row does not take its sibling's entry with it, and a named repository is read in its own repository", () => {
  const body = `${BODY}Closes #4107, other/repo#9, other/repo#10\n`.replace(/, /g, "\nCloses ");
  const ran = runLiveBodyStep({ body, labels: { "repos/other/repo/issues/9": ["defect"], "repos/a11ign/a11ign/issues/4107": [] } });
  assert.deepEqual(ran.rowLabels, { "a11ign/a11ign#4107": [], "other/repo#9": ["defect"] }, "other/repo#10 failed and has no key");
});

test("a body that closes no row writes `{}`, which the tool reads as 'nothing to check' and not as a missing supply", () => {
  assert.deepEqual(runLiveBodyStep({ body: `${BODY}Closes: none -- a docs change\n`, labels: {} }).rowLabels, {});
});

test("a row past the cap gets no entry, so a body naming many rows cannot buy a pass by exhausting the reads", () => {
  const rows = Array.from({ length: ROW_CAP + 2 }, (_, index) => FIRST_ROW + index);
  const labels = Object.fromEntries(rows.map((row) => [`repos/a11ign/a11ign/issues/${row}`, ["ready"]]));
  const ran = runLiveBodyStep({ body: `${BODY}${rows.map((row) => `Closes #${row}`).join("\n")}\n`, labels });
  assert.equal(Object.keys(ran.rowLabels ?? {}).length, ROW_CAP);
  assert.equal(ran.rowLabels?.[`a11ign/a11ign#${FIRST_ROW + ROW_CAP + 1}`], undefined);
});

test("a row name that is not `owner/repo#N` never reaches an API path, and its twin with a plain name does", () => {
  const labels = { "repos/a/../issues/5": ["ready"], "repos/b/c/issues/5": ["ready"] };
  const ran = runLiveBodyStep({ body: `${BODY}Closes a/..#5\nCloses b/c#5\n`, labels });
  assert.deepEqual(ran.rowLabels, { "b/c#5": ["ready"] });
});
