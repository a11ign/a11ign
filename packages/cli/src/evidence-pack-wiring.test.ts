// #4252: `renderEvidencePack` (#4244) is a pure function, and an assessor can only get the pack from a run once a flag writes it
// beside the result JSON. This pins the wiring: the flag parses, the sink writes the pack from the SAME object it prints, a run
// without the flag writes none (the negative control), the refusals that stop the Action naming a file never written, and the
// Action output naming the file the CLI is asked to write.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs, resultSink } from "./cli.js";
import { NOT_A_VPAT } from "./evidence-pack.js";

const FIXTURE = new URL("./fixtures/rehearsal3-34774183433-a11ign-result.json", import.meta.url);
const ACTION = fileURLToPath(new URL("../../../action.yml", import.meta.url));
const result = JSON.parse(readFileSync(FIXTURE, "utf8")) as object;

/** Run `fn` with stdout and stderr captured, in a scratch directory that is removed after. */
function inScratch(fn: (dir: string) => void): { stdout: string; stderr: string } {
  const dir = mkdtempSync(join(tmpdir(), "a11ign-evidence-pack-wiring-"));
  const log = console.log;
  const write = process.stderr.write;
  let stdout = "";
  let stderr = "";
  console.log = (line: string) => { stdout += `${line}\n`; };
  process.stderr.write = ((chunk: string) => { stderr += chunk; return true; }) as typeof process.stderr.write;
  try { fn(dir); } finally { console.log = log; process.stderr.write = write; rmSync(dir, { recursive: true, force: true }); }
  return { stdout, stderr };
}

test("--evidence-pack parses to a path; the default is none", () => {
  assert.equal(parseArgs(["https://example.com", "--json", "--evidence-pack", "pack.md"]).evidencePack, "pack.md");
  assert.equal(parseArgs(["https://example.com", "--json"]).evidencePack, null);
});

test("--evidence-pack without a path is refused, never ignored", () => {
  assert.throws(() => parseArgs(["https://example.com", "--json", "--evidence-pack"]), /needs the path/);
  assert.throws(() => parseArgs(["https://example.com", "--evidence-pack", "--json"]), /needs the path/);
});

test("positive control: the result JSON is printed and the pack is written beside it, its first block the not-a-VPAT sentence", () => {
  let fileText = "";
  const { stdout } = inScratch((dir) => {
    const file = join(dir, "pack.md");
    resultSink(file)(result);
    fileText = readFileSync(file, "utf8");
  });
  assert.deepEqual(JSON.parse(stdout), result, "the JSON on stdout is the result the pack was rendered from");
  const [heading, , sentence] = fileText.split("\n");
  assert.equal(heading, "# a11ign evidence pack");
  assert.equal(sentence, `> ${NOT_A_VPAT}`);
  assert.match(fileText, /\| 1\.1\.1 Non-text Content \|/);
});

test("negative control: a run without the flag writes no pack", () => {
  inScratch((dir) => {
    resultSink(null)(result);
    assert.deepEqual(existsSync(join(dir, "pack.md")), false);
  });
});

test("a result with no outcomes (a PDF's tag-tree scan) writes no pack and says so", () => {
  const { stderr } = inScratch((dir) => {
    resultSink(join(dir, "pack.md"))({ url: "https://example.com/a.pdf", task: "t", pdf: [] });
    assert.equal(existsSync(join(dir, "pack.md")), false);
  });
  assert.match(stderr, /No evidence pack written/);
});

test("the Action asks the CLI for the file its evidence-pack output names, and only for a single result", () => {
  const text = readFileSync(ACTION, "utf8");
  const asked = /pack="([^"]+)"\n\s*\[ -z "\$URLS" \] && \[ -z "\$FORMS" \] && args\+=\(--evidence-pack "\$pack"\)/.exec(text);
  assert.ok(asked, "action.yml no longer passes --evidence-pack for a single-result run -- this guard went blind");
  assert.match(text, /evidence-pack:\n(?:.*\n)*?\s*value: \$\{\{ steps\.capture\.outputs\.evidence-pack \}\}/);
  assert.ok(text.includes('[ -s "$pack" ] && echo "evidence-pack=$pack" >> "$GITHUB_OUTPUT"'), "the output must be set only when the file exists");
});

test("the docs name the flag and the Action output", () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../../../docs/${rel}`, import.meta.url)), "utf8");
  assert.match(read("evidence-pack.md"), /--evidence-pack <file\.md>/);
  assert.match(read("github-action.md"), /\| `evidence-pack` \|/);
});
