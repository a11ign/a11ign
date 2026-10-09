// requires: history
// no-token: gh -- reads the workflow and the policy as text and drives `git` in a temp directory with a bare repository as "origin"; the GH_TOKEN it names is a string asserted on in the workflow, never read, and nothing reaches the network
/**
 * #4331: THE MERGE THAT STALES `consumer-gate.yml`'S PIN STARTS ITS REPAIR. Eleven rows were filed by hand for one fault, so these tests pin
 * the decision (`scripts/consumer-gate-pin-needed.ts`) and the two files that act on it (`consumer-gate-pin.yml` and its Octo STS policy).
 *
 * What is pinned, and the wrong answer each guards against:
 *   1. THE POSITIVE CONTROL IS A DERIVED POPULATION, not a list: every first-parent commit of this checkout's history that changed `action.yml`
 *      and carried a readable pin is taken from `git log`, and each must say REGENERATE (its own change cannot be in the pin it carries).
 *      A floor of 9 (the rows above) says the derivation found them; a decider that always answered "nothing to do" fails every one.
 *   2. A COMMIT THAT TOUCHED NEITHER FILE CHANGES NOTHING: over a window of recent history, the decision at such a commit equals the
 *      decision at its parent, and the window holds both answers somewhere in this suite (the fixture below is the REGENERATE side).
 *   3. THE WORKFLOW HAS NO STORED TOKEN, mints under a policy bound to `main`, and cannot be tricked by a branch: pinned by reading both files.
 *   4. A RELEASE IS RE-DISPATCHED ONLY FOR THE STALE PIN: a run that failed elsewhere is not retried, a green one is not either.
 *   5. A STALE PIN IS EXCUSED ONLY WHILE ITS REPAIR IS OPEN AND ITSELF CURRENT.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import {
  pinDecision, decideAtCommit, releaseOwed, regenerationInFlight, REGENERATE, NOTHING_TO_DO, REGENERATION_BRANCH, CONSUMER_GATE_PATH,
} from "../../../scripts/consumer-gate-pin-needed.ts";
import { sandboxGitEnv, withGitSandbox, type GitSandbox } from "../../../scripts/test-support/git-sandbox.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");


const ACTION_YML_COMMITS_FLOOR = 9;
const WINDOW = 300;
const WORKFLOW = readFileSync(join(REPO_ROOT, ".github/workflows/consumer-gate-pin.yml"), "utf8");
const POLICY = readFileSync(join(REPO_ROOT, ".github/chainguard/consumer-gate-pin-write.sts.yaml"), "utf8");

const gitIn = (cwd: string, args: string[]) => execFileSync("git", args, { cwd, env: sandboxGitEnv(), encoding: "utf8" });
const gate = (pin: string) => `jobs:\n  a11y:\n    steps:\n      - uses: a11ign/a11ign@${pin}\n`;

/** Commits `files` (path -> text) in one commit and returns its sha. */
function commitFiles(sandbox: GitSandbox, files: Record<string, string>): string {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(sandbox.dir, path)), { recursive: true });
    writeFileSync(join(sandbox.dir, path), text);
    sandbox.run(["add", path]);
  }
  sandbox.commit(`commit ${Object.keys(files).join(", ")}`);
  return sandbox.run(["rev-parse", "HEAD"]).trim();
}

/** A fixture history: action.yml v1 pinned, then v2 on top (the pin is now stale), then an unrelated commit. */
function staleFixture(sandbox: GitSandbox) {
  sandbox.run(["init", "-q", "-b", "main"]);
  const v1 = commitFiles(sandbox, { "action.yml": "v1\n" });
  const pinned = commitFiles(sandbox, { [CONSUMER_GATE_PATH]: gate(v1) });
  const v2 = commitFiles(sandbox, { "action.yml": "v2\n" });
  const unrelated = commitFiles(sandbox, { "docs/x.md": "x\n" });
  const repaired = commitFiles(sandbox, { [CONSUMER_GATE_PATH]: gate(v2) });
  return { v1, pinned, v2, unrelated, repaired };
}

