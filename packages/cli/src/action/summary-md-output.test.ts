// #1369 / PR #1748: reviewer-2's mutation at `6c94c761` changed action.yml's exported `summary-md`
// path away from the file the Report step actually writes (e.g. to `a11ign-missing.md`) and every
// existing Action/report test stayed green -- nothing read `steps.report.outputs.summary-md` and
// checked it names the file `--summary-out` writes. This is that missing positive control, plus the
// doc/table and workflow-example wiring the same kind of drift could hit unnoticed.
//
// #3292: the same drift one level up. The outsider's run (W40, a11ign-consumer-check run 37134253796) used
// `a11ign/a11ign@v0.1.0`, whose `action.yml` declares NO `summary-md` output, while every test here read the
// working-tree `action.yml` -- so the docs' `@v0.1.0` examples uploaded `steps.a11ign.outputs.summary-md`,
// which read as an empty string on the runner, and the artifact held the result JSON alone. The last test
// below reads `action.yml` AT THE REF each docs example pins and requires every output the example reads to be
// declared there.
//
// Parsed by regex, not a YAML library, matching `documented-criteria.test.ts`'s own reasoning for
// `action.yml`: this guards the COPY committed here, not the runtime -- `action-smoke.yml` runs the
// real thing on every push.
//
// The ref is read with `git show <ref>:action.yml`. The acceptance job is a depth-1 clone with no tags and no
// token, and `History: full` does NOT supply the tag: its `git fetch --unshallow origin main` stores no tag
// (PR #3301's first run: `* branch main -> FETCH_HEAD` and nothing else, then `git show v0.1.0:action.yml`
// failed). So a ref that is not local is fetched by name, depth 1 -- the repository is public and a read
// needs no token -- and a ref that cannot be had either way is REFUSED below, never skipped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { sandboxGitEnv } from "../../../guards/src/git-env.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const ACTION = fileURLToPath(new URL("../../../../action.yml", import.meta.url));
const GUIDE = fileURLToPath(new URL("../../../../docs/github-action.md", import.meta.url));
const TRY_IT = fileURLToPath(new URL("../../../../docs/try-it.md", import.meta.url));
const README = fileURLToPath(new URL("../../../../README.md", import.meta.url));

// The two refs the controls read. `v0.1.0` is the published tag that lacks `summary-md`; `c77c1ba0f` is the SHA
// the login-flow example pins, which has it (both read from git on every run, so a moved tag shows up here).
const TAG_WITHOUT_SUMMARY_MD = "v0.1.0";
const SHA_WITH_SUMMARY_MD = "c77c1ba0f65e94e0cef4fcdb8d3f3c7ac1be87fa";
// The floor that keeps the docs scan from passing over nothing: README, try-it (two) and github-action each
// have one example that reads an output, counted 2026-10-03.
const EXAMPLES_READING_OUTPUTS = 4;

const action = () => readFileSync(ACTION, "utf8");

test("#1369: the summary-md output names the exact file --summary-out writes", () => {
  const text = action();
  const summaryOut = /--summary-out="([^"]+)"/.exec(text);
  assert.ok(summaryOut, "action.yml no longer passes --summary-out to run.ts -- this guard went blind");
  const echoed = /echo "summary-md=([^"]+)" >> "\$GITHUB_OUTPUT"/.exec(text);
  assert.ok(echoed, "action.yml no longer echoes a summary-md output -- this guard went blind");
  assert.equal(echoed![1], summaryOut![1],
    `the summary-md output claims "${echoed![1]}" but --summary-out actually writes "${summaryOut![1]}"`);
});

test("#1369: the summary-md output is wired to the Report step, the one that sets it", () => {
  const text = action();
  const declared = /summary-md:\n(?:.*\n)*?\s*value: (.+)/.exec(text);
  assert.ok(declared, "action.yml no longer declares a summary-md output -- this guard went blind");
  assert.match(declared![1], /steps\.report\.outputs\.summary-md/,
    `summary-md's declared value is "${declared![1]}", not steps.report.outputs.summary-md`);
});

test("#1369: docs/github-action.md's Outputs table documents summary-md", () => {
  const text = readFileSync(GUIDE, "utf8");
  const headingAt = text.indexOf("## Outputs");
  assert.ok(headingAt >= 0, "the guide's Outputs heading was reworded or moved -- update this test's anchor");
  const nextHeadingAt = text.indexOf("\n## ", headingAt + 1);
  const section = text.slice(headingAt, nextHeadingAt >= 0 ? nextHeadingAt : undefined);
  assert.match(section, /\|\s*`summary-md`\s*\|/, "the Outputs table has no summary-md row");
});

test("#1369: every docs example uploads result-json in the a11ign-result artifact", () => {
  for (const [name, path] of [["docs/github-action.md", GUIDE], ["docs/try-it.md", TRY_IT]] as const) {
    const text = readFileSync(path, "utf8");
    const yamlBlock = /```yaml\n([\s\S]*?)\n```/.exec(text)?.[1];
    assert.ok(yamlBlock, `${name}'s example workflow block is missing or no longer fenced as yaml`);
    assert.match(yamlBlock!, /name:\s*a11ign-result/, `${name}'s example does not upload an a11ign-result artifact`);
    assert.match(yamlBlock!, /steps\.a11ign\.outputs\.result-json/, `${name}'s upload step dropped result-json`);
  }
});

/** One `uses: a11ign/a11ign@<ref>` step in a fenced yaml block, and the outputs the block reads from it. */
interface DocsExample { file: string; ref: string; id: string; reads: string[] }

