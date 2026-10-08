// THE SHAPE OF THE MECHANISM 3 SPIKE (#4087): a verdict, a transcript for each of three questions, and citations that exist.
//
// This checks the DOCUMENT, not a browser: the browser run is `attach-spike.mjs`'s, by hand, and its output is what the document
// pastes. A test that launched a browser would skip on a host without the libraries, and a skip that fires always is a check that
// never runs. The controls below are the other half: each deletes one thing from a COPY of the document and must fail on exactly that.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sandboxGitEnv } from "../../../guards/src/git-env.mjs";

const ROOT = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "../../../..");
const DOCUMENT = readFileSync(resolve(ROOT, "docs/auth-attach-spike.md"), "utf8");
const GIT_OUTPUT_LIMIT = 64 * 1024 * 1024;
const COMMIT = /Read at a11ign `([0-9a-f]{7,40})`/.exec(DOCUMENT)?.[1] ?? "";

/**
 * Line count of a tracked file at the commit the document names. A clone too shallow to hold that commit falls back to the working
 * tree: the document is committed with the code it cites, so the tree at the head is the same text unless a later change moved a line.
 */
function lineCountAt(commit: string, path: string): number | undefined {
  try {
    const text = execFileSync("git", ["show", `${commit}:${path}`], { cwd: ROOT, env: sandboxGitEnv(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: GIT_OUTPUT_LIMIT });
    return text.split("\n").length - 1;
  } catch {
    try { return readFileSync(resolve(ROOT, path), "utf8").split("\n").length - 1; } catch { return undefined; }
  }
}


// ---------------------------------------------------------------------------------------------------------------------------------
// The document's shape. It lives HERE and not in `attach-spike.mjs`: that file is an integration with a real browser and is excluded
// from coverage (`.c8rc.json`), and a pure function left in it would be excluded with it.

const VERDICT_LINE = /^Verdict: (attach works|attach conflicts: \S.*)$/m;
const QUESTION_HEADING = /^## Question ([123])\b/m;
const FENCE = /^```(?:\w*)\n([\s\S]*?)^```$/gm;

/** The fenced blocks of one section, in order. */
function blocksOf(section: string): string[] { return [...section.matchAll(FENCE)].map((m) => m[1]); }

/** A transcript block is a command line (`$ …`) with at least one line of output directly under it. */
function transcriptProblem(block: string): string | undefined {
  const lines = block.split("\n").filter((l) => l.trim() !== "");
  if (!lines[0]?.startsWith("$ ")) return "does not begin with a command line ($ …)";
  if (lines.length < 2 || lines.slice(1).every((l) => l.startsWith("$ "))) return "has a command and no output under it";
  return undefined;
}

/** `path:line` cites of this repository, written `` `path/to/file.ext:NN` `` and resolved at the commit the document names. */
const REPO_CITE = /`((?:packages|docs|scripts|\.github)\/[\w./-]+\.\w+):(\d+)`/g;
/** Cites of the worker, written `` `screenreader-worker@<sha> src/file.mjs:NN` ``; the evidence is the `grep -n` output pasted in the document. */
const WORKER_CITE = /`screenreader-worker@([0-9a-f]{7,40}) (src\/[\w./-]+\.\w+):(\d+)`/g;

/** Every way the document fails its shape; empty means it holds. */
function checkSpikeDocument(text: string, where: { lineCountAt: (commit: string, path: string) => number | undefined; commit: string }): string[] {
  const problems: string[] = [];
  if (!VERDICT_LINE.test(text)) problems.push("no `Verdict: attach works` / `Verdict: attach conflicts: <reason>` line");
  const sections = text.split(/^(?=## Question [123]\b)/m).filter((s) => QUESTION_HEADING.test(s));
  for (const n of ["1", "2", "3"]) {
    const section = sections.find((s) => s.startsWith(`## Question ${n}`));
    const blocks = section ? blocksOf(section) : [];
    if (!blocks.length) { problems.push(`question ${n} has no transcript block`); continue; }
    for (const block of blocks) {
      const problem = transcriptProblem(block);
      if (problem) problems.push(`question ${n}: a transcript block ${problem}`);
    }
  }
  for (const [, path, line] of text.matchAll(REPO_CITE)) {
    const count = where.lineCountAt(where.commit, path);
    if (count === undefined) problems.push(`cites ${path}:${line}, which does not exist at ${where.commit}`);
    else if (Number(line) > count) problems.push(`cites ${path}:${line}, but the file has ${count} lines at ${where.commit}`);
  }
  for (const [, , path, line] of text.matchAll(WORKER_CITE)) {
    const base = path.split("/").pop() ?? path;
    const evidence = new RegExp(`^${line}:`, "m");
    const quoted = [...text.matchAll(FENCE)].some((m) => m[1].includes(base) && evidence.test(m[1].split("\n").slice(1).join("\n")));
    if (!quoted) problems.push(`cites ${path}:${line} of the worker with no \`grep -n\` line ${line}: pasted from ${base}`);
  }
  return problems;
}

const check = (text: string) => checkSpikeDocument(text, { lineCountAt, commit: COMMIT });

test("the document names the commit it was read at", () => {
  assert.notEqual(COMMIT, "");
});

test("the spike document holds its shape", () => {
  assert.deepEqual(check(DOCUMENT), []);
});

test("positive control: the document HAS verdict, three question sections and cites to resolve", () => {
  assert.match(DOCUMENT, /^Verdict: attach (works|conflicts: \S.*)$/m);
  assert.equal((DOCUMENT.match(/^## Question [123]\b/gm) ?? []).length, 3);
  assert.ok((DOCUMENT.match(/`packages\/[\w./-]+:\d+`/g) ?? []).length >= 1, "no repository cite to check");
  assert.ok((DOCUMENT.match(/`screenreader-worker@[0-9a-f]+ src\//g) ?? []).length >= 1, "no worker cite to check");
});

test("control: a copy with the verdict line deleted fails", () => {
  const problems = check(DOCUMENT.replace(/^Verdict: .*\n/m, ""));
  assert.ok(problems.some((p) => /Verdict/.test(p)), problems.join("\n"));
});

test("control: a verdict that gives no reason for the conflict fails", () => {
  const problems = check(DOCUMENT.replace(/^Verdict: attach conflicts: .*$/m, "Verdict: attach conflicts:"));
  assert.ok(problems.some((p) => /Verdict/.test(p)), problems.join("\n"));
});

test("control: a transcript block with no output under its command fails", () => {
  const bare = DOCUMENT.replace(/(## Question 1[\s\S]*?```\n)(\$ [^\n]*\n)[\s\S]*?(```)/, "$1$2$3");
  assert.notEqual(bare, DOCUMENT, "the mutation did not apply");
  const problems = check(bare);
  assert.ok(problems.some((p) => /question 1.*no output/.test(p)), problems.join("\n"));
});

test("control: a question with no transcript block fails", () => {
  const without = DOCUMENT.replace(/(## Question 3[\s\S]*?)```[\s\S]*?```/, "$1");
  const problems = check(without);
  assert.ok(problems.some((p) => /question 3 has no transcript/.test(p)), problems.join("\n"));
});

test("control: a cite past the end of its file fails", () => {
  const problems = check(`${DOCUMENT}\nSee \`packages/cli/src/fault-remediation.ts:99999\`.\n`);
  assert.ok(problems.some((p) => /fault-remediation\.ts:99999/.test(p)), problems.join("\n"));
});

test("control: a cite of a file that is not there fails", () => {
  const problems = check(`${DOCUMENT}\nSee \`packages/cli/src/auth/no-such-file.ts:1\`.\n`);
  assert.ok(problems.some((p) => /does not exist/.test(p)), problems.join("\n"));
});

test("control: a worker cite with no pasted grep line behind it fails, and the same cite WITH one stops failing", () => {
  const cite = "`screenreader-worker@291ed35 src/browser-session.mjs:7777`";
  assert.ok(check(`${DOCUMENT}\nSee ${cite}.\n`).some((p) => /browser-session\.mjs:7777/.test(p)));
  const backed = "```\n$ git show 291ed35:src/browser-session.mjs | grep -n x\n7777:  some line\n```";
  assert.deepEqual(check(`${DOCUMENT}\nSee ${cite}.\n\n${backed}\n`), []);
});