test("pinDecision: a pin that predates action.yml says REGENERATE, a pin that contains it says nothing to do", () => {
  withGitSandbox((sandbox) => {
    const { v1, v2 } = staleFixture(sandbox);
    assert.equal(pinDecision({ pin: v1, head: v2, cwd: sandbox.dir }).action, REGENERATE, "the positive control");
    assert.equal(pinDecision({ pin: v2, head: v2, cwd: sandbox.dir }).action, NOTHING_TO_DO, "the clean counterpart");
  });
});

test("pinDecision: a pin that is not an ancestor of the commit is REGENERATE too (check-pin's first refusal), an unresolvable one throws", () => {
  withGitSandbox((sandbox) => {
    sandbox.run(["init", "-q", "-b", "main"]);
    const base = commitFiles(sandbox, { "action.yml": "v1\n" });
    sandbox.run(["switch", "-q", "-c", "side"]);
    const side = commitFiles(sandbox, { "other.txt": "side\n" });
    sandbox.run(["switch", "-q", "--detach", base]); // by commit, not by branch name: the fixture does not depend on what `init` calls its first branch
    const head = commitFiles(sandbox, { "other.txt": "main\n" });
    assert.equal(pinDecision({ pin: side, head, cwd: sandbox.dir }).action, REGENERATE);
    assert.match(pinDecision({ pin: side, head, cwd: sandbox.dir }).reason, /not an ancestor/);
    assert.equal(pinDecision({ pin: base, head, cwd: sandbox.dir }).action, NOTHING_TO_DO, "the clean counterpart: an ancestor, action.yml unchanged");
    assert.throws(() => pinDecision({ pin: "0123456789abcdef0123456789abcdef01234567", head, cwd: sandbox.dir }), /failed|could not compare/);
  });
});

test("decideAtCommit: the pin is the one THAT commit carries, so the answer follows the history through the repair", () => {
  withGitSandbox((sandbox) => {
    const { pinned, v2, unrelated, repaired } = staleFixture(sandbox);
    const answers = [pinned, v2, unrelated, repaired].map((commit) => decideAtCommit({ commit, cwd: sandbox.dir }).action);
    assert.deepEqual(answers, [NOTHING_TO_DO, REGENERATE, REGENERATE, NOTHING_TO_DO]);
  });
});

