/**
 * #5229: A REQUIRED CHECK DOES NOT GO RED ON ONE GITHUB 5xx. The `gate` job's agreement step (#3211) polls the other kind of run for up to
 * ATTEMPTS polls under `bash -e`, and its two `gh api` reads were bare command substitutions: one `gh: Server Error (HTTP 502)` aborted the step
 * on the first poll with the budget unspent (a11ign#5227, run 38249729992). The `noRelease` step had the same hole in a quieter shape: a 5xx left
 * its body variable EMPTY, which reads as "no `no-release:` line" and sent the pull request to a red changeset check.
 *
 * Both are shell inside the workflow, so this runs THAT SHELL, taken out of the parsed `ci.yml` and never retyped here, behind a fake `gh` whose
 * answers are scripted per endpoint and which counts its calls. A 5xx or a transport error is polled again; a 4xx is an answer and fails at once;
 * a spent budget still fails (the control that stops "never fails" from passing). THE SWEEP at the bottom pins every `gh` call in a step of a
 * required check, so a new one has to be classified before it lands.
 *
 * agent-org#1351: the `dependency` step's read of the pull request's reviews and head is the third copy of the pattern, and the one whose
 * wrong answer is quiet: a failed read piped into `jq -s .` is `[]`, "nobody approved", so a settled pull request would read as unexamined.
 * A read that cannot be made leaves `check` WITHOUT `--reviews` and `--head` (today's refusal), and is never handed an empty file.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CI_YML = join(REPO_ROOT, ".github/workflows/ci.yml");

interface Step { id?: string; name?: string; run?: string; env?: Record<string, string> }
const workflow = parseYaml(readFileSync(CI_YML, "utf8")) as { jobs: Record<string, { steps?: Step[] }> };

function stepScript(job: string, pick: (step: Step) => boolean): string {
  const step = workflow.jobs[job]?.steps?.find(pick);
  assert.ok(step?.run, `ci.yml job ${job} has no step the test can find; the test would be reading nothing`);
  return step.run;
}
const AGREEMENT = stepScript("gate", (s) => s.name?.startsWith("The other kind of run on this head agrees") === true);
const NO_RELEASE = stepScript("changeset", (s) => s.id === "noRelease");
const DEPENDENCY = stepScript("changeset", (s) => s.id === "dependency");
const DEPENDENCY_ENV = workflow.jobs.changeset?.steps?.find((s) => s.id === "dependency")?.env ?? {};

// ---------------------------------------------------------------------------------------------------------------------------------------
// The fake `gh`: per endpoint, line N of `script-<key>` is the answer to call N (`ok` when the file is short), and `calls-<key>` counts them.

const FAKE_GH = `#!/bin/sh
# usage: gh api <path> [--jq ...]
case "$2" in
  */actions/workflows/ci.yml/runs?*) key=runs; body="$FIXTURES/runs.json" ;;
  */actions/runs/*/jobs?*) key=jobs; body="$FIXTURES/jobs.json" ;;
  */pulls/*/reviews*) key=reviews; body="$FIXTURES/reviews.json" ;;
  */pulls/*) case "$*" in *head.sha*) key=head; body="$FIXTURES/head.txt" ;; *) key=pulls; body="$FIXTURES/pulls.txt" ;; esac ;;
  *) echo "fake gh: unexpected path $2" >&2; exit 2 ;;
esac
echo x >> "$FIXTURES/calls-$key"
n=$(wc -l < "$FIXTURES/calls-$key")
answer=$(sed -n "\${n}p" "$FIXTURES/script-$key" 2>/dev/null)
case "\${answer:-ok}" in
  ok) cat "$body" ;;
  5??) echo "gh: Server Error (HTTP $answer)" >&2; exit 1 ;;
  4??) echo "gh: Not Found (HTTP $answer)" >&2; exit 1 ;;
  transport) echo "error connecting to api.github.com" >&2; echo "check your internet connection or https://githubstatus.com" >&2; exit 1 ;;
esac
`;
const FAKE_NODE = `#!/bin/sh
echo "$PR_BODY" > "$FIXTURES/node-body"
printf '%s\\n' "$@" > "$FIXTURES/node-args"
for arg in "$@"; do
  case "$arg" in --reviews=*) cat "\${arg#--reviews=}" > "$FIXTURES/node-reviews" ;; esac
done
`;
const FAKE_SLEEP = "#!/bin/sh\nexit 0\n";

interface Scenario { script?: Partial<Record<"runs" | "jobs" | "pulls" | "reviews" | "head", string[]>>; runs?: unknown[]; jobs?: unknown[]; reviews?: unknown[] }
const CODE_RUN = { id: 100, created_at: "2026-10-12T10:00:00Z", display_title: "A title", status: "completed", conclusion: "success" };
const META_RUN = { id: 101, created_at: "2026-10-12T10:01:00Z", display_title: "A title [meta event, edited]", status: "completed", conclusion: "success" };
const GREEN_JOBS = [{ name: "acceptance", status: "completed", conclusion: "success" }, { name: "gate", status: "in_progress", conclusion: null }];

function run(script: string, scenario: Scenario, env: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "poll-5xx-"));
  mkdirSync(join(dir, "bin"));
  for (const [name, text] of [["gh", FAKE_GH], ["node", FAKE_NODE], ["sleep", FAKE_SLEEP]]) {
    writeFileSync(join(dir, "bin", name), text);
    chmodSync(join(dir, "bin", name), 0o755);
  }
  writeFileSync(join(dir, "runs.json"), JSON.stringify({ workflow_runs: scenario.runs ?? [CODE_RUN, META_RUN] }));
  writeFileSync(join(dir, "jobs.json"), JSON.stringify({ jobs: scenario.jobs ?? GREEN_JOBS }));
  writeFileSync(join(dir, "pulls.txt"), "no-release: the body\n");
  writeFileSync(join(dir, "reviews.json"), (scenario.reviews ?? []).map((review) => JSON.stringify(review)).join("\n"));
  writeFileSync(join(dir, "head.txt"), "queuehead1\n");
  for (const key of ["runs", "jobs", "pulls", "reviews", "head"] as const) {
    writeFileSync(join(dir, `script-${key}`), (scenario.script?.[key] ?? []).join("\n") + "\n");
    writeFileSync(join(dir, `calls-${key}`), "");
  }
  const file = join(dir, "step.sh");
  writeFileSync(file, script);
  const result = spawnSync("bash", ["-e", file], {
    encoding: "utf8",
    env: {
      PATH: `${join(dir, "bin")}:${process.env.PATH}`, FIXTURES: dir, REPO: "a11ign/a11ign", HEAD_SHA: "head1",
      RUNNER_TEMP: dir, GITHUB_OUTPUT: join(dir, "github-output"), ...env,
    },
  });
  const calls = (key: string) => readFileSync(join(dir, `calls-${key}`), "utf8").split("\n").filter(Boolean).length;
  const read = (name: string) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), "utf8") : null);
  const nodeBody = read("node-body");
  return { code: result.status, out: `${result.stdout}${result.stderr}`, calls, nodeBody, nodeArgs: read("node-args")?.split("\n").filter(Boolean) ?? null, nodeReviews: read("node-reviews"), output: read("github-output") };
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// 1. The agreement step

const POLL = { ATTEMPTS: "4", POLL_SECONDS: "0" };
const agree = (kind: "code" | "meta", scenario: Scenario, self = kind === "code" ? "100" : "101") =>
  run(AGREEMENT, scenario, { ...POLL, KIND: kind, GITHUB_RUN_ID: self });

test("a 502 on the run listing is polled again, and the next poll's verdict decides", () => {
  const result = agree("code", { script: { runs: ["502"] } });
  assert.equal(result.code, 0, result.out);
  assert.equal(result.calls("runs"), 2, "one 502, then the poll that read the listing");
  assert.match(result.out, /\(101\) concluded success/);
});

test("a 504 on the jobs read, and a transport error on the listing, are polled again", () => {
  const jobs = agree("code", { script: { jobs: ["504"] } });
  assert.equal(jobs.code, 0, jobs.out);
  assert.equal(jobs.calls("jobs"), 2);
  const transport = agree("code", { script: { runs: ["transport", "transport"] } });
  assert.equal(transport.code, 0, transport.out);
  assert.equal(transport.calls("runs"), 3);
});

test("a meta run's listing read is retried the same way", () => {
  const result = agree("meta", { script: { runs: ["503"] } });
  assert.equal(result.code, 0, result.out);
  assert.equal(result.calls("runs"), 2);
});

test("the budget is still the budget: a GitHub that never answers fails AFTER ATTEMPTS polls, and says why", () => {
  const result = agree("code", { script: { runs: ["502", "502", "502", "502", "502"] } });
  assert.equal(result.code, 1);
  assert.equal(result.calls("runs"), 4, "every attempt was spent before the step gave up");
  assert.match(result.out, /after 4 polls/);
  assert.match(result.out, /GitHub answered 5xx or did not answer on 4 of them/);
});

test("a 4xx is an answer and fails at once, without spending the budget", () => {
  const listing = agree("code", { script: { runs: ["403"] } });
  assert.equal(listing.code, 1);
  assert.equal(listing.calls("runs"), 1);
  assert.match(listing.out, /not a 5xx\), so it is not retried/);
  const jobs = agree("code", { script: { jobs: ["404"] } });
  assert.equal(jobs.code, 1);
  assert.equal(jobs.calls("jobs"), 1);
  assert.equal(jobs.calls("runs"), 1, "the listing was read once and the 404 ended the step");
});

test("controls: a genuine failure still fails on the first poll, and a 5xx then a failure fails too", () => {
  const failing = [{ name: "acceptance", status: "completed", conclusion: "failure" }];
  const first = agree("code", { jobs: failing });
  assert.equal(first.code, 1);
  assert.match(first.out, /concluded 'failure'/);
  const after = agree("code", { jobs: failing, script: { runs: ["502"] } });
  assert.equal(after.code, 1, "the retry must not turn a real failure green");
  assert.match(after.out, /concluded 'failure'/);
});

// ---------------------------------------------------------------------------------------------------------------------------------------
// 2. The `noRelease` step

const NO_RELEASE_ENV = { PULL_NUMBER: "7", QUEUE_MESSAGE: "" };

test("noRelease: a 5xx on the body read is read again, and node gets the body, never an empty one", () => {
  const result = run(NO_RELEASE, { script: { pulls: ["502", "transport"] } }, NO_RELEASE_ENV);
  assert.equal(result.code, 0, result.out);
  assert.equal(result.calls("pulls"), 3);
  assert.equal(result.nodeBody?.trim(), "no-release: the body");
});

test("noRelease: a 4xx fails at once and node is never handed an empty body; five 5xx fail after five reads", () => {
  const notFound = run(NO_RELEASE, { script: { pulls: ["404"] } }, NO_RELEASE_ENV);
  assert.notEqual(notFound.code, 0);
  assert.equal(notFound.calls("pulls"), 1);
  assert.equal(notFound.nodeBody, null);
  const spent = run(NO_RELEASE, { script: { pulls: ["500", "500", "500", "500", "500", "500"] } }, NO_RELEASE_ENV);
  assert.notEqual(spent.code, 0);
  assert.equal(spent.calls("pulls"), 5);
  assert.equal(spent.nodeBody, null);
  const control = run(NO_RELEASE, {}, NO_RELEASE_ENV);
  assert.equal(control.code, 0, control.out);
  assert.equal(control.nodeBody?.trim(), "no-release: the body", "the positive control: no failure, node reads the body");
});

// ---------------------------------------------------------------------------------------------------------------------------------------
// 2b. The `dependency` step (agent-org#1351): the reviews and the head `check` settles a refusal by.

const APPROVAL = { id: 4242, state: "APPROVED", commit_id: "head1", user: { login: "a-human" } };
const PULL_REQUEST_ENV = { PULL_NUMBER: "7", QUEUE_REF: "", BASE: "origin/main", SINCE: "" };
const QUEUE_REF = `refs/heads/gh-readonly-queue/main/pr-7-${"a1b2c3d4".repeat(5)}`;
const QUEUE_ENV = { PULL_NUMBER: "", HEAD_SHA: "", BASE: "origin/main", SINCE: "abc123", QUEUE_REF };
/** What `check` has always been given: the node script, the command, and the two refs (`--since` is empty on a pull request). */
const WITHOUT_SETTLEMENT = ["check", "--base=origin/main", "--since="];
const noSettlement = (args: string[] | null) => args !== null && !args.some((arg) => arg.startsWith("--reviews=") || arg.startsWith("--head="));

