// no-token: none -- reads two files of this repository and matches the policy's patterns against claim values measured on #4191.
/**
 * #4198: `auto-arm.yml` ARMS WITH AN OCTO STS TOKEN, AND THE POLICY BEHIND IT HOLDS ONLY WHAT ARMING NEEDS.
 *
 * Two halves, each with the control that shows it can fail:
 *   - the POLICY (`.github/chainguard/auto-arm.sts.yaml`): grants pull-request write and contents write and nothing else, and its patterns
 *     accept the `push`, `workflow_dispatch` and `pull_request_target` claims of main's copy of this workflow and refuse the ones measured on #4191 that are not.
 *     Octo STS matches every pattern against the WHOLE claim (v0.11.2 README), which `fullMatch` reproduces.
 *   - the WORKFLOW: `arm` and `sweep` each mint before they use, hold `id-token: write` and no other write, and no step falls back to
 *     `github.token` (the fallback is #416's defect restored quietly).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (path: string) => readFileSync(`${ROOT}${path}`, "utf8");

type Policy = { issuer: string; subject_pattern: string; claim_pattern: Record<string, string>; permissions: Record<string, string> };
type Step = { id?: string; uses?: string; with?: Record<string, string>; env?: Record<string, string>; run?: string };
type Job = { permissions?: Record<string, string>; steps: Step[] };

const fullMatch = (pattern: string, value: string) => new RegExp(`^(?:${pattern})$`).test(value);

const REPOSITORY_SUB = "repo:a11ign@320310787/a11ign@1280353940";
const WORKFLOW = "a11ign/a11ign/.github/workflows/auto-arm.yml";

/** Whether the policy would mint for a token with these claims; the claims are the ones #4191 read off real runs. */
function mints(policy: Policy, claims: { sub: string; job_workflow_ref: string; event_name: string }): boolean {
  return fullMatch(policy.subject_pattern, claims.sub)
    && Object.entries(policy.claim_pattern).every(([name, pattern]) => fullMatch(pattern, claims[name as keyof typeof claims] ?? ""));
}

const policyOf = (text: string) => parseYaml(text) as Policy;
const POLICY = policyOf(read(".github/chainguard/auto-arm.sts.yaml"));

test("#4198: the policy grants pull-request write and contents write, and nothing else", () => {
  assert.deepEqual(POLICY.permissions, { pull_requests: "write", contents: "write" });
});

test("#4198: the policy mints for the three runs of main's copy of this workflow and refuses the ones that are not its own", () => {
  const sub = (tail: string) => `${REPOSITORY_SUB}:${tail}`;
  const accepted = [
    ["push on main", { sub: sub("ref:refs/heads/main"), job_workflow_ref: `${WORKFLOW}@refs/heads/main`, event_name: "push" }],
    ["workflow_dispatch on main", { sub: sub("ref:refs/heads/main"), job_workflow_ref: `${WORKFLOW}@refs/heads/main`, event_name: "workflow_dispatch" }],
    // `pull_request_target` runs `main`'s copy and presents the same sub as `pull_request` (#4191), so the workflow ref is what is pinned.
    ["pull_request_target (main's copy)", { sub: sub("pull_request"), job_workflow_ref: `${WORKFLOW}@refs/heads/main`, event_name: "pull_request_target" }],
  ] as const;
  for (const [label, claims] of accepted) assert.ok(mints(POLICY, claims), `${label} must mint`);

  const refused = [
    ["another workflow in this repository", { sub: sub("ref:refs/heads/main"), job_workflow_ref: "a11ign/a11ign/.github/workflows/oidc-claims-probe.yml@refs/heads/main", event_name: "push" }],
    ["a dispatch on another branch", { sub: sub("ref:refs/heads/agent/x"), job_workflow_ref: `${WORKFLOW}@refs/heads/agent/x`, event_name: "workflow_dispatch" }],
    // THE GAP #4287's REVIEW CLOSED: a branch's own copy of the file must not mint, whatever its sub says.
    ["pull_request, the branch's copy of the file", { sub: sub("pull_request"), job_workflow_ref: `${WORKFLOW}@refs/pull/4226/merge`, event_name: "pull_request" }],
    // #4969: an approving review runs the branch's copy too, which is why `relay` mints nothing and hands the number to a dispatch on main.
    ["pull_request_review, the branch's copy of the file", { sub: sub("pull_request"), job_workflow_ref: `${WORKFLOW}@refs/pull/4226/merge`, event_name: "pull_request_review" }],
    ["pull_request_target claims carrying a branch's workflow ref", { sub: sub("pull_request"), job_workflow_ref: `${WORKFLOW}@refs/pull/4226/merge`, event_name: "pull_request_target" }],
    ["another repository's id", { sub: "repo:a11ign@320310787/other@1:ref:refs/heads/main", job_workflow_ref: `${WORKFLOW}@refs/heads/main`, event_name: "push" }],
    ["the name-form subject, which never matches (#4191)", { sub: "repo:a11ign/a11ign:ref:refs/heads/main", job_workflow_ref: `${WORKFLOW}@refs/heads/main`, event_name: "push" }],
    ["a workflow file merely ending the same way", { sub: sub("ref:refs/heads/main"), job_workflow_ref: `${WORKFLOW}.evil@refs/heads/main`, event_name: "push" }],
  ] as const;
  for (const [label, claims] of refused) assert.ok(!mints(POLICY, claims), `${label} must NOT mint`);
});

