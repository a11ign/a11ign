// no-token: gh -- runs the workflow's own step scripts against a fake `gh`, a fake `git` and a stand-in tool in a temp directory; no `gh` or network is reached
/**
 * #4857 (found on a11ign#4854): THE CORE'S ACCEPTANCE STEPS HAND THE READER THE PULL REQUEST'S AUTHOR, so ADR 0044's Dependabot exemption can be taken.
 *
 * In `agent-org` the reader's third argument is the author, and the exemption (`BODY_EXEMPT_AUTHORS`) applies only to it: the tool does not read `PR_AUTHOR`
 * itself on that call. a11ign#4834 put `PR_AUTHOR` in the steps' `env:` and stopped there, so a Dependabot pull request that adds no `.acceptance/` file was
 * narrowed to its `Closes` line by the `live-body` step and its Acceptance read as missing.
 *
 * WHAT IS PINNED, in two halves. THE WIRING (read off the parsed workflow): every call of the reader in a step's `run:` passes `process.env.PR_AUTHOR` as its
 * third argument, and the step it is in carries `PR_AUTHOR` in its `env:` from the event, never from the body. THE BEHAVIOUR (the two steps' own scripts run under
 * bash): with the author handed in, an exempt author's body survives the `live-body` step whole and the full-history step reads its `History: full`; a
 * twin that changes only the author narrows the first and does not deepen the second.
 *
 * POSITIVE CONTROLS live in this file: the tree is read to hold at least two calls (a count that went to 0 would pass every `for` below), and the file as it
 * stood at core `da027c092` (the two calls with the body alone, inlined as `AS_AT_DA027C092`) must be faulted. THE TOOL IS A STAND-IN: the real
 * `resolveAcceptanceSource` is agent-org's and tested there; the stand-in has its three outcomes (`file`, `body` for an exempt author, else `refused`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const WORKFLOW = join(REPO, ".github/workflows/reusable-acceptance.yml");
const EXECUTABLE = 0o755;
const CALL = "acceptanceSourceOfThisPullRequest(";
const AUTHOR_ARGUMENT = "process.env.PR_AUTHOR";
const AUTHOR_FROM_THE_EVENT = "${{ github.event.pull_request.user.login }}";
const AUTHOR_ARGUMENT_INDEX = 2;
const CALLS_THE_WORKFLOW_HOLDS = 2;
const FULL_HISTORY_STEP = "Deepen the checkout if the PR asks for full history (#497)";

type Step = { id?: string; name?: string; run?: string; env?: Record<string, string> };
type Workflow = { jobs: { run: { steps: Step[] } } };

const stepsOf = (yaml: string): Step[] => (parseYaml(yaml) as Workflow).jobs.run.steps;
const THE_TREE = stepsOf(readFileSync(WORKFLOW, "utf8"));

/** The top-level arguments of every call of the reader in `text`, each as the trimmed source of one argument. A call left unclosed has no entry. */
function argumentsOfCalls(text: string): string[][] {
  const calls: string[][] = [];
  for (let at = text.indexOf(CALL); at !== -1; at = text.indexOf(CALL, at + CALL.length)) {
    const parsed = argumentsFrom(text, at + CALL.length);
    if (parsed) calls.push(parsed);
  }
  return calls;
}

/** The arguments from just past an opening parenthesis to its match, splitting on commas at depth 0; nested brackets and quotes are one argument's own. */
function argumentsFrom(text: string, start: number): string[] | undefined {
  const args: string[] = [];
  let depth = 0;
  let quote = "";
  let current = "";
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
    } else if ("([{".includes(ch)) {
      depth++;
    } else if (")]}".includes(ch)) {
      if (depth === 0) return [...args, current.trim()];
      depth--;
    } else if (ch === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  return undefined;
}

/** Why the workflow does not hand the reader the author at every call, or `undefined` when it does. */
function authorFault(steps: Step[]): string | undefined {
  const callers = steps.filter((step) => (step.run ?? "").includes(CALL));
  const calls = callers.flatMap((step) => argumentsOfCalls(step.run ?? ""));
  if (calls.length < CALLS_THE_WORKFLOW_HOLDS) return `${calls.length} calls of the reader were found, not the ${CALLS_THE_WORKFLOW_HOLDS} this guard was written about`;
  const counted = callers.reduce((n, step) => n + ((step.run ?? "").split(CALL).length - 1), 0);
  if (counted !== calls.length) return `${counted} calls of the reader are written and ${calls.length} could be read`;
  const without = calls.find((args) => args[AUTHOR_ARGUMENT_INDEX] !== AUTHOR_ARGUMENT);
  if (without) return `a call of the reader is (${without.join(", ")}): its third argument is ${JSON.stringify(without[AUTHOR_ARGUMENT_INDEX])}, not ${AUTHOR_ARGUMENT}`;
  const unfed = callers.find((step) => step.env?.PR_AUTHOR !== AUTHOR_FROM_THE_EVENT);
  if (unfed) return `${unfed.name ?? unfed.id} passes ${AUTHOR_ARGUMENT} but its env PR_AUTHOR is ${JSON.stringify(unfed.env?.PR_AUTHOR)}, not the event's`;
  return undefined;
}

