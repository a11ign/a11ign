// no-token: gh -- reads this repository's own `nightly.yml` and `.github/chainguard/`, and calls nothing.
/**
 * #4195: `nightly.yml` mints two Octo STS tokens under policies bound to that workflow on `main`. The one stored-token read it had left (the
 * settings table, which a `metadata: read` token cannot reach) was retired by `ceo`'s ruling B on #4486: the table is a hand-run read.
 *
 * Pinned against the workflow's parsed YAML (not its text, where a comment mentioning a token would count):
 *   1. exactly the two jobs that mint hold `id-token: write`, and no other job in the file does (the permission is the right to mint);
 *   2. the board read's `octo-sts/action` step names a policy in `.github/chainguard/` that is bound to `nightly.yml` as it is on `main`
 *      through `job_workflow_ref` AND `ref`, because a `workflow_dispatch` on a branch presents that branch's `sub`. The ruleset read's
 *      policy is an ORGANISATION policy in `a11ign/.github` (#4330), whose file this repository cannot read: its step is pinned to the
 *      org scope and the identity name, and #4330's Acceptance pins the file;
 *   3. the ruleset loop is read with the minted token, and nothing in the step exports any other token or reads the settings table;
 *   4. `secrets.A11IGN_BOT_TOKEN` is read nowhere in the workflow, so a stored read cannot come back unnoticed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const WORKFLOW = ".github/workflows/nightly.yml";
const BOARD_JOB = "ready-audit";
const RULESET_JOB = "mainRulesetBinds";
const GAP_STEP = /^Ask GitHub, once per code repository/;
const ORG_SCOPE = "a11ign";
const ORG_IDENTITY = "nightly-ruleset-read-org";

type Step = { id?: string; name?: string; uses?: string; run?: string; with?: Record<string, string>; env?: Record<string, string> };
type Job = { permissions?: Record<string, string>; steps?: Step[] };
type Workflow = { jobs: Record<string, Job> };
type Policy = { issuer?: string; subject?: string; claim_pattern?: Record<string, string>; permissions?: Record<string, string> };

const read = (path: string) => readFileSync(`${REPO_ROOT}${path}`, "utf8");

/** Jobs holding `id-token: write`, by name. */
const minters = (workflow: Workflow) => Object.keys(workflow.jobs).filter((name) => workflow.jobs[name].permissions?.["id-token"] === "write");

/** Steps, by job, whose env or inputs contain a read of the stored token. */
function storedTokenReads(workflow: Workflow): { job: string; step: string }[] {
  return Object.entries(workflow.jobs).flatMap(([job, { steps = [] }]) =>
    steps.filter((s) => JSON.stringify([s.env, s.with]).includes("secrets.A11IGN_BOT_TOKEN")).map((s) => ({ job, step: s.name ?? "(unnamed)" })));
}

const octoStep = (workflow: Workflow, job: string) => workflow.jobs[job].steps?.find((s) => s.uses?.startsWith("octo-sts/action@"));

/** What is wrong with a policy as a binding of this workflow; empty means it is bound as intended. */
function bindingFaults(policy: Policy): string[] {
  const faults: string[] = [];
  if (policy.issuer !== "https://token.actions.githubusercontent.com") faults.push("issuer is not GitHub Actions'");
  if (!/^repo:a11ign@\d+\/a11ign@\d+:ref:refs\/heads\/main$/.test(policy.subject ?? "")) faults.push("subject is not the immutable-id form pinned to refs/heads/main");
  if (policy.claim_pattern?.job_workflow_ref !== "a11ign/a11ign/\\.github/workflows/nightly\\.yml@refs/heads/main") faults.push("job_workflow_ref is not nightly.yml@refs/heads/main");
  if (policy.claim_pattern?.ref !== "refs/heads/main") faults.push("ref is not refs/heads/main");
  return faults;
}

const workflow = parseYaml(read(WORKFLOW)) as Workflow;
const jobWith = (job: string, permissions: Record<string, string>): Workflow => ({ jobs: { [job]: { permissions } } });

