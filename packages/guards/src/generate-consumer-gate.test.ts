/**
 * `scripts/generate-consumer-gate.ts` turns README.md's own Quickstart fence into `consumer-gate.yml`. These are the pure steps of that
 * transformation, pinned over small fixture documents so no checkout, `git` history or runner is needed.
 *
 * What is pinned, and the wrong answer each guards against:
 *   1. THE FENCE IS FOUND BY ITS `uses:` LINE, not by being the first yaml block, under either published identity of the Action.
 *   2. A FENCE THAT THE SPLICE COULD NOT ANCHOR IS REFUSED, not silently generated without `check-pin` (#796, #1256): anything above
 *      `jobs:`, a duplicate `on:`/`name:`, or a stray top-level key below it.
 *   3. ONLY THE `uses:` REF OF THE ACTION AND THE `url`/`task` VALUES CHANGE (#494). Another `uses:` (`actions/checkout`) and every
 *      other line pass through; a document missing `url:` or `task:` is refused rather than generated unsubstituted.
 *   4. THE JOB THE GATE WRAPS IS THE ACTION'S, never the first one listed (#1305), and a job line the `needs:` splice cannot anchor is
 *      refused (#1304).
 *   5. A DIRTY GENERATION INPUT IS REFUSED, including a rename in or out of one (#1721), and an unrelated dirty file is not.
 *
 * Every refusal has a clean counterpart in the same test, so an always-throwing function would fail here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { regenerationInFlight } from "../../../scripts/consumer-gate-pin-needed.ts";
import { sandboxGitEnv, withGitSandbox, type GitSandbox } from "../../../scripts/test-support/git-sandbox.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const gen = await import("../../../scripts/generate-consumer-gate.ts");
const {
  README_PATH, OUT, ACTION_DEFINITION, extractDocumentedJobsBlock, pinActionRef, substituteTarget, extractJobName, extractPinnedSha,
  buildConsumerGateWorkflow, generate, refuseDirtyGenerationInputs, currentHeadSha, actionPinVerdict, PIN_COMMENT, restatePinComment,
} = gen;


const SHA = "0123456789abcdef0123456789abcdef01234567";
const OTHER_SHA = "fedcba9876543210fedcba9876543210fedcba98";
const SHA_LENGTH = 40;
const PRE_TRANSFER = ["DanBeckDev", "a11y-witness"].join("/");

/** A fence body as README writes it: rooted at `jobs:`, one job, a checkout step and the Action's step. */
const FENCE = [
  "jobs:",
  "  a11y:",
  "    runs-on: windows-2022",
  "    steps:",
  "      - uses: actions/checkout@v7",
  "      - uses: a11ign/a11ign@v0.1.0",
  "        id: a11ign",
  "        with:",
  "          url: https://example.com/contact",
  "          task: Send an enquiry",
].join("\n");

const markdownAround = (fence: string) => `# Title\n\n\`\`\`yaml\n${fence}\n\`\`\`\n\nprose\n`;

test("extractDocumentedJobsBlock: the fence carrying the Action's uses: line is returned, trailing whitespace trimmed, an earlier yaml block skipped", () => {
  const readme = `\`\`\`yaml\nunrelated: true\n\`\`\`\n\n\`\`\`yaml\n${FENCE}\n\n\`\`\`\n`;
  assert.equal(extractDocumentedJobsBlock(readme), FENCE);
});

test("extractDocumentedJobsBlock: both published identities are recognised, case-insensitively", () => {
  const preTransfer = FENCE.replace("a11ign/a11ign", PRE_TRANSFER);
  assert.equal(extractDocumentedJobsBlock(markdownAround(preTransfer)), preTransfer);
  const shouted = FENCE.replace("a11ign/a11ign", "A11IGN/A11IGN");
  assert.equal(extractDocumentedJobsBlock(markdownAround(shouted)), shouted);
});