test("dependency, on a pull request: check is handed the live reviews as a file and the event's head sha", () => {
  const result = run(DEPENDENCY, { reviews: [APPROVAL] }, PULL_REQUEST_ENV);
  assert.equal(result.code, 0, result.out);
  assert.equal(result.calls("reviews"), 1);
  assert.equal(result.calls("head"), 0, "a pull request event carries its head: nothing is read for it");
  const args = result.nodeArgs ?? [];
  assert.deepEqual(args.filter((arg) => !arg.startsWith("--reviews=")), ["scripts/dependency-changeset.ts", ...WITHOUT_SETTLEMENT, "--head=head1"]);
  assert.ok(args.some((arg) => arg.startsWith("--reviews=")), "--reviews names the file");
  assert.deepEqual(JSON.parse(result.nodeReviews ?? "null"), [APPROVAL]);
  assert.match(result.output ?? "", /settled=true/);
});

test("dependency, on a queue entry: the number in merge_group.head_ref names the pull request, whose head and reviews are read live", () => {
  const result = run(DEPENDENCY, { reviews: [APPROVAL] }, QUEUE_ENV);
  assert.equal(result.code, 0, result.out);
  assert.equal(result.calls("head"), 1);
  assert.equal(result.calls("reviews"), 1);
  assert.ok(result.nodeArgs?.includes("--head=queuehead1"), `the head is the pull request's live one: ${result.nodeArgs}`);
  assert.ok(result.nodeArgs?.includes("--since=abc123"));
  assert.deepEqual(JSON.parse(result.nodeReviews ?? "null"), [APPROVAL]);
});