test("#4198 POSITIVE CONTROL for the matcher: a policy widened to any subject mints for what the real one refuses", () => {
  const widened = { ...POLICY, subject_pattern: ".*" };
  const claims = { sub: "repo:evil@1/evil@2:ref:refs/heads/main", job_workflow_ref: `${WORKFLOW}@refs/heads/main`, event_name: "push" };
  assert.ok(mints(widened, claims), "the matcher must be able to say yes");
  assert.ok(!mints(POLICY, claims), "and the real policy says no");
});

const jobs = () => (parseYaml(read(".github/workflows/auto-arm.yml")) as { jobs: Record<string, Job> }).jobs;
const MINTING_JOBS = ["arm", "sweep", "arm-approved"] as const;

test("#4198: arm, sweep and arm-approved mint the token for this identity, before the step that uses it, and hold no other write", () => {
  for (const name of MINTING_JOBS) {
    const job = jobs()[name]!;
    const mint = job.steps.findIndex((s) => s.uses?.startsWith("octo-sts/action@"));
    assert.ok(mint >= 0, `${name} must mint with octo-sts/action`);
    assert.equal(job.steps[mint]!.with?.identity, "auto-arm", `${name} must ask for the auto-arm identity`);
    const user = job.steps.findIndex((s) => s.env?.GH_TOKEN?.includes(`steps.${job.steps[mint]!.id}.outputs.token`));
    assert.ok(user > mint, `${name}: the step that reads the token must come AFTER the one that mints it`);
    assert.deepEqual(job.permissions, { contents: "read", "id-token": "write" }, `${name}: the writes come from the minted token, not GITHUB_TOKEN`);
  }
});

test("#4198: no step falls back to github.token or reads a stored token, and `stalled` (read-only) is left alone", () => {
  for (const name of MINTING_JOBS) {
    for (const step of jobs()[name]!.steps) {
      assert.ok(!Object.values(step.env ?? {}).some((v) => /github\.token|secrets\./.test(v)), `${name}: ${step.run ?? step.uses} reads a stored or fallback token`);
    }
  }
  assert.equal(jobs().stalled!.steps.some((s) => s.env?.GH_TOKEN === "${{ github.token }}"), true, "stalled is the one job that keeps GITHUB_TOKEN");
});

