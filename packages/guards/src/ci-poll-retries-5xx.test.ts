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

interface Step { id?: string; name?: string; run?: string }
const workflow = parseYaml(readFileSync(CI_YML, "utf8")) as { jobs: Record<string, { steps?: Step[] }> };

function stepScript(job: string, pick: (step: Step) => boolean): string {
  const step = workflow.jobs[job]?.steps?.find(pick);
  assert.ok(step?.run, `ci.yml job ${job} has no step the test can find; the test would be reading nothing`);
  return step.run;
}
const AGREEMENT = stepScript("gate", (s) => s.name?.startsWith("The other kind of run on this head agrees") === true);
const NO_RELEASE = stepScript("changeset", (s) => s.id === "noRelease");

// ---------------------------------------------------------------------------------------------------------------------------------------
// The fake `gh`: per endpoint, line N of `script-<key>` is the answer to call N (`ok` when the file is short), and `calls-<key>` counts them.

const FAKE_GH = `#!/bin/sh
# usage: gh api <path> [--jq ...]
case "$2" in
  */actions/workflows/ci.yml/runs?*) key=runs; body="$FIXTURES/runs.json" ;;
  */actions/runs/*/jobs?*) key=jobs; body="$FIXTURES/jobs.json" ;;
  */pulls/*) key=pulls; body="$FIXTURES/pulls.txt" ;;
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
`;
const FAKE_SLEEP = "#!/bin/sh\nexit 0\n";

interface Scenario { script?: Partial<Record<"runs" | "jobs" | "pulls", string[]>>; runs?: unknown[]; jobs?: unknown[] }
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
  for (const key of ["runs", "jobs", "pulls"] as const) {
    writeFileSync(join(dir, `script-${key}`), (scenario.script?.[key] ?? []).join("\n") + "\n");
    writeFileSync(join(dir, `calls-${key}`), "");
  }
  const file = join(dir, "step.sh");
  writeFileSync(file, script);
  const result = spawnSync("bash", ["-e", file], {
    encoding: "utf8",
    env: { PATH: `${join(dir, "bin")}:${process.env.PATH}`, FIXTURES: dir, REPO: "a11ign/a11ign", HEAD_SHA: "head1", ...env },
  });
  const calls = (key: string) => readFileSync(join(dir, `calls-${key}`), "utf8").split("\n").filter(Boolean).length;
  const nodeBody = existsSync(join(dir, "node-body")) ? readFileSync(join(dir, "node-body"), "utf8") : null;
  return { code: result.status, out: `${result.stdout}${result.stderr}`, calls, nodeBody };
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
// 3. The sweep: every `gh` call in a step of ci.yml, and what each one does on a 5xx.

const RETRY_PATTERN = /grep -Eqi '([^']*HTTP 5\[0-9\]\[0-9\][^']*)'/;

test("the two copies of the 5xx pattern are the same text (a drift here is one step retrying what the other does not)", () => {
  const gate = RETRY_PATTERN.exec(AGREEMENT)?.[1];
  const body = RETRY_PATTERN.exec(NO_RELEASE)?.[1];
  assert.ok(gate && body, "both steps must carry the pattern the test looks for");
  assert.equal(body, gate);
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
  "changeset: gh api": "retried: the inline loop in the `noRelease` step, five reads on a 5xx or a transport error, a 4xx at once (section 2)",
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
