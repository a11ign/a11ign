// no-token: gh -- runs the workflow's own step script against a fake `gh` and a stand-in tool in a temp directory; no `gh` or network is reached
/**
 * #4809 (a11ign#4676): A PULL REQUEST THAT ADDS AN ACCEPTANCE FILE AND CLOSES A `defect` ROW KEEPS ITS `Class:` LINE through the `live-body` step's narrowing.
 *
 * The step narrows the body to the `Closes` declaration when the pull request adds an acceptance file (ADR 0044), and the tool's `class` report reads the text the
 * step hands on. A narrowing to `Closes` lines alone threw the `Class:` line away, so a defect row's pull request was `CLASS: MISSING` with the line present in
 * both its body and its file. This file runs the step's own `run:` script under bash against a fake `gh` and pins what it hands on.
 *
 * THE TOOL IS A STAND-IN HERE, as in `acceptance-supplies-row-labels.test.ts` (which is read and not edited): `extractClosesDeclaration` is agent-org's and is tested
 * there. The stand-in's answer depends on the whole text, so a `Closes` declaration split across two lines parses differently once narrowed, which is the
 * case the existing narrowing check exists for. Each case has a twin that changes one fact.
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
const FAILED = 1;

type Step = { id?: string; run?: string };
type Workflow = { jobs: { run: { steps: Step[] } } };

const LIVE_BODY_SCRIPT = (parseYaml(readFileSync(WORKFLOW, "utf8")) as Workflow).jobs.run.steps.find((step) => step.id === "live-body")?.run ?? "";

/** A fake `gh api <path>`: the PR body for `pulls/`, and a failed read for everything else, so a row simply gets no label entry. */
const FAKE_GH = `#!/usr/bin/env bash
case "$2" in
  repos/*/pulls/*) printf '%s' "$FAKE_BODY" ;;
  *) exit 1 ;;
esac
`;

/**
 * `extractClosesDeclaration` in the one respect these tests need: it reads the WHOLE text, with a `Closes` and its `#N` allowed a newline apart, so a declaration
 * split across lines is a `closes` of that row in the body and a `closes` of no row once its second line is dropped. `acceptanceSourceOfThisPullRequest` is the
 * checkout's read: a file when `FAKE_ADDS_FILE` is set, else the body.
 */
const STAND_IN_TOOL = `
export const extractClosesDeclaration = (text) => {
  const rows = [...text.matchAll(/Closes:?\\s+(?:([\\w.-]+\\/[\\w.-]+))?#(\\d+)/g)].map(([, repo, number]) => ({ repo: repo ?? null, number: Number(number) }));
  return /Closes/i.test(text) ? { kind: "closes", rows } : { kind: "missing" };
};
export const closesReferences = ({ rows }) => rows;
export const acceptanceSourceOfThisPullRequest = (body) => ({ kind: process.env.FAKE_ADDS_FILE ? "file" : "body", text: body });
`;

/** The stand-in is reached the way the real tool is: by the `agent-org/acceptance-commands` name its `package.json` DECLARES in `exports`. */
function installStandInTool(root: string): void {
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "node_modules"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "agent-org", type: "module", exports: { "./acceptance-commands": "./src/stand-in.ts" } }));
  writeFileSync(join(root, "src/stand-in.ts"), STAND_IN_TOOL);
  symlinkSync(join(REPO, "node_modules/tsx"), join(root, "node_modules/tsx"));
}

/** The step output `body`, as `$GITHUB_OUTPUT` carries it: `body<<DELIMITER`, the value, then the delimiter on a line of its own. */
function bodyOutputOf(output: string): string | undefined {
  const start = /^body<<(\S+)\n/m.exec(output);
  if (!start) return undefined;
  const from = start.index + start[0].length;
  return output.slice(from, output.indexOf(`\n${start[1]}\n`, from));
}

type StepRun = { status: number; handedOn?: string; stdout: string };

