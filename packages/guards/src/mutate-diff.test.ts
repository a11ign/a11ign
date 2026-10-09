/**
 * #3282 — THE IN-HOUSE MUTATION SET, AND THE TWO-JOB WORKFLOW THAT POSTS ITS SURVIVORS.
 *
 * What is pinned, and where its positive control lives:
 *
 *   1. THE OPERATORS: each produces what it names, NO MUTANT IS AN IDENTITY (28 of the reading's 2,327 were
 *      `return undefined;` rewritten to itself), and the regex-anchor operator drops a `^` and a `$`.
 *   2. A MUTANT THAT DOES NOT PARSE is discarded and COUNTED. Control: the same mutants parse in the cases beside it.
 *   3. THE SCOPE: a changed test names a subject by basename; a fixture, a test and an unnamed file are never subjects.
 *   4. THE SAMPLE IS BY STRIDE: never the first N.
 *   5. BOTH DIRECTIONS, ON A REAL REPOSITORY AND REAL TESTS (done-when 7): a planted weak test is reported as a survivor
 *      and a strong one is not; the cap bites when lowered and is silent when raised; the file comes back byte for byte.
 *   6. THE COMMENT lists at most 20 survivors, prints no rate, and cannot be closed from inside by a line of source.
 *   7. THE WORKFLOW: the job that runs the pull request's code holds `contents: read` and nothing else, and the job that
 *      holds `pull-requests: write` runs none of it. `violations()` is run on the real file AND on fixtures that each
 *      break one property, because a checker that has never said no is not known to be able to.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

import {
  LISTED_SURVIVORS, affordable, chooseSubjects, codeSpan, editsOf, hunt, kindOf, mutantsOfSubject, mutateDiff,
  mutatedText, parses, positive, renderComment, renderSummary, runChangedTests, sampleByStride, scopeOf,
} from "./mutate-diff.ts";
import { sandboxGitEnv } from "./git-env.mjs";
import { tempDir } from "./test-tmp.ts";

const REPO = resolve(import.meta.dirname, "../../..");

/** The lines `editsOf` turns `line` into, `null` standing for a deleted line. */
const mutations = (kind: "js" | "yml" | "json" | "md", line: string): (string | null)[] =>
  editsOf(kind, line).map((e) => (e.to === null ? null : line.slice(0, e.from) + e.to + line.slice(e.from + e.len)));

// ---- 1. the operators ------------------------------------------------------------------------------------------

test("JS operators: a comparison, a boolean, a branch and a return each yield the mutant they name", () => {
  const cmp = mutations("js", "  if (a > b) {");
  assert.ok(cmp.includes("  if (a >= b) {"), "REL");
  assert.ok(cmp.includes("  if (true) {") && cmp.includes("  if (false) {"), "IF, both directions");
  assert.ok(mutations("js", "  const ok = true;").includes("  const ok = false;"), "BOOL");
  assert.ok(mutations("js", "  return a + b;").includes("  return undefined;"), "RET");
  assert.ok(mutations("js", "  return a + b;").includes("  return a - b;"), "ARITH");
  assert.ok(mutations("js", "  const s = \"abc\";").includes("  const s = \"\";"), "STR");
  assert.ok(mutations("js", "  const x = a === b;").includes("  const x = a !== b;"), "EQ");
  assert.ok(mutations("js", "  const x = a && b;").includes("  const x = a || b;"), "LOGIC");
  assert.ok(mutations("js", "  doThing();").includes(null), "DELETE");
});

test("NO MUTANT IS AN IDENTITY: `return undefined;` is not rewritten to itself", () => {
  const line = "  return undefined;";
  assert.deepEqual(editsOf("js", line).filter((e) => e.op === "RET"), []);
  for (const l of [line, "  const a = 1;", "  return x;", "  if (a === b) return true;"]) {
    for (const m of mutations("js", l)) assert.notEqual(m, l, `${JSON.stringify(l)} produced itself`);
  }
});

