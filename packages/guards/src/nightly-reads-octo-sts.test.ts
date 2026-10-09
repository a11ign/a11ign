// no-token: gh -- reads this repository's own `nightly.yml` and `.github/chainguard/`, and calls nothing.
/**
 * #4195: `nightly.yml`'s board read mints an Octo STS token under a policy bound to that workflow on `main`, and the one stored-token
 * read left is a NAMED GAP.
 *
 * Three things are pinned, each against the workflow's parsed YAML (not its text, where a comment mentioning a token would count):
 *   1. the job that mints holds `id-token: write`, and no other job in the file does (the permission is the right to mint);
 *   2. its `octo-sts/action` step names a policy that exists in `.github/chainguard/`, and that policy is bound to `nightly.yml` as it is
 *      on `main` through `job_workflow_ref` AND `ref`, because a `workflow_dispatch` on a branch presents that branch's `sub`;
 *   3. `secrets.A11IGN_BOT_TOKEN` is read exactly where the gap is named (the ruleset step), so a SECOND stored read cannot appear
 *      unnoticed and the gap cannot be closed without this test saying so.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const WORKFLOW = ".github/workflows/nightly.yml";
const MINTING_JOB = "ready-audit";
const GAP_STEP = /^Ask GitHub, once per code repository/;

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

const octoStep = (workflow: Workflow) => workflow.jobs[MINTING_JOB].steps?.find((s) => s.uses?.startsWith("octo-sts/action@"));

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

test("#4195: only the one job that mints holds id-token: write", () => {
  assert.deepEqual(minters(workflow), [MINTING_JOB]);
});

test("#4195: the minting step names a policy that exists, is bound to nightly.yml on main, and asks for no write", () => {
  const step = octoStep(workflow);
  assert.ok(step, `${MINTING_JOB} has no octo-sts/action step`);
  assert.match(step.uses ?? "", /^octo-sts\/action@[0-9a-f]{40}\s*$/, "the action is pinned to a commit: this job holds id-token: write and then runs fetched code");
  assert.equal(step.with?.scope, "a11ign/a11ign");
  const policy = parseYaml(read(`.github/chainguard/${step.with?.identity}.sts.yaml`)) as Policy;
  assert.deepEqual(bindingFaults(policy), []);
  assert.deepEqual(policy.permissions, { issues: "read", pull_requests: "read", organization_projects: "read" });
  const writes = Object.entries(policy.permissions ?? {}).filter(([, level]) => level !== "read");
  assert.deepEqual(writes, [], "the board read is a read");
});

test("#4195: the audit runs on the minted token, not on a stored one or the workflow token", () => {
  const steps = workflow.jobs[MINTING_JOB].steps ?? [];
  const audit = steps.find((s) => s.run?.includes("agent-org ready:audit"));
  assert.ok(audit, `${MINTING_JOB} has no ready:audit step`);
  assert.equal(audit.env?.GH_TOKEN, `\${{ steps.${octoStep(workflow)?.id}.outputs.token }}`);
  assert.ok(steps.indexOf(octoStep(workflow) as Step) < steps.indexOf(audit), "the exchange must come before the audit");
});

test("#4195: the one remaining stored-token read is the ruleset step, whose gap the workflow names", () => {
  const reads = storedTokenReads(workflow);
  assert.equal(reads.length, 1, `expected exactly the named gap, found ${JSON.stringify(reads)}`);
  assert.match(reads[0].step, GAP_STEP);
  assert.deepEqual(minters(workflow).filter((job) => job === reads[0].job), [], "the ruleset read must not share a job that mints");
  assert.match(read(WORKFLOW), /#4195, A NAMED GAP/);
});
