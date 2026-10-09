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

const NO_SRC_PATH = /acceptance-commands\.(mjs|ts)/;
const ACCEPTANCE_BODY_STEPS = ["Deepen the checkout if the PR asks for full history (#497)", "Run the PR's own stated Acceptance command(s)"];

/** Why the workflow still reads the commands from where they used to be, or `undefined` when it does not (ADR 0044, row #4420). */
function commandsSourceFault({ yaml, steps }: { yaml: string; steps: Step[] }): string | undefined {
  if (NO_SRC_PATH.test(yaml)) return "the workflow names an `acceptance-commands.mjs`/`.ts` file, a path into the tool's `src/` and not its declared export";
  const takers = steps.filter((step) => step.name !== undefined && ACCEPTANCE_BODY_STEPS.includes(step.name));
  if (takers.length !== ACCEPTANCE_BODY_STEPS.length) return `${takers.length} of the ${ACCEPTANCE_BODY_STEPS.length} steps that read the PR text were found`;
  const wrong = takers.find((step) => step.env?.PR_BODY !== "${{ steps.live-body.outputs.body }}");
  if (wrong) return `${wrong.name} takes PR_BODY from ${JSON.stringify(wrong.env?.PR_BODY)}, not from the live-body step's narrowed output`;
  if (!/acceptanceSourceOfThisPullRequest/.test(liveBodyOf(steps)?.run ?? "")) return "the live-body step does not ask the checkout whether the pull request adds an acceptance file, so it hands the whole body on";
  if (!/acceptanceSourceOfThisPullRequest[\s\S]*sectionsTextOf|sectionsTextOf[\s\S]*acceptanceSourceOfThisPullRequest/.test(steps.find((step) => step.name === ACCEPTANCE_BODY_STEPS[0])?.run ?? "")) {
    return "the full-history step reads the declaration from the body and not from the acceptance file the commands come from";
  }
  return undefined;
}

const COMMANDS_WIRED = `
jobs:
  run:
    steps:
      - id: live-body
        run: node -e "m.acceptanceSourceOfThisPullRequest(body)"
      - name: ${ACCEPTANCE_BODY_STEPS[0]}
        env:
          PR_BODY: "\${{ steps.live-body.outputs.body }}"
        run: node -e "file.sectionsTextOf(commands.acceptanceSourceOfThisPullRequest(process.env.PR_BODY))"
      - name: ${ACCEPTANCE_BODY_STEPS[1]}
        env:
          PR_BODY: "\${{ steps.live-body.outputs.body }}"
        run: agent-org acceptance-commands
`;