test("dependency: a pull request nobody has reviewed hands check an EMPTY list, which is an answer and not a failed read", () => {
  const result = run(DEPENDENCY, { reviews: [] }, PULL_REQUEST_ENV);
  assert.equal(result.code, 0, result.out);
  assert.deepEqual(JSON.parse(result.nodeReviews ?? "null"), []);
  assert.ok(result.nodeArgs?.includes("--head=head1"));
});

test("dependency: a 5xx or a transport error on either read is read again, and check still gets the settlement flags", () => {
  const reviews = run(DEPENDENCY, { reviews: [APPROVAL], script: { reviews: ["502", "transport"] } }, PULL_REQUEST_ENV);
  assert.equal(reviews.code, 0, reviews.out);
  assert.equal(reviews.calls("reviews"), 3);
  assert.deepEqual(JSON.parse(reviews.nodeReviews ?? "null"), [APPROVAL]);
  const head = run(DEPENDENCY, { reviews: [APPROVAL], script: { head: ["503"] } }, QUEUE_ENV);
  assert.equal(head.code, 0, head.out);
  assert.equal(head.calls("head"), 2);
  assert.ok(head.nodeArgs?.includes("--head=queuehead1"));
});

test("dependency: a read that cannot be made leaves check WITHOUT the flags (today's refusal), never with an empty review list", () => {
  const notFound = run(DEPENDENCY, { reviews: [APPROVAL], script: { reviews: ["404"] } }, PULL_REQUEST_ENV);
  assert.equal(notFound.code, 0, notFound.out);
  assert.equal(notFound.calls("reviews"), 1, "a 4xx is an answer and is not read again");
  assert.deepEqual(notFound.nodeArgs, ["scripts/dependency-changeset.ts", ...WITHOUT_SETTLEMENT]);
  assert.equal(notFound.nodeReviews, null);
  assert.match(notFound.out, /::warning::could not read pull request #7's reviews or head/);
  const spent = run(DEPENDENCY, { reviews: [APPROVAL], script: { reviews: ["500", "500", "500", "500", "500", "500"] } }, PULL_REQUEST_ENV);
  assert.equal(spent.calls("reviews"), 5);
  assert.ok(noSettlement(spent.nodeArgs), `${spent.nodeArgs}`);
  const noHead = run(DEPENDENCY, { reviews: [APPROVAL], script: { head: ["404"] } }, QUEUE_ENV);
  assert.equal(noHead.calls("reviews"), 0, "with no head to judge by, the reviews are not read for nothing");
  assert.ok(noSettlement(noHead.nodeArgs), `${noHead.nodeArgs}`);
});

test("dependency: a ref that is not a queue entry's names no pull request: the step says so and check runs as it always did", () => {
  const refs = [
    "refs/heads/main",
    "refs/heads/gh-readonly-queue/main/pr-7",
    `refs/heads/gh-readonly-queue/main/pr-x-${"a".repeat(40)}`,
    `refs/heads/feature/gh-readonly-queue/main/pr-7-${"a".repeat(40)}`,
    `${QUEUE_REF}-and-more`,
    `not/${QUEUE_REF}`,
    "",
  ];
  for (const ref of refs) {
    const result = run(DEPENDENCY, {}, { ...QUEUE_ENV, QUEUE_REF: ref });
    assert.equal(result.code, 0, result.out);
    assert.equal(result.calls("reviews") + result.calls("head"), 0, `a read was made for ${JSON.stringify(ref)}`);
    assert.ok(noSettlement(result.nodeArgs), `${ref}: ${result.nodeArgs}`);
    assert.match(result.out, /::warning::no pull request number to read reviews from/);
  }
});

test("dependency: a base branch with a slash in it still names its pull request", () => {
  const result = run(DEPENDENCY, { reviews: [APPROVAL] }, { ...QUEUE_ENV, QUEUE_REF: `refs/heads/gh-readonly-queue/release/0.10/pr-5414-${"f".repeat(40)}` });
  assert.equal(result.code, 0, result.out);
  assert.equal(result.calls("reviews"), 1);
  assert.ok(result.nodeArgs?.includes("--head=queuehead1"));
});

// The `run` helper sets its own environment, so the step's env block is read from ci.yml: without GH_TOKEN the live reads fail,
// and the step falls back to today's refusal with no error to see.
test("dependency: the step hands its live reads the workflow token, so they are never anonymous", () => {
  assert.equal(DEPENDENCY_ENV.GH_TOKEN, "${{ github.token }}");
});

// ---------------------------------------------------------------------------------------------------------------------------------------
// 3. The sweep: every `gh` call in a step of ci.yml, and what each one does on a 5xx.

const RETRY_PATTERN = /grep -Eqi '([^']*HTTP 5\[0-9\]\[0-9\][^']*)'/;

test("the three copies of the 5xx pattern are the same text (a drift here is one step retrying what the other does not)", () => {
  const gate = RETRY_PATTERN.exec(AGREEMENT)?.[1];
  const body = RETRY_PATTERN.exec(NO_RELEASE)?.[1];
  const reviews = RETRY_PATTERN.exec(DEPENDENCY)?.[1];
  assert.ok(gate && body && reviews, "all three steps must carry the pattern the test looks for");
  assert.equal(body, gate);
  assert.equal(reviews, gate);
});

/** Every command-position `gh api|run|pr|issue` and every `agent-org` call in a step, as `job: command`. */
function ghCalls(): string[] {
  const found: string[] = [];
  for (const [job, { steps = [] }] of Object.entries(workflow.jobs)) {
    for (const step of steps) {
      const code = (step.run ?? "").split("\n").filter((line) => !/^\s*#/.test(line)).join("\n");
      for (const match of code.matchAll(/(?<![\w-])(gh (?:api|run|pr|issue)|agent-org [\w:-]+)/g)) found.push(`${job}: ${match[1]}`);
    }
  }
  return [...new Set(found)].sort();
}

const SWEPT: Record<string, string> = {
  "gate: gh api": "retried: both reads go through `gh_read`, whose one `gh api` is the call found here (tested in section 1)",
  "changeset: gh api": "retried: the inline loop in the `noRelease` step and `gh_read` in the `dependency` step, five reads on a 5xx or a transport error, a 4xx at once (sections 2 and 2b)",
  "bodyEdit: gh api": "already tolerant: a failed read answers `proseOnly=false` (more checks run, never a red one) and the step still exits 0",
};
const NOT_THIS_FILE = "agent-org's own reads of GitHub inside its CLI: whether they retry a 5xx is not read here, and a retry is a change to a11ign/agent-org";
const OUTSIDE: Record<string, string> = {
  "deliberateRefusals: agent-org merge-guard": NOT_THIS_FILE,
  "deliberateRefusals: agent-org closes-mismatch-check": NOT_THIS_FILE,
  "ownedPaths: agent-org owned-path-signoff": NOT_THIS_FILE,
};

test("the sweep: every gh call in ci.yml's steps is classified, and a new one fails here until it is", () => {
  const calls = ghCalls();
  assert.ok(calls.length >= 3, `the sweep found ${calls.length} calls: an empty population would pass for the wrong reason`);
  assert.deepEqual(calls, [...Object.keys(SWEPT), ...Object.keys(OUTSIDE)].sort(), "classify a new call in SWEPT (retried, or tolerant with a reason) or OUTSIDE");
});