test("the regex-anchor operator drops a leading `^` and a trailing `$`, one mutant each, and a division is not a regex", () => {
  const line = "const MANIFEST_PATH = /^(?:packages\\/[^/]+\\/)?package\\.json$/;";
  const anchors = editsOf("js", line).filter((e) => e.op === "ANCHOR");
  assert.equal(anchors.length, 2);
  const mutated = anchors.map((e) => line.slice(0, e.from) + e.to + line.slice(e.from + e.len));
  assert.ok(mutated.includes("const MANIFEST_PATH = /(?:packages\\/[^/]+\\/)?package\\.json$/;"), "no ^");
  assert.ok(mutated.includes("const MANIFEST_PATH = /^(?:packages\\/[^/]+\\/)?package\\.json/;"), "no $");
  assert.deepEqual(editsOf("js", "  const half = total / count;").filter((e) => e.op === "ANCHOR"), []);
  assert.deepEqual(editsOf("js", "  const re = /foo/;").filter((e) => e.op === "ANCHOR"), [], "an unanchored regex has nothing to drop");
});

test("YAML, JSON and Markdown get their own sets and nothing else", () => {
  assert.ok(mutations("yml", "    timeout-minutes: 20").includes("    timeout-minutes: 21"), "NUM");
  assert.ok(mutations("yml", "    if: github.event.action == 'opened'").includes("    if: github.event.action != 'opened'"), "EQ");
  assert.ok(mutations("json", "  \"private\": true,").includes("  \"private\": false,"), "BOOL");
  assert.ok(mutations("json", "  \"name\": \"x\",").includes("  \"name\": \"\","), "STR");
  assert.deepEqual(editsOf("md", "A sentence with true and 3 and a == b.").map((e) => e.op), ["DELETE"]);
  assert.deepEqual([kindOf("a.mjs"), kindOf("a.ts"), kindOf("a.yml"), kindOf("a.yaml"), kindOf("a.json"), kindOf("a.md")],
    ["js", "js", "yml", "yml", "json", "md"]);
});

// ---- 2. a mutant that does not parse -----------------------------------------------------------------------------

test("a mutant that does not parse is discarded and COUNTED, and the ones that do parse are kept", () => {
  assert.equal(parses("js", "a.mjs", "export const a = 1;\n"), true, "control: valid JS");
  assert.equal(parses("js", "a.mjs", "export const a = (;\n"), false);
  assert.equal(parses("yml", "a.yml", "a: 1\n"), true, "control: valid YAML");
  assert.equal(parses("yml", "a.yml", "a: [1\n"), false);
  assert.equal(parses("json", "a.json", "{\"a\": 1}"), true, "control: valid JSON");
  assert.equal(parses("json", "a.json", "{\"a\": }"), false);
  assert.equal(parses("md", "a.md", "# anything"), true);

  const text = "export function f(a) {\n  if (a) {\n    return 1;\n  }\n  return 2;\n}\n";
  const { mutants, discarded } = mutantsOfSubject({ file: "f.mjs", text, lines: new Set([2, 3, 4, 5]) });
  assert.ok(discarded > 0, "deleting `if (a) {` leaves a stray brace: discarded");
  assert.ok(mutants.length > 0, "and the rest are kept");
  for (const m of mutants) assert.equal(parses("js", "f.mjs", mutatedText(text, m)), true);
});

// ---- 3. scope --------------------------------------------------------------------------------------------------

test("a subject is a changed non-test file a changed test NAMES; a fixture, a test and an unnamed file are not", () => {
  const files: Record<string, string> = {
    "src/a.mjs": "import \"./b.mjs\";", "src/b.mjs": "", "src/c.mjs": "", "src/d.json": "",
    "src/fixtures/page.md": "", "src/a.test.ts": "import \"./a.mjs\"; // and d.json and page.md",
  };
  const subjects = chooseSubjects({ changed: Object.keys(files), tests: ["src/a.test.ts"], read: (f) => files[f] });
  assert.deepEqual(subjects, ["src/a.mjs", "src/b.mjs", "src/d.json"],
    "a.mjs and d.json are named; b.mjs is one hop through a.mjs; c.mjs is named by nobody; the fixture is data");
});

// ---- 4. the sample ---------------------------------------------------------------------------------------------