test("CONTROL: a workflow that reads its commands from the checkout is not faulted, and each way back to the body is (ADR 0044, #4420)", () => {
  const read = (yaml: string) => commandsSourceFault({ yaml, steps: stepsOf(yaml) });
  assert.equal(read(COMMANDS_WIRED), undefined);
  assert.match(read(`# see acceptance-commands.mjs\n${COMMANDS_WIRED}`) ?? "", /names an `acceptance-commands/);
  assert.match(read(COMMANDS_WIRED.replace("m.acceptanceSourceOfThisPullRequest(body)", "m.other(body)")) ?? "", /does not ask the checkout/);
  assert.match(read(COMMANDS_WIRED.replace("file.sectionsTextOf(commands.acceptanceSourceOfThisPullRequest(process.env.PR_BODY))", "process.env.PR_BODY")) ?? "", /full-history step reads the declaration from the body/);
  assert.match(read(COMMANDS_WIRED.replace("steps.live-body.outputs.body", "github.event.pull_request.body")) ?? "", /not from the live-body step's narrowed output/);
});

test("the workflow reads the commands from the checkout, through the tool's declared exports, and the last two steps take the live-body step's narrowed text (ADR 0044, #4420)", () => {
  assert.equal(commandsSourceFault({ yaml: readFileSync(WORKFLOW, "utf8"), steps: THE_TREE }), undefined);
});

/**
 * A fake `gh api <path> [--jq ...]`: for `pulls/` the PR body, which is `FAKE_STALE_BODY` for the first `FAKE_STALE_READS` reads (the Dependabot body before
 * `dependency-pr-body` rewrites it, #4479) and `FAKE_BODY` after; and for `issues/` the labels in `FAKE_LABELS[path]`, or a failure when it has none.
 */
const FAKE_GH = `#!/usr/bin/env bash
path="$2"
case "$path" in
  repos/*/pulls/*)
    reads=$(( $(cat "$FAKE_DIR/reads" 2>/dev/null || echo 0) + 1 ))
    echo "$reads" > "$FAKE_DIR/reads"
    if (( reads <= FAKE_STALE_READS )); then printf '%s' "$FAKE_STALE_BODY"; else printf '%s' "$FAKE_BODY"; fi ;;
  repos/*/issues/*) jq -ce --arg path "$path" '.[$path] | select(. != null)' <<<"$FAKE_LABELS" || exit 1 ;;
  *) exit 1 ;;
esac
`;

/** A fake `sleep` that waits for nothing and counts the waits, so the wait is measured in its number of rounds and the test takes no 90 seconds. */
const FAKE_SLEEP = `#!/usr/bin/env bash
echo "$1" >> "$FAKE_DIR/sleeps"
`;

/**
 * Reads the `Closes` line(s) of the text it is handed the way the tool's `extractClosesDeclaration` does in the one respect these tests need: its answer
 * depends on the declaration and on nothing else in the text (`kind` and the rows), so a body narrowed to its `Closes` lines parses equal to the whole.
 * `closesReferences` hands rows over as the tool does (`repo` null for a bare `#N`). `acceptanceSourceOfThisPullRequest` is the checkout's read: a file
 * when `FAKE_ADDS_FILE` is set, else the body, which is all these tests need of it.
 */
const STAND_IN_TOOL = `
export const extractClosesDeclaration = (text) => {
  const rows = [...text.matchAll(/Closes:?\\s+(?:([\\w.-]+\\/[\\w.-]+))?#(\\d+)/g)].map(([, repo, number]) => ({ repo: repo ?? null, number: Number(number) }));
  return /Closes/i.test(text) ? { kind: "closes", rows } : { kind: "missing" };
};
export const closesReferences = ({ rows }) => rows;
export const acceptanceSourceOfThisPullRequest = (body) => ({ kind: process.env.FAKE_ADDS_FILE ? "file" : "body", text: body });
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

type StepRun = { rowLabels?: Record<string, string[]>; handedOn?: string; status: number; reads: number; sleeps: string[] };
type StepInput = { body: string; labels: Record<string, string[]>; author?: string; addsFile?: boolean; stale?: { body: string; reads: number } };

const lines = (file: string): string[] => {
  try {
    return readFileSync(file, "utf8").split("\n").filter(Boolean);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new Error(`could not read ${file}`, { cause });
  }
};

/** The step output `body`, as `$GITHUB_OUTPUT` carries it: `body<<DELIMITER`, the value, then the delimiter on a line of its own. */
function bodyOutputOf(output: string): string | undefined {
  const start = /^body<<(\S+)\n/m.exec(output);
  if (!start) return undefined;
  const from = start.index + start[0].length;
  return output.slice(from, output.indexOf(`\n${start[1]}\n`, from));
}

/** Runs the live-body step's own script; returns the parsed `row-labels` output and the `body` it hands on, or the failure, with how often the body was read and each wait. */
function runLiveBodyStep(input: StepInput): StepRun {
  const dir = mkdtempSync(join(tmpdir(), "row-labels-"));
  try {
    const bin = join(dir, "bin");
    mkdirSync(bin);
    for (const [name, script] of [["gh", FAKE_GH], ["sleep", FAKE_SLEEP]]) {
      writeFileSync(join(bin, name), script);
      chmodSync(join(bin, name), EXECUTABLE);
    }
    installStandInTool(join(dir, "tool"));
    const output = join(dir, "output");
    writeFileSync(output, "");
    const script = liveBodyOf(THE_TREE)?.run ?? "";
    const ran = spawnSync("bash", ["-e", "-c", script], {
      encoding: "utf8",
      env: {
        PATH: `${bin}:${process.env.PATH}`, HOME: dir, GITHUB_OUTPUT: output, AGENT_ORG_TOOL: join(dir, "tool"), FAKE_DIR: dir,
        GH_TOKEN: "not-a-real-token", REPO: "a11ign/a11ign", PR_NUMBER: "7", PR_AUTHOR: input.author ?? "a-person",
        FAKE_BODY: input.body, FAKE_LABELS: JSON.stringify(input.labels),
        FAKE_STALE_BODY: input.stale?.body ?? "", FAKE_STALE_READS: String(input.stale?.reads ?? 0),
        ...(input.addsFile ? { FAKE_ADDS_FILE: "1" } : {}),
      },
    });
    const written = readFileSync(output, "utf8");
    const line = written.split("\n").find((entry) => entry.startsWith("row-labels="));
    const rowLabels = line === undefined ? undefined : JSON.parse(line.slice("row-labels=".length));
    return { status: ran.status ?? -1, rowLabels, handedOn: bodyOutputOf(written), reads: Number(lines(join(dir, "reads")).at(-1) ?? 0), sleeps: lines(join(dir, "sleeps")) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const BODY = "## Acceptance\n\nnode -e 0\n\n";

test("CONTROL: the harness reads a row's labels through the step, so an empty answer below is not the harness failing to run", () => {
  const ran = runLiveBodyStep({ body: `${BODY}Closes #4107\n`, labels: { "repos/a11ign/a11ign/issues/4107": ["defect", "ready"] } });
  assert.deepEqual([ran.status, ran.rowLabels], [0, { "a11ign/a11ign#4107": ["defect", "ready"] }]);
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

/**
 * #4479: A DEPENDABOT PR'S BODY IS READ AGAIN UNTIL `dependency-pr-body` HAS REWRITTEN IT, AND NO OTHER AUTHOR'S IS. The rewrite lands within a minute of the
 * event and the read can come first (#4472), so a read that sees the bare "Bumps [...]" body failed `ACCEPTANCE: MISSING` with nobody to own it. The wait is
 * counted in rounds because the harness's `sleep` waits for nothing: 18 rounds of 5 seconds is the 90 seconds the row asks for.
 */
const DEPENDABOT = "dependabot[bot]";
const BARE_BODY = "Bumps [yaml](https://github.com/eemeli/yaml) from 2.8.0 to 2.8.1.\n";
const STAMPED_BODY = "Dependency update by dependabot[bot] (ADR 0041): bump yaml from 2.8.0 to 2.8.1.\n\nAcceptance:\nnode -e 0\n\nCloses: none -- dependency update\n";
const WAIT_ROUNDS = 18;
const WAIT_SECONDS = "5";

test("CONTROL: a Dependabot body already stamped is read once and waited for never, so the waits below are the missing section's doing", () => {
  const ran = runLiveBodyStep({ body: STAMPED_BODY, labels: {}, author: DEPENDABOT });
  assert.deepEqual([ran.status, ran.reads, ran.sleeps], [0, 1, []]);
});

test("a Dependabot body that gains its Acceptance section later is read again until it does, 5 seconds apart (#4479)", () => {
  const ran = runLiveBodyStep({ body: STAMPED_BODY, labels: {}, author: DEPENDABOT, stale: { body: BARE_BODY, reads: 3 } });
  assert.deepEqual([ran.status, ran.reads, ran.sleeps], [0, 4, [WAIT_SECONDS, WAIT_SECONDS, WAIT_SECONDS]]);
});

test("a Dependabot body that NEVER gains the section is waited for a bounded 90 seconds and then passed on as it is, for the tool to refuse", () => {
  const ran = runLiveBodyStep({ body: BARE_BODY, labels: {}, author: DEPENDABOT });
  assert.equal(ran.status, 0, "the step does not invent a failure of its own: the tool refuses the body with its own message");
  assert.deepEqual([ran.reads, ran.sleeps.length, new Set(ran.sleeps)], [WAIT_ROUNDS + 1, WAIT_ROUNDS, new Set([WAIT_SECONDS])]);
});

test("its twin: any other author reads once and never waits, however bare the body", () => {
  for (const author of ["a-person", "not-dependabot[bot]", "dependabot[bot]-lookalike", ""]) {
    const ran = runLiveBodyStep({ body: BARE_BODY, labels: {}, author, stale: { body: BARE_BODY, reads: 3 } });
    assert.deepEqual([author, ran.status, ran.reads, ran.sleeps], [author, 0, 1, []]);
  }
});

/**
 * ADR 0044, #4420: A PULL REQUEST THAT ADDS AN ACCEPTANCE FILE HAS ITS COMMANDS READ FROM THE CHECKOUT, so the step hands on the `Closes` declaration and not the
 * body that carries the commands. Its twin is the deprecated fallback: with no file the whole body is handed on, because a Dependabot pull request's `Acceptance:`
 * is written into the body by `dependency-pr-body` and would otherwise be MISSING.
 */
const PROSE_AND_COMMANDS = "Prose that is anybody's to edit.\n\nAcceptance:\n```bash\nnode -e 0\n```\n\nCloses #4107\n\nMore prose.\n";

test("CONTROL: with no acceptance file the whole body is handed on, so the narrowing below is the file's doing", () => {
  const ran = runLiveBodyStep({ body: PROSE_AND_COMMANDS, labels: {} });
  assert.deepEqual([ran.status, ran.handedOn], [0, PROSE_AND_COMMANDS.trimEnd()]);
});

test("with an acceptance file only the `Closes` declaration is handed on: no command and no prose reaches the next steps (ADR 0044, #4420)", () => {
  const ran = runLiveBodyStep({ body: PROSE_AND_COMMANDS, labels: {}, addsFile: true });
  assert.deepEqual([ran.status, ran.handedOn], [0, "Closes #4107"]);
});

test("its twin: a file with a body that declares no `Closes` hands on nothing, which the tool reports as CLOSES: MISSING", () => {
  const ran = runLiveBodyStep({ body: "Only prose.\n\nAcceptance:\nnode -e 0\n", labels: {}, addsFile: true });
  assert.deepEqual([ran.status, ran.handedOn], [0, ""]);
});

test("the rows are still read from the narrowed text, so the labels are the same with a file as without", () => {
  const labels = { "repos/a11ign/a11ign/issues/4107": ["defect"] };
  assert.deepEqual(runLiveBodyStep({ body: PROSE_AND_COMMANDS, labels, addsFile: true }).rowLabels, runLiveBodyStep({ body: PROSE_AND_COMMANDS, labels }).rowLabels);
});