test("extractDocumentedJobsBlock: no fence naming the Action is an error that names README_PATH; a look-alike repo does not count", () => {
  assert.throws(() => extractDocumentedJobsBlock("```yaml\njobs:\n  a:\n    steps:\n      - uses: actions/checkout@v7\n```\n"),
    (error: Error) => error.message.includes(README_PATH) && /no ```yaml fence containing "uses: a11ign\/a11ign"/.test(error.message));
  assert.throws(() => extractDocumentedJobsBlock(markdownAround(FENCE.replace("a11ign/a11ign", "a11ign/a11ign-fork"))), /no ```yaml fence/);
  assert.throws(() => extractDocumentedJobsBlock(""), /no ```yaml fence/);
});

test("extractDocumentedJobsBlock: a fence that does not open with jobs:, or carries its own on:/name:/permissions:, is refused", () => {
  const withOn = `on: pull_request\n${FENCE}`;
  assert.throws(() => extractDocumentedJobsBlock(markdownAround(withOn)),
    (error: Error) => /its own top-level "on:" key/.test(error.message) && /wraps "on:" and "name:" itself/.test(error.message) && /duplicate YAML key/.test(error.message));
  assert.throws(() => extractDocumentedJobsBlock(markdownAround(`name: mine\n${FENCE}`)), /its own top-level "name:" key/);

  const permissions = `permissions:\n  contents: read\n${FENCE}`;
  assert.throws(() => extractDocumentedJobsBlock(markdownAround(permissions)), /its own top-level "permissions:" key/);
  assert.throws(() => extractDocumentedJobsBlock(markdownAround(permissions)), (e: Error) => !/duplicate YAML key/.test(e.message));
  assert.throws(() => extractDocumentedJobsBlock(markdownAround(`# a comment first\n${FENCE}`)), /the top-level line "# a comment first"/);
});

test("extractDocumentedJobsBlock: a top-level key BELOW jobs: is refused too, while indented lines and comments below it are fine", () => {
  assert.throws(() => extractDocumentedJobsBlock(markdownAround(`${FENCE}\nenv:\n  A: b`)), /its own top-level "env:" key/);
  const benign = `${FENCE}\n# a trailing comment\n    # an indented one`;
  assert.equal(extractDocumentedJobsBlock(markdownAround(benign)), benign);
});

test("pinActionRef: only the Action's uses: line is pinned, keeping whichever identity the fence carries", () => {
  const pinned = pinActionRef(FENCE, SHA);
  assert.ok(pinned.includes(`      - uses: a11ign/a11ign@${SHA}\n`));
  assert.ok(pinned.includes("      - uses: actions/checkout@v7\n"), "another uses: step is untouched");
  assert.equal(pinned.replace(SHA, "v0.1.0"), FENCE, "nothing else changed");

  const old = pinActionRef(FENCE.replace("a11ign/a11ign", PRE_TRANSFER), SHA);
  assert.ok(old.includes(`uses: ${PRE_TRANSFER}@${SHA}`));
  assert.ok(pinActionRef(FENCE.replace("a11ign/a11ign", "A11IGN/A11IGN"), SHA).includes(`uses: A11IGN/A11IGN@${SHA}`));
});

test("pinActionRef: a document without the Action's versioned uses: line is refused, naming both identities", () => {
  assert.throws(() => pinActionRef("jobs:\n  a:\n    steps:\n      - uses: actions/checkout@v7\n", SHA),
    /no "uses: a11ign\/a11ign@<ref>" line \(nor "uses: [^"]+@<ref>"\) found to pin/);
  assert.throws(() => pinActionRef("      - uses: a11ign/a11ign\n", SHA), /found to pin/);
});

test("substituteTarget: the url and task VALUES are replaced, keys and indentation kept; a missing key is refused", () => {
  const out = substituteTarget(FENCE, { url: "https://real.example/x", task: "Do the thing" });
  assert.equal(out, FENCE.replace("https://example.com/contact", "https://real.example/x").replace("Send an enquiry", "Do the thing"));
  assert.ok(out.includes("          url: https://real.example/x\n"));

  const noUrl = FENCE.replace(/ +url:.*\n/, "");
  assert.throws(() => substituteTarget(noUrl, { url: "u", task: "t" }), /no "url:" line found to substitute/);
  const noTask = FENCE.replace(/\n +task:.*/, "");
  assert.throws(() => substituteTarget(noTask, { url: "u", task: "t" }), /no "task:" line found to substitute/);
});

test("extractJobName: a single job is named; with several, the one carrying the Action wins over the first", () => {
  assert.equal(extractJobName(FENCE), "a11y");
  const several = [
    "jobs:", "  lint: # style", "    steps:", "      - uses: actions/checkout@v7",
    "  gate:", "    steps:", `      - uses: ${PRE_TRANSFER}@v1`,
  ].join("\n");
  assert.equal(extractJobName(several), "gate");
  const dotted = ["jobs:", "  first:", "    steps: []", "  my.gate-1:", "    steps:", "      - uses: a11ign/a11ign@v1"].join("\n");
  assert.equal(extractJobName(dotted), "my.gate-1");
});

test("extractJobName: no jobs, several none carrying the Action, and several carrying it are each refused", () => {
  assert.throws(() => extractJobName("jobs:\n"), /no job key found under "jobs:"/);
  const none = "jobs:\n  a:\n    steps: []\n  b:\n    steps: []";
  assert.throws(() => extractJobName(none), (e: Error) => /lists 2 jobs \(a, b\) and none carries `uses: /.test(e.message) && /\(#1305\)/.test(e.message));
  const both = "jobs:\n  a:\n    steps:\n      - uses: a11ign/a11ign@v1\n  b:\n    steps:\n      - uses: a11ign/a11ign@v2";
  assert.throws(() => extractJobName(both), /2 carry the Action \(a, b\)/);
});

test("restatePinComment: README's trailing comment on the Action's line becomes what the pin IS, and a line without one gains none (#4153)", () => {
  const readmeLine = "      - uses: a11ign/a11ign@890cd490276d16102b3f371007951a24942950da   # the commit of the release tagged a11ign@0.3.0";
  const restated = restatePinComment(pinActionRef(FENCE.replace("      - uses: a11ign/a11ign@v0.1.0", readmeLine), SHA));
  assert.ok(restated.includes(`      - uses: a11ign/a11ign@${SHA}   # ${PIN_COMMENT}\n`), restated);
  assert.ok(!restated.includes("release tagged"), "README's comment describes README's pin, which this file's is not");
  assert.ok(!restatePinComment(pinActionRef(FENCE, SHA)).includes("#"), "no comment in, none out");
  assert.match(restated, /^ {6}- uses: actions\/checkout@v7$/m, "another uses: step is untouched");
  assert.ok(pinActionRef(readmeLine, SHA).includes("release tagged"), "pinActionRef itself still passes the comment through: the outsider generator relies on it");
});

test("generate: the real README's pin line carries PIN_COMMENT, not README's release-tag comment (#4153)", () => {
  const workflow = generate(readFileSync(README_PATH, "utf8"), SHA) as string;
  assert.ok(workflow.includes(`uses: a11ign/a11ign@${SHA}   # ${PIN_COMMENT}\n`), "the pin line");
  assert.ok(!workflow.includes("release tagged"));
});

test("extractPinnedSha: reads back what pinActionRef baked, and refuses a block that was never pinned", () => {
  assert.equal(extractPinnedSha(pinActionRef(FENCE, SHA)), SHA);
  assert.equal(extractPinnedSha(pinActionRef(FENCE.replace("a11ign/a11ign", PRE_TRANSFER), OTHER_SHA)), OTHER_SHA);
  assert.throws(() => extractPinnedSha("jobs:\n  a:\n    steps:\n      - uses: actions/checkout@v7\n"), /pinActionRef may not have run yet/);
});

test("buildConsumerGateWorkflow: the envelope, check-pin, needs: [check-pin] on the Action's job and verify-report are all present, in order", () => {
  const workflow = buildConsumerGateWorkflow(pinActionRef(FENCE, SHA)) as string;
  const order = ["name: consumer-gate", "on:\n  workflow_call:\n  workflow_dispatch:", "jobs:\n  check-pin:", "  a11y:\n    needs: [check-pin]\n    runs-on: windows-2022", "  verify-report:\n    needs: [a11y]"];
  const positions = order.map((fragment) => workflow.indexOf(fragment));
  assert.ok(positions.every((p) => p >= 0), `every fragment present: ${positions.join(",")}`);
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, "in that order");
  assert.equal(workflow.match(/^jobs:$/gm)?.length, 1, "one jobs: key, not a double wrap");
  assert.equal(workflow.match(/^name:/gm)?.length, 1);
  assert.ok(workflow.endsWith("          fi\n"));
});

test("buildConsumerGateWorkflow: the pinned sha appears in the check-pin ancestry and Action-definition steps, and the job name in verify-report", () => {
  const workflow = buildConsumerGateWorkflow(pinActionRef(FENCE, SHA)) as string;
  assert.ok(workflow.includes(`git merge-base --is-ancestor ${SHA} "\${{ github.sha }}"`));
  assert.ok(workflow.includes(`git diff --quiet ${SHA} "\${{ github.sha }}" -- ${ACTION_DEFINITION.join(" ")}`));
  assert.ok(workflow.includes(`git diff --stat ${SHA} "\${{ github.sha }}" -- action.yml`));
  assert.ok(workflow.includes("run: node scripts/generate-consumer-gate.ts --check"));
  assert.ok(workflow.includes('if [ "${{ needs.a11y.result }}" != "success" ]; then'));
  assert.deepEqual(ACTION_DEFINITION, ["action.yml"]);
});

test("buildConsumerGateWorkflow: the extracted steps pass through unedited and no actions/checkout is added to the Action's job", () => {
  const workflow = buildConsumerGateWorkflow(pinActionRef(FENCE, SHA)) as string;
  const a11yJob = workflow.slice(workflow.indexOf("  a11y:\n"), workflow.indexOf("  verify-report:"));
  assert.equal(a11yJob.replace("    needs: [check-pin]\n", "").trimEnd(), FENCE.slice(FENCE.indexOf("  a11y:")).replace("v0.1.0", SHA));
  // The only checkout in the file besides the document's own is check-pin's, which is generator infrastructure.
  assert.equal(workflow.match(/actions\/checkout@v7/g)?.length, 2);
});

test("buildConsumerGateWorkflow: a job line with a trailing comment or spaces is anchored; a flow mapping on the job line is refused (#1304)", () => {
  const commented = pinActionRef(FENCE.replace("  a11y:", "  a11y: # the gate"), SHA);
  assert.match(buildConsumerGateWorkflow(commented), / {2}a11y: # the gate\n {4}needs: \[check-pin\]\n/);
  const spaced = pinActionRef(FENCE.replace("  a11y:", "  a11y:   "), SHA);
  assert.match(buildConsumerGateWorkflow(spaced), / {2}a11y: {3}\n {4}needs: \[check-pin\]\n/);

  const flow = pinActionRef(FENCE.replace("  a11y:\n    runs-on: windows-2022", "  a11y: { runs-on: windows-2022 }"), SHA);
  assert.throws(() => buildConsumerGateWorkflow(flow), (e: Error) => /the job line " {2}a11y: \{ runs-on: windows-2022 \}" is not a block key/.test(e.message) && /\(#1304\)/.test(e.message));
});

test("buildConsumerGateWorkflow: a block that does not open with jobs: is refused rather than generated without check-pin (#1256)", () => {
  const headless = pinActionRef(FENCE, SHA).replace(/^jobs:\n/, "# lead\n");
  assert.throws(() => buildConsumerGateWorkflow(headless), /does not open with `jobs:`.*it starts "# lead"/);
  const noAction = "jobs:\n  a:\n    steps:\n      - uses: actions/checkout@v7\n";
  assert.throws(() => buildConsumerGateWorkflow(noAction), /pinActionRef may not have run yet/, "a block with no pinned Action step is refused before any splicing");
});

test("buildConsumerGateWorkflow: a job key with regexp metacharacters is matched literally", () => {
  const dotted = pinActionRef(FENCE.replace("  a11y:", "  a.b+c:"), SHA);
  const workflow = buildConsumerGateWorkflow(dotted) as string;
  assert.ok(workflow.includes("  a.b+c:\n    needs: [check-pin]\n"));
  assert.ok(workflow.includes("needs: [a.b+c]"));
  // A different key that the unescaped pattern would also have matched must not be touched.
  const lookalike = dotted.replace("runs-on: windows-2022", "runs-on: windows-2022\n    # aXb+c: not a job");
  assert.equal((buildConsumerGateWorkflow(lookalike) as string).match(/needs: \[check-pin\]/g)?.length, 1);
});

test("generate: README text and a sha in, a pinned and retargeted workflow out", () => {
  const workflow = generate(markdownAround(FENCE), SHA) as string;
  assert.ok(workflow.includes(`uses: a11ign/a11ign@${SHA}`));
  assert.ok(workflow.includes("url: https://www.w3.org/WAI/demos/bad/before/home.html"));
  assert.ok(workflow.includes("task: Find the main navigation and reach the survey."));
  assert.ok(!workflow.includes("example.com/contact") && !workflow.includes("Send an enquiry"));
  assert.ok(workflow.includes("needs: [check-pin]"));
  assert.equal(generate(markdownAround(FENCE), SHA), workflow, "deterministic");
  assert.notEqual(generate(markdownAround(FENCE), OTHER_SHA), workflow, "the sha is what varies");
  assert.equal((generate(markdownAround(FENCE), OTHER_SHA) as string).replaceAll(OTHER_SHA, SHA), workflow);
});

test("generate: the real README.md produces a workflow whose job and pin agree with it", () => {
  const workflow = generate(readFileSync(README_PATH, "utf8"), SHA) as string;
  assert.ok(README_PATH.endsWith("/README.md") && OUT.endsWith("/.github/workflows/consumer-gate.yml"));
  assert.equal(extractPinnedSha(workflow.slice(workflow.indexOf("  a11y:"))), SHA);
  assert.match(workflow, /^name: consumer-gate$/m);
  assert.match(workflow, /^ {2}verify-report:$/m);
});

test("generate: a README whose fence is malformed fails at generation, not later", () => {
  assert.throws(() => generate(markdownAround(`on: push\n${FENCE}`), SHA), /top-level "on:" key/);
  assert.throws(() => generate("no fences here", SHA), /no ```yaml fence/);
  assert.throws(() => generate(markdownAround(FENCE.replace(/ +url:.*\n/, "")), SHA), /no "url:" line/);
});

test("refuseDirtyGenerationInputs: a modified, staged or untracked generation input is refused, naming the file", () => {
  for (const status of [" M README.md", "M  README.md", "?? README.md", "MM scripts/generate-consumer-gate.ts", " M /abs/path/README.md"]) {
    assert.throws(() => refuseDirtyGenerationInputs(`${status}\n`), (e: Error) => /has an uncommitted or staged change/.test(e.message) && /\(#1721\)/.test(e.message), status);
  }
  assert.throws(() => refuseDirtyGenerationInputs(" M README.md\n"), /README\.md has an uncommitted/);
  assert.throws(() => refuseDirtyGenerationInputs("M  scripts/generate-consumer-gate.ts"), /scripts\/generate-consumer-gate\.ts has an uncommitted/);
});

test("refuseDirtyGenerationInputs: a rename or copy IN or OUT of an input is refused on either side", () => {
  assert.throws(() => refuseDirtyGenerationInputs("R  README.md -> docs/old-readme.md\n"), /README\.md has an uncommitted/);
  assert.throws(() => refuseDirtyGenerationInputs("R  docs/draft.md -> README.md\n"), /README\.md has an uncommitted/);
  assert.throws(() => refuseDirtyGenerationInputs("C  a.txt -> scripts/generate-consumer-gate.ts\n"), /generate-consumer-gate\.ts has an uncommitted/);
});

test("refuseDirtyGenerationInputs: a clean tree, blank lines and other dirty files are not refused", () => {
  assert.equal(refuseDirtyGenerationInputs(""), undefined);
  assert.equal(refuseDirtyGenerationInputs("\n  \n"), undefined);
  assert.equal(refuseDirtyGenerationInputs(" M docs/guide.md\n?? scripts/generate-consumer-gate.ts.bak\nR  a.md -> b.md\n"), undefined);
  // Positive control: the same list plus one input line is refused.
  assert.throws(() => refuseDirtyGenerationInputs(" M docs/guide.md\n M README.md\n"), /README\.md has an uncommitted/);
});

test("refuseDirtyGenerationInputs: ANY path ending in /README.md counts, because the match is by suffix (eager, so a nested README refuses too)", () => {
  // The suffix match exists for absolute paths; it also means a dirty docs/README.md blocks regeneration. Pinned as observed.
  assert.throws(() => refuseDirtyGenerationInputs(" M docs/README.md\n"), /README\.md has an uncommitted/);
  assert.equal(refuseDirtyGenerationInputs(" M docs/NOT-README.md\n"), undefined);
});

test("currentHeadSha: a full 40-hex commit id equal to what git reports for this checkout", () => {
  const sha = currentHeadSha() as string;
  assert.match(sha, new RegExp(`^[0-9a-f]{${SHA_LENGTH}}$`));
  assert.equal(sha, execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, env: sandboxGitEnv(), encoding: "utf8" }).trim());
});

/** Two commits of a fixture repo's `action.yml`: `v1` is what a pin at the first commit runs, `v2` what main has since. */
function commitActionYml(sandbox: GitSandbox, body: string): string {
  writeFileSync(join(sandbox.dir, "action.yml"), `${body}\n`);
  sandbox.run(["add", "action.yml"]);
  sandbox.commit(`action.yml: ${body}`);
  return sandbox.run(["rev-parse", "HEAD"]).trim();
}

test("actionPinVerdict (#4153): a pin that predates action.yml on the BASE is red, a pin that contains it is green", () => {
  withGitSandbox((sandbox) => {
    sandbox.run(["init", "-q", "-b", "main"]);
    const v1 = commitActionYml(sandbox, "v1");
    const v2 = commitActionYml(sandbox, "v2");
    const stale = actionPinVerdict({ pin: v1, base: v2, head: v2, cwd: sandbox.dir });
    assert.equal(stale.ok, false, "the positive control: the pin is at v1, main has v2");
    assert.match(stale.message, /action\.yml changed between the pin, [0-9a-f]{40}, and the base, [0-9a-f]{40}/);
    assert.match(stale.message, /the a11y job would run the OLD Action/);
    assert.match(stale.message, /node scripts\/generate-consumer-gate\.ts/);
    assert.equal(actionPinVerdict({ pin: v2, base: v2, head: v2, cwd: sandbox.dir }).ok, true, "the clean counterpart");
  });
});

test("actionPinVerdict (#4153): a pull request that changes action.yml itself is NOT red, and says what its merge will do", () => {
  withGitSandbox((sandbox) => {
    sandbox.run(["init", "-q", "-b", "main"]);
    const v1 = commitActionYml(sandbox, "v1");
    const v2 = commitActionYml(sandbox, "v2");
    const own = actionPinVerdict({ pin: v2, base: v2, head: commitActionYml(sandbox, "v3"), cwd: sandbox.dir });
    assert.equal(own.ok, true, "its own change cannot be in a pin: the commit does not exist until it merges");
    assert.equal(own.ownChange, true);
    assert.match(own.message, /refuse the next release until `node scripts\/generate-consumer-gate\.ts` is run and merged/);
    assert.equal(actionPinVerdict({ pin: v2, base: v2, head: v2, cwd: sandbox.dir }).ownChange, false);
    assert.equal(actionPinVerdict({ pin: v1, base: v2, head: v2, cwd: sandbox.dir }).ownChange, false);
    const staleAndOwn = actionPinVerdict({ pin: v1, base: v2, head: sandbox.run(["rev-parse", "HEAD"]).trim(), cwd: sandbox.dir });
    assert.equal(staleAndOwn.ok, false, "a pin already stale on the base is red even when the pull request also changes action.yml");
  });
});

test("actionPinVerdict (#4153): a commit git cannot resolve is an error, never 'unchanged'", () => {
  withGitSandbox((sandbox) => {
    sandbox.run(["init", "-q", "-b", "main"]);
    const v1 = commitActionYml(sandbox, "v1");
    assert.throws(() => actionPinVerdict({ pin: OTHER_SHA, base: v1, head: v1, cwd: sandbox.dir }), /could not compare action\.yml/);
  });
});

test("actionPinVerdict (#4153, #4331): the real tree -- the committed pin contains every action.yml change on origin/main, or its repair is open", () => {
  const pin = extractPinnedSha(readFileSync(OUT, "utf8")) as string;
  const verdict = actionPinVerdict({ pin, base: "origin/main", head: "HEAD", cwd: REPO_ROOT });
  if (!verdict.ok) {
    // A pin that predates action.yml on the BASE reds every unrelated branch cut from it (#4325 reddened #4326, which touched neither file),
    // and the repair is already running: `consumer-gate-pin.yml` started it at the merge that staled the pin. So while the repair branch is
    // on origin AND carries a pin containing the base's action.yml, this REPORTS; with no repair open, or one that is itself stale, it fails
    // exactly as before. A pull request whose OWN diff stales the pin is a different case and is decided by the verdict above (ownChange).
    const repair = regenerationInFlight({ base: "origin/main", cwd: REPO_ROOT });
    assert.equal(repair.inFlight, true, `${verdict.message} -- and no repair is on its way: ${repair.reason}`);
    process.stdout.write(`::warning title=consumer-gate.yml::stale pin on the base, repair open: ${repair.reason}\n`);
    return;
  }
  if (verdict.ownChange) process.stdout.write(`::notice title=consumer-gate.yml::${verdict.message}\n`);
});

test("actionPinVerdict (#4153): the refusal says what the release's own check-pin says, so the two cannot drift", () => {
  const phrases = ["would run the OLD Action", "regenerate (node scripts/generate-consumer-gate.ts)"];
  const workflow = generate(readFileSync(README_PATH, "utf8"), SHA) as string;
  withGitSandbox((sandbox) => {
    sandbox.run(["init", "-q", "-b", "main"]);
    const v1 = commitActionYml(sandbox, "v1");
    const v2 = commitActionYml(sandbox, "v2");
    const { message } = actionPinVerdict({ pin: v1, base: v2, head: v2, cwd: sandbox.dir });
    for (const phrase of phrases) {
      assert.ok(workflow.includes(phrase), `check-pin no longer says "${phrase}"`);
      assert.ok(message.includes(phrase), `the pull-request refusal no longer says "${phrase}"`);
    }
  });
});