test("#4198 (#4287 review): the minting jobs never run the branch's copy of the file, and the action is pinned to its commit", () => {
  const text = read(".github/workflows/auto-arm.yml");
  const doc = parseYaml(text) as { on: Record<string, unknown> };
  assert.ok("pull_request_target" in doc.on, "arm needs the trigger that runs main's copy");
  const armIf = (jobs().arm as Job & { if: string }).if;
  assert.match(armIf, /github\.event_name == 'pull_request_target'/);
  assert.doesNotMatch(armIf, /github\.event_name == 'pull_request'(?!_)/, "arm must not run on pull_request");
  assert.match((jobs().sweep as Job & { if: string }).if, /github\.event_name != 'pull_request'(?!_)/, "sweep must refuse pull_request");
  assert.match((jobs().stalled as Job & { if: string }).if, /github\.event_name != 'pull_request_target'/, "stalled keeps pull_request only");
  for (const name of MINTING_JOBS) {
    const uses = jobs()[name]!.steps.find((s) => s.uses?.startsWith("octo-sts/action@"))!.uses!;
    assert.match(uses, /^octo-sts\/action@[0-9a-f]{40}$/, `${name}: pin the commit, not the movable tag`);
  }
});

type Gated = Job & { if: string };
const gated = (name: string) => jobs()[name] as Gated;

test("#4969: an approving review reaches arming only through `relay`, which mints nothing, and `arm-approved`, which runs as main's dispatch", () => {
  const doc = parseYaml(read(".github/workflows/auto-arm.yml")) as { on: Record<string, { types?: string[] }> };
  assert.deepEqual(doc.on.pull_request_review?.types, ["submitted"]);

  const relay = gated("relay");
  assert.deepEqual(relay.permissions, { actions: "write" }, "relay runs the branch's copy of the file: no id-token, no write beyond dispatching");
  assert.ok(!relay.steps.some((s) => s.uses?.startsWith("octo-sts/action@")), "relay must not mint: it runs on the branch's merge ref");
  assert.match(relay.if, /github\.event\.review\.state == 'approved'/, "a CHANGES_REQUESTED or COMMENTED review must do nothing");
  assert.match(relay.if, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/, "a fork head must do nothing");
  assert.match(relay.steps.map((s) => s.run ?? "").join("\n"), /gh workflow run auto-arm\.yml .*--ref main/, "the hand-off must name main's copy");

  const armApproved = gated("arm-approved");
  assert.match(armApproved.if, /github\.event_name == 'workflow_dispatch'/);
  assert.match(armApproved.if, /github\.ref == 'refs\/heads\/main'/, "the policy pins main, and the job must say so before it fails a mint");
  for (const other of ["arm", "sweep", "stalled"]) {
    assert.doesNotMatch(gated(other).if, /event_name == 'pull_request_review'/, `${other} must not run on the branch's copy because of a review`);
  }
  for (const other of ["sweep", "stalled"]) {
    assert.match(gated(other).if, /github\.event_name != 'pull_request_review'/, `${other} must refuse pull_request_review`);
    assert.match(gated(other).if, /github\.event\.inputs\.pr == ''/, `${other} must not run on a dispatch that names a pull request`);
  }
});

test("#4969: arm-approved acts on the API's reviewDecision, never on the dispatch, and leaves a held, forked or CHANGES_REQUESTED PR untouched", () => {
  const run = jobs()["arm-approved"]!.steps.map((s) => s.run ?? "").join("\n");
  const ready = run.indexOf("gh pr ready");
  assert.ok(ready >= 0, "an approved draft must be marked ready");
  assert.ok(run.indexOf(".reviewDecision != \"APPROVED\"") >= 0 && run.indexOf(".reviewDecision != \"APPROVED\"") < ready, "reviewDecision is read before the PR is touched");
  assert.ok(run.indexOf("startswith($prefix)") >= 0 && run.indexOf("startswith($prefix)") < ready, "a hold label is read before the PR is touched");
  assert.ok(run.indexOf(".isCrossRepository") >= 0 && run.indexOf(".isCrossRepository") < ready, "a fork head is refused before the PR is touched");
  assert.ok(run.indexOf("agent-org arm-pr") > ready, "arming goes through the one predicate (`arm-pr`) and follows the ready flip");
  assert.equal(jobs()["arm-approved"]!.steps.find((s) => s.env?.HOLD_PREFIX !== undefined)?.env?.HOLD_PREFIX, "hold:");
});