test("sampleByStride spreads across the list and is never the first N", () => {
  const items = Array.from({ length: 30 }, (_unused, i) => i);
  assert.deepEqual(sampleByStride(items, 5), [0, 6, 12, 18, 24]);
  assert.notDeepEqual(sampleByStride(items, 5), items.slice(0, 5));
  assert.deepEqual(sampleByStride(items, 30), items, "a cap that is not exceeded is silent");
  assert.deepEqual(sampleByStride(items, 99), items);
  assert.equal(new Set(sampleByStride(items, 29)).size, 29, "no index is picked twice");
});

test("the cap is what the measured cost affords, never above the asked-for cap and never below one", () => {
  assert.equal(affordable({ maxMutants: 100, budgetSeconds: 420, baselineSeconds: 5 }), 84);
  assert.equal(affordable({ maxMutants: 50, budgetSeconds: 420, baselineSeconds: 5 }), 50);
  assert.equal(affordable({ maxMutants: 100, budgetSeconds: 10, baselineSeconds: 60 }), 1);
});

// ---- 5. both directions, on a real repository ------------------------------------------------------------------

const LIB = "export function add(a, b) {\n  return a + b;\n}\n\nexport function isBig(n) {\n  if (n > 10) return true;\n  return false;\n}\n";
const WEAK = "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { add, isBig } from \"./lib.mjs\";\n"
  + "test(\"weak\", () => {\n  assert.equal(typeof add(1, 2), \"number\");\n  assert.equal(typeof isBig(3), \"boolean\");\n});\n";
const STRONG = "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { add, isBig } from \"./lib.mjs\";\n"
  + "test(\"strong\", () => {\n  assert.equal(add(1, 2), 3);\n  assert.equal(add(5, 0), 5);\n  assert.equal(isBig(11), true);\n  assert.equal(isBig(10), false);\n  assert.equal(isBig(3), false);\n});\n";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args],
    { cwd, env: sandboxGitEnv(), encoding: "utf8" }).trim();

/** A repository whose base commit is empty and whose head adds `lib.mjs` and a test that names it. */
function repoWith(testSource: string): string {
  const cwd = tempDir("mutate-diff-");
  git(cwd, "init", "-q", "-b", "main");
  writeFileSync(join(cwd, "README.md"), "base\n");
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", "base");
  mkdirSync(join(cwd, "src"));
  writeFileSync(join(cwd, "src/lib.mjs"), LIB);
  writeFileSync(join(cwd, "src/lib.test.mjs"), testSource);
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", "head");
  return cwd;
}

/** The seam: the REAL tests, run by node's own runner (the repository under test has no rstest). */
const nodeTest = (cwd: string) => async () => {
  const done = spawnSync(process.execPath, ["--test", "src/lib.test.mjs"], { cwd, env: sandboxGitEnv(), encoding: "utf8" });
  return { code: done.status, timedOut: false, ms: 1000, tail: `${done.stdout}${done.stderr}` };
};

const BUDGET = 600;