/** The two calls as they were at core `da027c092`: the body alone, with `PR_AUTHOR` in each step's `env:` and used by neither. */
const AS_AT_DA027C092 = `
jobs:
  run:
    steps:
      - id: live-body
        env: { PR_AUTHOR: "${AUTHOR_FROM_THE_EVENT}" }
        run: |
          node -e "
            load('acceptance-commands').then((m) => {
              const body = process.env.PR_BODY;
              if (m.acceptanceSourceOfThisPullRequest(body).kind === 'body') return process.stdout.write(body);
            });
          "
      - name: ${FULL_HISTORY_STEP}
        env: { PR_AUTHOR: "${AUTHOR_FROM_THE_EVENT}" }
        run: |
          node -e "
            Promise.all([load('acceptance-commands'), load('acceptance-file')]).then(([commands, file]) => {
              const text = file.sectionsTextOf(commands.acceptanceSourceOfThisPullRequest(process.env.PR_BODY));
            });
          "
`;
const HANDED_THE_AUTHOR = AS_AT_DA027C092
  .replace("acceptanceSourceOfThisPullRequest(body)", `acceptanceSourceOfThisPullRequest(body, process.cwd(), ${AUTHOR_ARGUMENT})`)
  .replace("acceptanceSourceOfThisPullRequest(process.env.PR_BODY)", `acceptanceSourceOfThisPullRequest(process.env.PR_BODY, process.cwd(), ${AUTHOR_ARGUMENT})`);

test("CONTROL: the file as it was at da027c092 is faulted, the same file with both calls handed the author is not, and each one-fact change is", () => {
  assert.match(authorFault(stepsOf(AS_AT_DA027C092)) ?? "", /third argument is undefined/);
  assert.equal(authorFault(stepsOf(HANDED_THE_AUTHOR)), undefined);
  const onlyOne = HANDED_THE_AUTHOR.replace(`acceptanceSourceOfThisPullRequest(body, process.cwd(), ${AUTHOR_ARGUMENT})`, "acceptanceSourceOfThisPullRequest(body)");
  assert.match(authorFault(stepsOf(onlyOne)) ?? "", /acceptanceSourceOfThisPullRequest|third argument/);
  assert.match(authorFault(stepsOf(HANDED_THE_AUTHOR.replace(AUTHOR_ARGUMENT, "process.env.PR_BODY"))) ?? "", /not process\.env\.PR_AUTHOR/);
  assert.match(authorFault(stepsOf(HANDED_THE_AUTHOR.replace(`PR_AUTHOR: "${AUTHOR_FROM_THE_EVENT}"`, 'PR_AUTHOR: "someone"'))) ?? "", /not the event's/);
  assert.match(authorFault(stepsOf(HANDED_THE_AUTHOR.replaceAll("acceptanceSourceOfThisPullRequest", "readIt"))) ?? "", /0 calls/);
});

test("every call of the reader in the workflow hands it process.env.PR_AUTHOR, from a step whose env takes it from the event (#4857)", () => {
  const found = THE_TREE.flatMap((step) => argumentsOfCalls(step.run ?? "")).length;
  assert.ok(found >= CALLS_THE_WORKFLOW_HOLDS, `${found} calls were found, so the check below would pass over nothing`);
  assert.equal(authorFault(THE_TREE), undefined);
});

const STAND_IN_COMMANDS = `
const EXEMPT = ["dependabot[bot]", "app/dependabot"];
export const acceptanceSourceOfThisPullRequest = (body, cwd, author) => {
  if (process.env.FAKE_ADDS_FILE) return { kind: "file", text: "Acceptance: node -e 0" };
  return EXEMPT.includes(author) ? { kind: "body", text: body, author } : { kind: "refused", author };
};
export const extractClosesDeclaration = (text) => (/Closes/i.test(text) ? { kind: "closes" } : { kind: "missing" });
export const closesReferences = () => [];
export const hasFullHistoryDeclaration = (text) => /^History:\\s*full/m.test(text);
`;
const STAND_IN_FILE = `
export const sectionsTextOf = (source) => (source.kind === "refused" ? "" : source.text);
`;
const FAKE_GH = `#!/usr/bin/env bash
case "$2" in
  repos/*/pulls/*) printf '%s' "$FAKE_BODY" ;;
  *) exit 1 ;;
esac
`;
const FAKE_GIT = `#!/usr/bin/env bash
echo "$@" >> "$FAKE_GIT_LOG"
`;

/** The tool as the workflow reaches it: by names its `package.json` DECLARES in `exports`. */
function installStandInTool(root: string): void {
  mkdirSync(join(root, "src"), { recursive: true });
  const exports = { "./acceptance-commands": "./src/commands.mjs", "./acceptance-file": "./src/file.mjs" };
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "agent-org", type: "module", exports }));
  writeFileSync(join(root, "src/commands.mjs"), STAND_IN_COMMANDS);
  writeFileSync(join(root, "src/file.mjs"), STAND_IN_FILE);
}

