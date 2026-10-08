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
import { checkSpikeDocument } from "./attach-spike.mjs";

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

const check = (text: string) => checkSpikeDocument(text, { lineCountAt, commit: COMMIT }) as string[];

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