test("the scope of a real range is the changed test and the file it names", () => {
  const cwd = repoWith(WEAK);
  const scope = scopeOf({ base: "HEAD~1", head: "HEAD", cwd });
  assert.deepEqual(scope.tests, ["src/lib.test.mjs"]);
  assert.deepEqual(scope.subjects.map((s) => s.file), ["src/lib.mjs"]);
  assert.deepEqual([...scope.subjects[0].lines].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("a planted WEAK test is reported as a survivor, and a STRONG one leaves no survivor on the same lines", async () => {
  const weak = repoWith(WEAK);
  const weakReport = await mutateDiff({ cwd: weak, scope: scopeOf({ base: "HEAD~1", head: "HEAD", cwd: weak }),
    run: nodeTest(weak), maxMutants: 500, budgetSeconds: BUDGET });
  const survivedOps = weakReport.hunt.survivors.map((s) => `${s.line}:${s.op}`);
  assert.ok(survivedOps.includes("2:ARITH"), `\`a - b\` still returns a number: ${survivedOps}`);
  assert.ok(weakReport.hunt.survivors.some((s) => s.line === 6 && s.op === "REL"), "`n >= 10` returns a boolean too");
  assert.ok(weakReport.hunt.killed > 0, "and the weak test still catches something (RET), so the run is not vacuous");

  const strong = repoWith(STRONG);
  const strongReport = await mutateDiff({ cwd: strong, scope: scopeOf({ base: "HEAD~1", head: "HEAD", cwd: strong }),
    run: nodeTest(strong), maxMutants: 500, budgetSeconds: BUDGET });
  assert.deepEqual(strongReport.hunt.survivors.map((s) => `${s.line}:${s.op}`), [],
    "the strong test pins the sum and both sides of the boundary");
  assert.equal(strongReport.hunt.ran, strongReport.eligible, "every eligible mutant ran, so that emptiness is not a skipped run");
  assert.equal(readFileSync(join(strong, "src/lib.mjs"), "utf8"), LIB, "the subject comes back byte for byte");
});

test("the cap bites when LOWERED and is silent when RAISED", async () => {
  const cwd = repoWith(WEAK);
  const scope = scopeOf({ base: "HEAD~1", head: "HEAD", cwd });
  const lowered = await mutateDiff({ cwd, scope, run: nodeTest(cwd), maxMutants: 3, budgetSeconds: BUDGET });
  assert.equal(lowered.hunt.ran, 3);
  assert.ok(lowered.eligible > 3);
  assert.match(renderComment(lowered), new RegExp(`3 of ${lowered.eligible} mutants run`));
  assert.match(renderComment(lowered), /sampled by stride/);

  const raised = await mutateDiff({ cwd, scope, run: nodeTest(cwd), maxMutants: 1000, budgetSeconds: BUDGET });
  assert.equal(raised.hunt.ran, raised.eligible);
  assert.doesNotMatch(renderComment(raised), /sampled by stride|never ran/);
  assert.match(renderComment(raised), new RegExp(`${raised.eligible} of ${raised.eligible} mutants run`));
});

test("the wall budget stops STARTING mutants, says how many never ran, and is silent when it is not spent", async () => {
  const cwd = repoWith(WEAK);
  const scope = scopeOf({ base: "HEAD~1", head: "HEAD", cwd });
  const { mutants } = mutantsOfSubject({ file: "src/lib.mjs", text: LIB, lines: new Set(scope.subjects[0].lines) });
  let clock = 0;
  const tick = () => (clock += 1000);
  const run = async () => ({ code: 1, timedOut: false });
  const tight = await hunt({ mutants, cwd, run, budgetSeconds: 3, now: tick });
  assert.equal(tight.ran, 2, "a clock that moves 1 s per read: started at 1, the third check reads 3");
  assert.equal(tight.cutByBudget, mutants.length - 2);
  clock = 0;
  const loose = await hunt({ mutants, cwd, run, budgetSeconds: 100_000, now: tick });
  assert.equal(loose.ran, mutants.length);
  assert.equal(loose.cutByBudget, 0);
  assert.equal(readFileSync(join(cwd, "src/lib.mjs"), "utf8"), LIB);
});

test("a RED baseline runs no mutant and says so, since every mutant would read as caught for the wrong reason", async () => {
  const cwd = repoWith(WEAK.replace("\"number\");\n  assert.equal(typeof isBig", "\"string\");\n  assert.equal(typeof isBig"));
  const report = await mutateDiff({ cwd, scope: scopeOf({ base: "HEAD~1", head: "HEAD", cwd }), run: nodeTest(cwd),
    maxMutants: 50, budgetSeconds: BUDGET });
  assert.equal(report.baselineRed, true);
  assert.equal(report.hunt.ran, 0);
  assert.match(renderComment(report), /not run/);
  assert.match(renderSummary(report), /already red/);
});

test("with no changed test naming a changed file there is nothing to mutate, and the comment is the quiet kind", async () => {
  const cwd = tempDir("mutate-diff-none-");
  git(cwd, "init", "-q", "-b", "main");
  writeFileSync(join(cwd, "a.md"), "a\n");
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", "base");
  writeFileSync(join(cwd, "a.md"), "a\nb\n");
  git(cwd, "commit", "-q", "-am", "head");
  const report = await mutateDiff({ cwd, scope: scopeOf({ base: "HEAD~1", head: "HEAD", cwd }), run: nodeTest(cwd),
    maxMutants: 50, budgetSeconds: BUDGET });
  assert.equal(report.hunt.ran, 0);
  assert.match(renderComment(report), /mutation-comment:quiet/);
});


test("hunt counts a timeout as neither a survivor nor a plain kill, and counts each verdict once", async () => {
  const cwd = repoWith(WEAK);
  const { mutants } = mutantsOfSubject({ file: "src/lib.mjs", text: LIB, lines: new Set([2]) });
  const verdicts = [{ code: 0, timedOut: false }, { code: 1, timedOut: false }, { code: null, timedOut: true }];
  let next = 0;
  const result = await hunt({ mutants: mutants.slice(0, 3), cwd, run: async () => verdicts[next++], budgetSeconds: BUDGET });
  assert.deepEqual({ ran: result.ran, killed: result.killed, timedOut: result.timedOut, survivors: result.survivors.length },
    { ran: 3, killed: 1, timedOut: 1, survivors: 1 });
});

test("a red run's output tail keeps what the tests wrote to stderr, and a run past its limit is killed and says so", async () => {
  const cwd = tempDir("mutate-diff-run-");
  const red = await runChangedTests({ cwd, tests: [], argv: ["-e", "process.stderr.write('assertion went red'); process.stdout.write(' and stdout too'); process.exit(3)"] });
  assert.equal(red.code, 3);
  assert.equal(red.timedOut, false);
  assert.match(red.tail, /assertion went red/, "stderr is kept");
  assert.match(red.tail, /and stdout too/, "and stdout");
  const slow = await runChangedTests({ cwd, tests: [], argv: ["-e", "setTimeout(() => {}, 60000)"], timeoutMs: 300 });
  assert.equal(slow.timedOut, true);
  assert.ok(slow.ms < 30_000, `the group was killed at the limit, not waited out: ${slow.ms} ms`);
});

test("a flag value is a positive integer, the fallback when absent, and a refusal otherwise", () => {
  assert.equal(positive(undefined, 100), 100);
  assert.equal(positive("7", 100), 7);
  for (const bad of ["0", "-3", "1.5", "many", ""]) assert.throws(() => positive(bad, 100), /positive integer/, bad);
});

// ---- 6. the comment --------------------------------------------------------------------------------------------

/** A report with `n` survivors across two files, none of it from a real run. */
function reportWithSurvivors(n: number) {
  const survivors = Array.from({ length: n }, (_unused, i) => ({
    file: i % 2 === 0 ? "src/a.mjs" : "src/b.mjs", line: i + 1, op: "REL",
    edit: { op: "REL", from: 0, len: 0, to: "" }, original: `if (x${i} < y)`, mutated: `if (x${i} <= y)`,
  }));
  return { tests: ["src/a.test.ts"], subjects: ["src/a.mjs", "src/b.mjs"], generated: 90, discarded: 10, eligible: 80,
    planned: 60, maxMutants: 60, budgetSeconds: 420, baselineSeconds: 5, baselineRed: false, baselineTail: "",
    hunt: { ran: 60, killed: 60 - n, timedOut: 0, survivors, cutByBudget: 0 } };
}

test("the comment lists at most 20 survivors, grouped by file and line with both lines, and sends the rest to the summary", () => {
  const report = reportWithSurvivors(25);
  const comment = renderComment(report);
  assert.equal(LISTED_SURVIVORS, 20);
  assert.equal((comment.match(/^ {2}- line /gm) ?? []).length, 20);
  assert.match(comment, /5 more survivors are listed in this run's job summary/);
  assert.match(comment, /60 of 80 mutants run/);
  assert.match(comment, /10 generated mutants did not parse and were discarded, not run/);
  assert.ok(comment.indexOf("src/a.mjs") < comment.indexOf("src/b.mjs"), "grouped by file, in order");
  assert.match(comment, /` if \(x0 < y\) `/, "the original line");
  assert.match(comment, /became ` if \(x0 <= y\) `/, "the mutated line");
  const summary = renderSummary(report);
  assert.equal((summary.match(/^ {2}- line /gm) ?? []).length, 25, "the summary lists every survivor");
});

test("no kill rate is printed anywhere: no percentage, no ratio of killed to run, no `score`", () => {
  for (const report of [reportWithSurvivors(0), reportWithSurvivors(7), reportWithSurvivors(25)]) {
    for (const text of [renderComment(report), renderSummary(report)]) {
      assert.doesNotMatch(text, /%|kill rate|score(?!\b.*not)|killed/i, text);
    }
  }
  assert.match(renderComment(reportWithSurvivors(3)), /not a score/);
});

test("a line of source cannot close the code span it is quoted in, and the comment says what a survivor is", () => {
  assert.equal(codeSpan("a ``` b"), "```` a ``` b ````");
  assert.equal(codeSpan("plain"), "` plain `");
  assert.equal(codeSpan("two\n  lines"), "` two lines `");
  const report = reportWithSurvivors(1);
  report.hunt.survivors[0].original = "x = `a` + `` b ``;";
  assert.match(renderComment(report), /``` x = `a` \+ `` b ``; ```/);
  assert.match(renderComment(report), /a change no changed test pinned; some are equivalent/);
});

// ---- 7. the workflow ---------------------------------------------------------------------------------------------

interface Step { uses?: string; run?: string; env?: Record<string, string>; id?: string; if?: string; with?: Record<string, string> }
interface Job { permissions?: Record<string, string>; needs?: string; steps?: Step[]; if?: string }
interface Workflow { on?: Record<string, unknown>; permissions?: Record<string, string>; jobs?: Record<string, Job> }

const WORKFLOW = ".github/workflows/mutation-comment.yml";
const realWorkflow = (): Workflow => parseYaml(readFileSync(resolve(REPO, WORKFLOW), "utf8")) as Workflow;

const jobsOf = (w: Workflow) => ({ mutate: w.jobs?.mutate, comment: w.jobs?.comment });
const stepsOf = (job?: Job) => job?.steps ?? [];
const writes = (permissions?: Record<string, string>) => Object.entries(permissions ?? {}).filter(([, v]) => v === "write");
const only = (permissions: Record<string, string> | undefined, expected: Record<string, string>) => JSON.stringify(permissions) === JSON.stringify(expected);
const runs = (job: Job | undefined, text: string) => stepsOf(job).some((s) => (s.run ?? "").includes(text));

/**
 * The properties that make the split safe, each as a sentence and a predicate that is TRUE WHEN BROKEN. `mutate` runs
 * the pull request's code and may hold no write; `comment` holds the one write and runs none of it.
 */
const BREAKS: [string, (w: Workflow) => boolean][] = [
  ["the workflow must have a `mutate` job and a `comment` job", (w) => !w.jobs?.mutate || !w.jobs?.comment],
  ["the only trigger is pull_request (never pull_request_target or workflow_run)", (w) => Object.keys(w.on ?? {}).join() !== "pull_request"],
  ["the workflow-level permissions hold a write", (w) => writes(w.permissions).length > 0],
  ["`mutate` runs the pull request's code and must hold `contents: read` and nothing else", (w) => !only(jobsOf(w).mutate?.permissions, { contents: "read" })],
  ["`comment` holds `pull-requests: write` and nothing else", (w) => !only(jobsOf(w).comment?.permissions, { "pull-requests": "write" })],
  ["`comment` checks out or installs: it may run no pull request code",
    (w) => stepsOf(jobsOf(w).comment).some((s) => /actions\/checkout|setup-node|pnpm\/action-setup/.test(s.uses ?? ""))],
  ["`comment` runs a program that is not gh/grep/sed", (w) => stepsOf(jobsOf(w).comment).some((s) => /\b(pnpm|npm|node|npx|tsx)\b/.test(s.run ?? ""))],
  ["`mutate`'s checkout must set persist-credentials: false",
    (w) => !JSON.stringify(stepsOf(jobsOf(w).mutate).find((s) => /actions\/checkout/.test(s.uses ?? ""))).includes("\"persist-credentials\":false")],
  ["`mutate` must run mutate-diff.ts", (w) => !runs(jobsOf(w).mutate, "packages/guards/src/mutate-diff.ts")],
  ["`mutate` must write the job summary, the surface that needs no token", (w) => !runs(jobsOf(w).mutate, "GITHUB_STEP_SUMMARY")],
  ["`comment` needs `mutate`", (w) => jobsOf(w).comment?.needs !== "mutate"],
  ["`mutate` must upload the comment as the artifact `comment` downloads",
    (w) => !stepsOf(jobsOf(w).mutate).some((s) => /^actions\/upload-artifact@/.test(s.uses ?? "") && s.with?.name === "mutation-comment")
      || !stepsOf(jobsOf(w).comment).some((s) => /^actions\/download-artifact@/.test(s.uses ?? "") && s.with?.name === "mutation-comment")],
  ["a `run:` line interpolates an expression (put it in env)",
    (w) => Object.values(w.jobs ?? {}).some((job) => stepsOf(job).some((s) => /\$\{\{/.test(s.run ?? "")))],
];

const violations = (workflow: Workflow): string[] => BREAKS.filter(([, broken]) => broken(workflow)).map(([sentence]) => sentence);

const clone = (workflow: Workflow): Workflow => JSON.parse(JSON.stringify(workflow));

test("the real workflow: the job that runs the pull request's code holds no write, and the job that holds the write runs none of it", () => {
  assert.deepEqual(violations(realWorkflow()), []);
  assert.deepEqual(Object.keys(realWorkflow().jobs ?? {}).sort(), ["comment", "mutate"], "the positive control: both jobs are read, so the emptiness above is a reading");
});

test("violations() refuses each fixture that breaks one property (the positive controls for the test above)", () => {
  const cases: [string, (w: Workflow) => void][] = [
    ["a write on `mutate`", (w) => { (w.jobs as Record<string, Job>).mutate.permissions = { contents: "read", "pull-requests": "write" }; }],
    ["a workflow-level write", (w) => { w.permissions = { contents: "write" }; }],
    ["pull_request_target", (w) => { w.on = { pull_request_target: {} }; }],
    ["a checkout in `comment`", (w) => { (w.jobs as Record<string, Job>).comment.steps?.unshift({ uses: "actions/checkout@v7" }); }],
    ["a program in `comment`", (w) => { (w.jobs as Record<string, Job>).comment.steps?.push({ run: "node scripts/x.mjs" }); }],
    ["`comment` with more than the one write", (w) => { (w.jobs as Record<string, Job>).comment.permissions = { "pull-requests": "write", contents: "write" }; }],
    ["an expression in a shell line", (w) => { (w.jobs as Record<string, Job>).comment.steps?.push({ run: "echo ${{ github.event.pull_request.title }}" }); }],
    ["an artifact `comment` never receives", (w) => { (w.jobs as Record<string, Job>).mutate.steps = (w.jobs as Record<string, Job>).mutate.steps?.filter((s) => !s.uses?.startsWith("actions/upload-artifact")); }],
    ["`comment` not waiting for `mutate`", (w) => { delete (w.jobs as Record<string, Job>).comment.needs; }],
  ];
  for (const [name, mutate] of cases) {
    const w = clone(realWorkflow());
    mutate(w);
    assert.notDeepEqual(violations(w), [], `${name} must be refused`);
  }
});

test("the tool's step is not a gate: it is continue-on-error, and `comment` waits for its reported outcome", () => {
  const w = realWorkflow();
  const step = (w.jobs?.mutate.steps ?? []).find((s) => s.id === "mutate") as (Step & { "continue-on-error"?: boolean }) | undefined;
  assert.equal(step?.["continue-on-error"], true);
  assert.match(w.jobs?.comment.if ?? "", /needs\.mutate\.outputs\.reported == 'true'/);
});

// ---- the template ------------------------------------------------------------------------------------------------

test("the pull request template says `Mutation:` is optional and that CI posts the survivors, and `pr:open` still runs `npm run mutate`", () => {
  const template = readFileSync(resolve(REPO, ".github/PULL_REQUEST_TEMPLATE.md"), "utf8");
  assert.match(template, /`Mutation:` is OPTIONAL/);
  assert.match(template, /CI POSTS THE SURVIVORS/);
  assert.match(template, /`pr:open` RUNS a `npm run mutate` line/);
  assert.doesNotMatch(template, /REQUIRED WHEN THE DIFF ADDS OR CHANGES A TEST FILE/, "the form that failed a pull request is gone");
});