test("#4195 POSITIVE CONTROLS: the checkers see a minter, a stored read and a mis-bound policy when they are there", () => {
  assert.deepEqual(minters(jobWith("a", { "id-token": "write" })), ["a"]);
  assert.deepEqual(minters(jobWith("a", { contents: "read" })), []);
  const stored: Workflow = { jobs: { j: { steps: [{ name: "s", env: { T: "${{ secrets.A11IGN_BOT_TOKEN }}" } }, { name: "t", env: { T: "${{ github.token }}" } }] } } };
  assert.deepEqual(storedTokenReads(stored), [{ job: "j", step: "s" }]);
  const good: Policy = parseYaml(read(".github/chainguard/nightly-board-read.sts.yaml"));
  assert.deepEqual(bindingFaults(good), []);
  assert.equal(bindingFaults({ ...good, subject: "repo:a11ign/a11ign:ref:refs/heads/main" }).length, 1, "the name form of the subject must be refused");
  assert.equal(bindingFaults({ ...good, claim_pattern: { ref: "refs/heads/main" } }).length, 1, "a policy without job_workflow_ref must be refused");
  assert.equal(bindingFaults({ ...good, claim_pattern: { job_workflow_ref: good.claim_pattern?.job_workflow_ref ?? "" } }).length, 1, "a policy without ref must be refused");
});

test("#4195: only the two jobs that mint hold id-token: write", () => {
  assert.deepEqual(minters(workflow).sort(), [RULESET_JOB, BOARD_JOB].sort());
});

test("#4195: the board read's step names a policy that exists, is bound to nightly.yml on main, and asks for no write", () => {
  const step = octoStep(workflow, BOARD_JOB);
  assert.ok(step, `${BOARD_JOB} has no octo-sts/action step`);
  assert.match(step.uses ?? "", /^octo-sts\/action@[0-9a-f]{40}\s*$/, "the action is pinned to a commit: this job holds id-token: write and then runs fetched code");
  assert.equal(step.with?.scope, "a11ign/a11ign");
  const policy = parseYaml(read(`.github/chainguard/${step.with?.identity}.sts.yaml`)) as Policy;
  assert.deepEqual(bindingFaults(policy), []);
  assert.deepEqual(policy.permissions, { issues: "read", pull_requests: "read", organization_projects: "read" });
  const writes = Object.entries(policy.permissions ?? {}).filter(([, level]) => level !== "read");
  assert.deepEqual(writes, [], "the board read is a read");
});

test("#4195: the audit runs on the minted token, not on a stored one or the workflow token", () => {
  const steps = workflow.jobs[BOARD_JOB].steps ?? [];
  const audit = steps.find((s) => s.run?.includes("agent-org ready:audit"));
  assert.ok(audit, `${BOARD_JOB} has no ready:audit step`);
  assert.equal(audit.env?.GH_TOKEN, `\${{ steps.${octoStep(workflow, BOARD_JOB)?.id}.outputs.token }}`);
  assert.ok(steps.indexOf(octoStep(workflow, BOARD_JOB) as Step) < steps.indexOf(audit), "the exchange must come before the audit");
});

test("#4195: the ruleset step mints under the organisation policy and reads the loop with that token, not the stored one", () => {
  const steps = workflow.jobs[RULESET_JOB].steps ?? [];
  const mint = octoStep(workflow, RULESET_JOB);
  assert.ok(mint, `${RULESET_JOB} has no octo-sts/action step`);
  assert.match(mint.uses ?? "", /^octo-sts\/action@[0-9a-f]{40}\s*$/, "pinned to a commit, as the board read's is");
  assert.deepEqual(mint.with, { scope: ORG_SCOPE, identity: ORG_IDENTITY }, "an organisation policy is named by the org, not by a repository");
  const read = steps.find((s) => GAP_STEP.test(s.name ?? ""));
  assert.ok(read, `${RULESET_JOB} has no step named like ${GAP_STEP}`);
  assert.ok(steps.indexOf(mint) < steps.indexOf(read), "the exchange must come before the read");
  assert.equal(read.env?.OCTO_TOKEN, `\${{ steps.${mint.id}.outputs.token }}`);
  const run = read.run ?? "";
  const loopAt = run.indexOf("A11Y_PROTECTION_REPO=");
  const asApp = run.indexOf('export GH_TOKEN="$OCTO_TOKEN"');
  assert.ok(asApp >= 0 && asApp < loopAt, "the protection loop must run with the minted token exported before it");
  assert.equal(run.match(/export GH_TOKEN=/g)?.length, 1, "the minted token is the only one this step exports");
  assert.ok(!/--include\s+\S*layer-repository-protection/.test(run), "the settings table is a hand-run read (#4486), not a step of this one");
});

test("#4486: no job reads the stored token, and the workflow says the settings table is a hand-run read", () => {
  assert.deepEqual(storedTokenReads(workflow), []);
  assert.match(read(WORKFLOW), /THE SETTINGS TABLE IS NOT READ HERE \(#4486/);
});