type Scene = { body: string; author: string; addsFile?: boolean };
type StepRun = { status: number; stdout: string; output: string; gitCalls: string[] };

/** Runs one step's own `run:` script, with `PR_BODY` and `PR_AUTHOR` as the workflow's `env:` would give them. */
function runStep({ script, scene }: { script: string; scene: Scene }): StepRun {
  const dir = mkdtempSync(join(tmpdir(), "hands-author-"));
  try {
    const bin = join(dir, "bin");
    mkdirSync(bin);
    for (const [name, text] of [["gh", FAKE_GH], ["git", FAKE_GIT]]) {
      writeFileSync(join(bin, name), text);
      chmodSync(join(bin, name), EXECUTABLE);
    }
    installStandInTool(join(dir, "tool"));
    const [output, gitLog] = [join(dir, "output"), join(dir, "git.log")];
    writeFileSync(output, "");
    const ran = spawnSync("bash", ["-e", "-c", script], {
      encoding: "utf8",
      env: {
        PATH: `${bin}:${process.env.PATH}`, HOME: dir, GITHUB_OUTPUT: output, AGENT_ORG_TOOL: join(dir, "tool"), GH_TOKEN: "not-a-real-token",
        REPO: "a11ign/a11ign", PR_NUMBER: "7", PR_AUTHOR: scene.author, PR_BODY: scene.body, FAKE_BODY: scene.body, FAKE_GIT_LOG: gitLog,
        ...(scene.addsFile ? { FAKE_ADDS_FILE: "1" } : {}),
      },
    });
    const gitCalls = existsSync(gitLog) ? readFileSync(gitLog, "utf8").split("\n").filter(Boolean) : [];
    return { status: ran.status ?? -1, stdout: ran.stdout, output: readFileSync(output, "utf8"), gitCalls };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The step output `body`, as `$GITHUB_OUTPUT` carries it: `body<<DELIMITER`, the value, then the delimiter on a line of its own. */
function bodyOutputOf(output: string): string | undefined {
  const start = /^body<<(\S+)\n/m.exec(output);
  if (!start) return undefined;
  const from = start.index + start[0].length;
  return output.slice(from, output.indexOf(`\n${start[1]}\n`, from));
}

const liveBodyScript = THE_TREE.find((step) => step.id === "live-body")?.run ?? "";
const fullHistoryScript = THE_TREE.find((step) => step.name === FULL_HISTORY_STEP)?.run ?? "";
const PROSE = "Bumps a thing.\n\nAcceptance:\n```bash\nnode -e 0\n```\n\nHistory: full\n\n";
const BODY = `${PROSE}Closes #4107\n`;

/** What the live-body step hands on for this scene. */
function handedOn(scene: Scene): { status: number; text: string | undefined } {
  const ran = runStep({ script: liveBodyScript, scene });
  return { status: ran.status, text: bodyOutputOf(ran.output) };
}

test("CONTROL: both scripts were found, and the harness narrows a pull request that adds a file and keeps one that does not", () => {
  assert.ok(liveBodyScript.includes(CALL) && fullHistoryScript.includes(CALL), "a step script was not found, so the runs below would be of an empty script");
  const withFile = handedOn({ body: BODY, author: "a-person", addsFile: true });
  assert.deepEqual([withFile.status, withFile.text], [0, "Closes #4107"]);
});

test("an exempt author's pull request that adds no file keeps its WHOLE body through the live-body step, for both spellings (#4857)", () => {
  for (const author of ["dependabot[bot]", "app/dependabot"]) {
    const ran = handedOn({ body: BODY, author });
    assert.deepEqual([ran.status, ran.text], [0, BODY.trimEnd()], author);
  }
});

test("its twin: the same body from anyone else is narrowed to its `Closes` line, so the line above is the author and not the harness", () => {
  for (const author of ["a-person", "dependabot", "dependabot[bot]-lookalike"]) {
    const ran = handedOn({ body: BODY, author });
    assert.deepEqual([ran.status, ran.text], [0, "Closes #4107"], author);
  }
});

test("the full-history step reads an exempt author's `History: full` from the body, and deepens the checkout (#4857)", () => {
  const ran = runStep({ script: fullHistoryScript, scene: { body: BODY, author: "dependabot[bot]" } });
  assert.deepEqual([ran.status, ran.gitCalls], [0, ["fetch --unshallow origin main"]]);
});

test("its twins: another author, or no `History: full`, does not deepen it", () => {
  const anyoneElse = runStep({ script: fullHistoryScript, scene: { body: BODY, author: "a-person" } });
  assert.deepEqual([anyoneElse.status, anyoneElse.gitCalls], [0, []]);
  const noDeclaration = runStep({ script: fullHistoryScript, scene: { body: "Acceptance: node -e 0\n\nCloses #4107\n", author: "dependabot[bot]" } });
  assert.deepEqual([noDeclaration.status, noDeclaration.gitCalls], [0, []]);
});