test("decideAtCommit: a commit with no consumer-gate.yml, or one that pins nothing, is an error and never 'nothing to do'", () => {
  withGitSandbox((sandbox) => {
    sandbox.run(["init", "-q", "-b", "main"]);
    const bare = commitFiles(sandbox, { "action.yml": "v1\n" });
    assert.throws(() => decideAtCommit({ commit: bare, cwd: sandbox.dir }), /failed/);
    const pinless = commitFiles(sandbox, { [CONSUMER_GATE_PATH]: "jobs: {}\n" });
    assert.throws(() => decideAtCommit({ commit: pinless, cwd: sandbox.dir }), /no "uses:|pins no commit/);
  });
});

// --- 1. the derived positive control ------------------------------------------------------------------------------------------------

/** The first-parent commits of this checkout's history that changed `action.yml` and carry a pin THAT RESOLVES; the rest are counted, not hidden. */
function actionYmlCommits() {
  const commits = gitIn(REPO_ROOT, ["log", "--first-parent", "--format=%H", "HEAD", "--", "action.yml"]).split("\n").filter(Boolean);
  const readable: { commit: string; action: string }[] = [];
  const unreadable: string[] = [];
  for (const commit of commits) {
    try {
      readable.push({ commit, action: decideAtCommit({ commit, cwd: REPO_ROOT }).action });
    } catch {
      unreadable.push(commit); // the diagnostic is the count asserted below: a commit with no gate file or a pin git cannot resolve
    }
  }
  return { total: commits.length, readable, unreadable };
}

test("#4331 POSITIVE CONTROL (derived): every action.yml commit in this history says REGENERATE -- its own change cannot be in the pin it carries", () => {
  const { total, readable, unreadable } = actionYmlCommits();
  console.log(`  ${total} first-parent commits changed action.yml: ${readable.length} readable, ${unreadable.length} carried no readable pin`);
  assert.ok(readable.length >= ACTION_YML_COMMITS_FLOOR, `only ${readable.length} readable action.yml commits found, the floor is ${ACTION_YML_COMMITS_FLOOR}`);
  assert.deepEqual(readable.filter((r) => r.action !== REGENERATE), [], "an action.yml commit the decider would leave alone");
});

// --- 2. the derived negative control -------------------------------------------------------------------------------------------------

test("#4331: a commit that touched neither action.yml nor consumer-gate.yml decides as its parent did, over a window of recent history", () => {
  const window = gitIn(REPO_ROOT, ["log", "--first-parent", `-n${WINDOW}`, "--format=%H %P", "HEAD"]).split("\n").filter(Boolean)
    .map((line) => line.split(" ")).filter(([, parent]) => parent !== undefined);
  const decisions = new Map<string, string>();
  const at = (commit: string) => {
    if (!decisions.has(commit)) decisions.set(commit, decideAtCommit({ commit, cwd: REPO_ROOT }).action);
    return decisions.get(commit) as string;
  };
  const untouched = window.filter(([commit, parent]) => {
    const changed = gitIn(REPO_ROOT, ["diff", "--name-only", parent, commit, "--", "action.yml", CONSUMER_GATE_PATH]).trim();
    return changed === "";
  });
  assert.ok(untouched.length >= WINDOW / 2, `only ${untouched.length} of ${window.length} commits touched neither file: the window is too small to mean anything`);
  assert.deepEqual(untouched.filter(([commit, parent]) => at(commit) !== at(parent)), [], "a commit touching neither file changed the answer");
  assert.ok(untouched.some(([commit]) => at(commit) === NOTHING_TO_DO), "the window never says 'nothing to do', so the equality above is vacuous");
});

test("#4331: the REGENERATE side of the same property, in a fixture where an unrelated commit follows an action.yml change", () => {
  withGitSandbox((sandbox) => {
    const { v2, unrelated } = staleFixture(sandbox);
    assert.equal(decideAtCommit({ commit: v2, cwd: sandbox.dir }).action, REGENERATE);
    assert.equal(decideAtCommit({ commit: unrelated, cwd: sandbox.dir }).action, REGENERATE, "still stale, whatever the push touched");
  });
});

test("#4331: the live tree -- the committed pin is current at HEAD, so a dispatch on main today answers 'nothing to do'", () => {
  assert.equal(decideAtCommit({ commit: "HEAD", cwd: REPO_ROOT }).action, NOTHING_TO_DO);
});

// --- 3. the workflow and its policy --------------------------------------------------------------------------------------------------

type Step = { uses?: string; run?: string; if?: string; with?: Record<string, string>; env?: Record<string, string> };
type Job = { permissions?: Record<string, string>; if?: string; steps: Step[] };
const workflow = parseYaml(WORKFLOW) as { on: Record<string, { branches?: string[]; paths?: string[] } | null>; permissions: unknown; jobs: Record<string, Job> };
const policy = parseYaml(POLICY) as { subject: string; claim_pattern: Record<string, string>; permissions: Record<string, string> };

/** Octo STS matches a pattern against the WHOLE claim. */
const wholeMatch = (pattern: string, value: string) => new RegExp(`^(?:${pattern})$`).test(value);

test("#4331: the workflow runs on a push to main that touches action.yml or consumer-gate.yml, and on dispatch -- never on a pull request", () => {
  assert.deepEqual(Object.keys(workflow.on).sort(), ["push", "workflow_dispatch"]);
  assert.deepEqual(workflow.on.push?.branches, ["main"]);
  assert.deepEqual(workflow.on.push?.paths?.slice().sort(), [CONSUMER_GATE_PATH, "action.yml"].sort());
  assert.deepEqual(workflow.permissions, {}, "no workflow-level grant: each job declares its own");
});

test("#4331: NO STORED TOKEN -- the only secret-shaped value is the minted one, and the mint has no GITHUB_TOKEN fallback", () => {
  assert.doesNotMatch(WORKFLOW, /\$\{\{\s*secrets\./, "a stored secret");
  const regenerate = workflow.jobs.regenerate;
  const mint = regenerate.steps.find((step) => step.uses?.startsWith("octo-sts/action@"));
  assert.ok(mint, "the regenerate job mints through Octo STS");
  assert.equal(mint.with?.identity, "consumer-gate-pin-write");
  const writes = regenerate.steps.filter((step) => step.env?.GH_TOKEN !== undefined);
  assert.ok(writes.length > 0, "positive control: some step writes");
  for (const step of writes) assert.match(step.env?.GH_TOKEN ?? "", /steps\.octo-sts\.outputs\.token/, "a write that does not use the minted token");
});

test("#4331: id-token is held by the one job that mints, and only that job; the release job holds actions: write and nothing that mints", () => {
  assert.equal(workflow.jobs.regenerate.permissions?.["id-token"], "write");
  assert.equal(workflow.jobs.decide.permissions?.["id-token"], undefined);
  assert.equal(workflow.jobs.release.permissions?.["id-token"], undefined);
  assert.deepEqual(workflow.jobs.release.permissions, { contents: "read", actions: "write" });
  assert.deepEqual(workflow.jobs.decide.permissions, { contents: "read" });
});

test("#4331: the regeneration runs the generator, refuses any change but consumer-gate.yml, and pushes the ONE branch the in-flight reading looks for", () => {
  const text = workflow.jobs.regenerate.steps.map((s) => s.run ?? "").join("\n");
  assert.match(text, /node scripts\/generate-consumer-gate\.mjs/);
  assert.ok(text.includes('" != " M .github/workflows/consumer-gate.yml" ]'), "the only-consumer-gate.yml guard");
  const pushStep = workflow.jobs.regenerate.steps.find((s) => s.env?.BRANCH !== undefined);
  assert.equal(pushStep?.env?.BRANCH, REGENERATION_BRANCH, "the workflow and the in-flight reading name different branches");
  assert.match(pushStep?.run ?? "", /Closes: none -- /, "the pull request it opens declares Closes");
  assert.match(pushStep?.run ?? "", /^\s*Acceptance:$/m, "and an Acceptance section");
});

test("#4331: a push refused for the 'workflows' permission says so and says the repair goes another way; the policy is NOT widened to avoid it", () => {
  const pushStep = workflow.jobs.regenerate.steps.find((s) => s.env?.BRANCH !== undefined);
  const text = pushStep?.run ?? "";
  assert.match(text, /if ! push_log="\$\(git push --force .*2>&1\)"; then/, "the push's stderr is captured, not left to a bare 'remote rejected'");
  assert.match(text, /grep -qi 'workflows'/, "the refusal is classified by the message GitHub gives");
  assert.match(text, /::error::the push was refused for the 'workflows' permission.*pushed another way/, "and the error names the permission and the way out");
  assert.equal("workflows" in policy.permissions, false, "the answer to a workflows refusal is not to grant it");
});

test("#4331: the policy binds the token to this workflow as it is on main, and to a subject of main", () => {
  const ref = policy.claim_pattern.job_workflow_ref;
  const onMain = "a11ign/a11ign/.github/workflows/consumer-gate-pin.yml@refs/heads/main";
  assert.ok(wholeMatch(ref, onMain), "positive control: the workflow on main mints");
  for (const refused of [onMain.replace("refs/heads/main", "refs/pull/7/merge"), onMain.replace("refs/heads/main", "refs/heads/feature"),
    onMain.replace("consumer-gate-pin.yml", "auto-arm.yml"), onMain.replace("consumer-gate-pin.yml", "consumer-gate-pin.yml.evil")]) {
    assert.equal(wholeMatch(ref, refused), false, `${refused} would mint`);
  }
  assert.match(policy.subject, /^repo:a11ign@\d+\/a11ign@\d+:ref:refs\/heads\/main$/, "a subject of main, written with immutable ids");
  const events = policy.claim_pattern.event_name;
  assert.ok(wholeMatch(events, "push") && wholeMatch(events, "workflow_dispatch"), "positive control: both triggers mint");
  for (const refused of ["pull_request", "pull_request_target", "schedule"]) assert.equal(wholeMatch(events, refused), false, `${refused} would mint`);
  assert.deepEqual(Object.keys(policy.claim_pattern).sort(), ["event_name", "job_workflow_ref"]);
});

test("#4331: the policy grants contents and pull-request write on this repository, and nothing else", () => {
  assert.deepEqual(policy.permissions, { contents: "write", pull_requests: "write" });
  assert.doesNotMatch(POLICY, /^repositories:/m, "a repository policy cannot name another repository");
});

// --- 4. the release owed after the repair -------------------------------------------------------------------------------------------

const run = (id: number, conclusion: string | null, failedJobs: string[] = []) => ({
  id, conclusion, jobs: [{ name: "guards", conclusion: "success" }, ...failedJobs.map((name) => ({ name, conclusion: "failure" }))],
});

test("releaseOwed: only a newest run that died in consumer-gate / check-pin is owed a release", () => {
  const stale = releaseOwed({ runs: [run(2, "failure", ["consumer-gate / check-pin"]), run(1, "success")] });
  assert.equal(stale.owed, true, "the positive control: the run #4315's merge started");
  assert.equal(releaseOwed({ runs: [run(2, "success"), run(1, "failure", ["consumer-gate / check-pin"])] }).owed, false, "a later run already had its chance");
  assert.equal(releaseOwed({ runs: [run(2, "failure", ["guards / lint"])] }).owed, false, "another cause is not fixed by a re-dispatch");
  assert.equal(releaseOwed({ runs: [run(2, null, ["consumer-gate / check-pin"]), run(1, "success")] }).owed, false, "an in-progress run is not the newest completed one");
  assert.equal(releaseOwed({ runs: [] }).owed, false);
});

// --- 5. the stale pin excused only while its repair is open and current -------------------------------------------------------------

function withRemote(fn: (sandbox: GitSandbox, remote: string) => void) {
  withGitSandbox((sandbox) => {
    const remote = mkdtempSync(join(tmpdir(), "consumer-gate-pin-remote-"));
    gitIn(remote, ["init", "--bare", "-q"]);
    sandbox.run(["remote", "add", "origin", remote]);
    fn(sandbox, remote);
  });
}

test("regenerationInFlight: no branch on origin is not in flight; a branch carrying a current pin is; a branch whose pin is itself stale is not", () => {
  withRemote((sandbox) => {
    const { pinned, repaired } = staleFixture(sandbox);
    const absent = regenerationInFlight({ base: repaired, cwd: sandbox.dir });
    assert.equal(absent.inFlight, false);
    assert.match(absent.reason, /no regeneration is open/);
    sandbox.run(["push", "-q", "origin", `${repaired}:refs/heads/${REGENERATION_BRANCH}`]);
    assert.equal(regenerationInFlight({ base: repaired, cwd: sandbox.dir }).inFlight, true, "the positive control");
    sandbox.run(["push", "-q", "--force", "origin", `${pinned}:refs/heads/${REGENERATION_BRANCH}`]);
    const stale = regenerationInFlight({ base: repaired, cwd: sandbox.dir });
    assert.equal(stale.inFlight, false, "a repair that is itself stale excuses nothing");
    assert.match(stale.reason, /itself stale/);
  });
});

test("regenerationInFlight: a remote it cannot reach throws -- not being able to ask is never 'no repair is open'", () => {
  withGitSandbox((sandbox) => {
    sandbox.run(["init", "-q", "-b", "main"]);
    const base = commitFiles(sandbox, { "action.yml": "v1\n" });
    sandbox.run(["remote", "add", "origin", join(tmpdir(), "consumer-gate-pin-no-such-remote")]);
    assert.throws(() => regenerationInFlight({ base, cwd: sandbox.dir }), /ls-remote.*failed/);
  });
});