// Only a real ref: `<sha>` and `<a full commit SHA>` placeholders do not match, so they are not examples.
const USES_A_REF = /uses:\s*a11ign\/a11ign@([0-9A-Za-z._-]+)/;

/** The outputs `action.yml` declares: the keys between its top-level `outputs:` and `runs:`. */
function declaredOutputs(actionYml: string): string[] {
  const section = /^outputs:\n([\s\S]*?)^runs:/m.exec(actionYml)?.[1];
  assert.ok(section, "action.yml has no top-level outputs: ... runs: section -- this guard went blind");
  return [...section.matchAll(/^ {2}([a-z][a-z-]*):/gm)].map((m) => m[1]);
}

const GIT: ExecFileSyncOptionsWithStringEncoding = { cwd: REPO_ROOT, env: sandboxGitEnv(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] };

/** `action.yml` as it was at `ref`, from the clone if it holds the ref and otherwise from a depth-1 fetch of just that ref. */
function actionYmlAt(ref: string): string {
  try {
    return execFileSync("git", ["show", `${ref}:action.yml`], GIT);
  } catch {
    // Not local (a shallow CI clone has no tags). Fall through to fetching it, and refuse if that fails too.
  }
  try {
    execFileSync("git", ["fetch", "--depth=1", "--no-tags", "origin", ref], GIT);
    return execFileSync("git", ["show", `FETCH_HEAD:action.yml`], GIT);
  } catch (cause) {
    throw new Error(`REFUSED: \`${ref}:action.yml\` is neither in this clone nor fetchable from origin, so what that ref `
      + "declares is unknown. An unresolvable ref is refused rather than skipped: skipping would let this test go green by not finding it.",
    { cause });
  }
}

function examplesIn(file: string, text: string): DocsExample[] {
  const found: DocsExample[] = [];
  for (const block of text.matchAll(/```yaml\n([\s\S]*?)\n```/g)) {
    const lines = block[1].split("\n");
    lines.forEach((line, at) => {
      const ref = USES_A_REF.exec(line)?.[1];
      if (!ref) return;
      // The step's own `id:` is the first one before the next step starts.
      const rest = lines.slice(at + 1);
      const stepLength = rest.findIndex((l) => /^\s*- /.test(l));
      const id = /^\s+id:\s*(\S+)/m.exec((stepLength < 0 ? rest : rest.slice(0, stepLength)).join("\n"))?.[1];
      const reads = id
        ? [...block[1].matchAll(new RegExp(`steps\\.${id}\\.outputs\\.([a-z][a-z-]*)`, "g"))].map((m) => m[1])
        : [];
      found.push({ file, ref, id: id ?? "", reads: [...new Set(reads)] });
    });
  }
  return found;
}

function undeclaredReads(example: DocsExample, declared: string[]): string[] {
  return example.reads.filter((name) => !declared.includes(name));
}

const docsExamples = () => [["README.md", README], ["docs/try-it.md", TRY_IT], ["docs/github-action.md", GUIDE]]
  .flatMap(([name, path]) => examplesIn(name, readFileSync(path, "utf8")));

test("#3292: every docs example reads only outputs that action.yml declares AT the ref the example pins", () => {
  const examples = docsExamples().filter((e) => e.reads.length > 0);
  assert.ok(examples.length >= EXAMPLES_READING_OUTPUTS, `only ${examples.length} docs examples read an output -- the parser went blind`);
  for (const example of examples) {
    const missing = undeclaredReads(example, declaredOutputs(actionYmlAt(example.ref)));
    assert.deepEqual(missing, [],
      `${example.file}: \`uses: a11ign/a11ign@${example.ref}\` reads steps.${example.id}.outputs.${missing.join(", ")}, `
      + "which action.yml at that ref does not declare, so it reads as an empty string on the runner (#3292)");
  }
});

// THE POSITIVE CONTROL for the test above, in both directions, on real history rather than a fixture alone.
test("#3292 CONTROL: the shape that emptied the outsider's artifact IS flagged, and the same example at a ref that has the output is not", () => {
  const outsiderShape: DocsExample = { file: "fixture", ref: TAG_WITHOUT_SUMMARY_MD, id: "a11ign", reads: ["result-json", "summary-md"] };
  assert.deepEqual(undeclaredReads(outsiderShape, declaredOutputs(actionYmlAt(TAG_WITHOUT_SUMMARY_MD))), ["summary-md"],
    `${TAG_WITHOUT_SUMMARY_MD} is expected to declare result-json but not summary-md; if it moved, this control and the docs need re-reading`);
  assert.deepEqual(undeclaredReads({ ...outsiderShape, ref: SHA_WITH_SUMMARY_MD }, declaredOutputs(actionYmlAt(SHA_WITH_SUMMARY_MD))), []);
});

test("#3292 CONTROL: the example parser reads an id, its outputs and a placeholder ref", () => {
  const fixture = "```yaml\nsteps:\n  - uses: a11ign/a11ign@v9.9.9\n    id: scan\n    with:\n      url: x\n"
    + "  - uses: actions/upload-artifact@v4\n    with:\n      path: ${{ steps.scan.outputs.summary-md }}\n"
    + "  - uses: a11ign/a11ign@<a full commit SHA>\n    id: other\n```";
  assert.deepEqual(examplesIn("fixture", fixture), [{ file: "fixture", ref: "v9.9.9", id: "scan", reads: ["summary-md"] }]);
});

test("#3292: a ref that does not resolve is REFUSED, not skipped", () => {
  assert.throws(() => actionYmlAt("no-such-ref-3292"), /REFUSED/);
});