/** Runs the live-body step's own script with the pull request's body and whether it adds an acceptance file. */
function runLiveBodyStep({ body, addsFile }: { body: string; addsFile: boolean }): StepRun {
  const dir = mkdtempSync(join(tmpdir(), "class-line-"));
  try {
    const bin = join(dir, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "gh"), FAKE_GH);
    chmodSync(join(bin, "gh"), EXECUTABLE);
    installStandInTool(join(dir, "tool"));
    const output = join(dir, "output");
    writeFileSync(output, "");
    const ran = spawnSync("bash", ["-e", "-c", LIVE_BODY_SCRIPT], {
      encoding: "utf8",
      env: {
        PATH: `${bin}:${process.env.PATH}`, HOME: dir, GITHUB_OUTPUT: output, AGENT_ORG_TOOL: join(dir, "tool"),
        GH_TOKEN: "not-a-real-token", REPO: "a11ign/a11ign", PR_NUMBER: "7", PR_AUTHOR: "a-person", FAKE_BODY: body,
        ...(addsFile ? { FAKE_ADDS_FILE: "1" } : {}),
      },
    });
    return { status: ran.status ?? -1, handedOn: bodyOutputOf(readFileSync(output, "utf8")), stdout: ran.stdout };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const handedOnWithFile = (body: string) => runLiveBodyStep({ body, addsFile: true });
const PROSE = "Prose that is anybody's to edit.\n\nAcceptance:\n```bash\nnode -e 0\n```\n\n";
const CLASS_LINE = "Class: row-not-finishable — a row left open after its deliverable merged; guard: #4637";

test("CONTROL: the harness runs the step, so a body below that comes back narrowed was narrowed by the step", () => {
  const ran = handedOnWithFile(`${PROSE}Closes #4107\n`);
  assert.deepEqual([ran.status, ran.handedOn], [0, "Closes #4107"]);
});

test("a body with a `Closes` line and a `Class:` line, with an acceptance file added, hands on BOTH lines and nothing else (#4809)", () => {
  const ran = handedOnWithFile(`${PROSE}${CLASS_LINE}\n\nCloses #4107\n\nMore prose.\n`);
  assert.deepEqual([ran.status, ran.handedOn], [0, `${CLASS_LINE}\nCloses #4107`]);
});

test("its twin: a body with no `Class:` line hands on the `Closes` line alone", () => {
  const ran = handedOnWithFile(`${PROSE}Closes #4107\n\nMore prose.\n`);
  assert.deepEqual([ran.status, ran.handedOn], [0, "Closes #4107"]);
});

test("its twin: a pull request that adds NO acceptance file keeps its whole body, `Class:` line and all", () => {
  const body = `${PROSE}${CLASS_LINE}\n\nCloses #4107\n`;
  const ran = runLiveBodyStep({ body, addsFile: false });
  assert.deepEqual([ran.status, ran.handedOn], [0, body.trimEnd()]);
});

test("the line is recognised the way the tool's own `Class:` reader begins one: a list marker, bold or an indent keep it, a line merely MENTIONING it does not", () => {
  const kept = ["- Class: x — y; guard: #1", "**Class:** none — a docs change", "  class: x — y; guard: #1", "> Class: x — y; guard: #1"];
  for (const line of kept) assert.equal(handedOnWithFile(`${PROSE}${line}\nCloses #4107\n`).handedOn, `${line}\nCloses #4107`, line);
  const dropped = ["The Class: line is written below.", "Subclass: x", "Classes: a, b", "a `Class:` token in prose"];
  for (const line of dropped) assert.equal(handedOnWithFile(`${PROSE}${line}\nCloses #4107\n`).handedOn, "Closes #4107", line);
});

test("the narrowing check still exits 1 for a `Closes` declaration split across lines, with or without a `Class:` line beside it", () => {
  for (const body of [`${PROSE}Closes\n#4107\n`, `${PROSE}${CLASS_LINE}\n\nCloses\n#4107\n`]) {
    const ran = handedOnWithFile(body);
    assert.equal(ran.status, FAILED, body);
    assert.equal(ran.handedOn, undefined, "a failed narrowing hands nothing on");
  }
});

test("its twin: the same declaration on ONE line passes, so the failure above is the split and not the `Class:` line", () => {
  const ran = handedOnWithFile(`${PROSE}${CLASS_LINE}\n\nCloses #4107\n`);
  assert.equal(ran.status, 0);
});
