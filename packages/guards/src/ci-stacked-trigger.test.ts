// no-token: none -- reads .github/workflows/ci.yml; no network, no `gh`
// A11-370: a pull request stacked on another branch has that branch as its base, and `pull_request: branches: [main]` gave it no checks at all, so its reviewer (which starts on green checks) never started
// (agent-org#1984 on #1982, 2026-10-28). ci.yml's `pull_request` trigger has no base filter; `main` stays behind the merge queue's `merge_group` run, which keeps its filter.
//
// THE CHECK IS A FUNCTION OVER THE PARSED TRIGGERS, returning what is wrong, and it is run on a copy with the filter put back (a check that passes on everything would pass the real file too).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

type Triggers = Record<string, { branches?: string[]; types?: string[] } | null>;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const triggersOf = (text: string): Triggers => parseYaml(text).on;

/** Why a pull request with a base other than `main` would get no CI under `triggers`, or null when it would. */
function stackedGap(triggers: Triggers): string | null {
  const pull = triggers.pull_request;
  if (pull === undefined) return "ci.yml has no pull_request trigger";
  const branches = pull?.branches;
  if (branches === undefined) return null;
  return branches.some((pattern) => pattern !== "main") ? null : `pull_request is filtered to base ${branches.join(", ")}, so a pull request stacked on another branch gets no checks`;
}

const ciText = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");
const ci = triggersOf(ciText);
const jobsOf = (text: string): Record<string, { if?: string }> => parseYaml(text).jobs;

/** The jobs that build: a draft pull request must not run them (A11-370 review). */
const HEAVY = ["ts", "python", "board", "rulesFitness"] as const;
const DRAFT_SKIP = "!(github.event_name == 'pull_request' && github.event.pull_request.draft)";

/** Why a draft pull request would run a job that builds, or why marking it ready would start no run of them; null when neither. */
function draftGap(triggers: Triggers, jobs: Record<string, { if?: string }>): string | null {
  const running = HEAVY.filter((name) => !(jobs[name]?.if ?? "").includes(DRAFT_SKIP));
  if (running.length > 0) return `a draft pull request runs ${running.join(", ")}`;
  return triggers.pull_request?.types?.includes("ready_for_review") ? null : "marking a draft ready starts no run, so its jobs that build never run";
}

test("ci.yml runs on a pull request whose base is not main, so a stacked pull request has checks", () => {
  assert.equal(stackedGap(ci), null);
  assert.equal(ci.pull_request?.branches, undefined, "the pull_request trigger has no base filter at all");
});

test("the check sees the filter that left a stacked pull request with no CI", () => {
  assert.match(stackedGap({ ...ci, pull_request: { ...ci.pull_request, branches: ["main"] } }) ?? "", /filtered to base main/);
  assert.equal(stackedGap({ ...ci, pull_request: { ...ci.pull_request, branches: ["main", "admin/**"] } }), null);
});

test("main stays behind the merge queue: merge_group keeps its filter on main, and the pull_request types still carry edited", () => {
  assert.deepEqual(ci.merge_group?.branches, ["main"]);
  assert.ok(ci.pull_request?.types?.includes("edited"), "a body edit re-reads the changeset line");
});

test("a draft pull request runs none of the jobs that build, and marking it ready starts the run that does", () => {
  assert.equal(draftGap(ci, jobsOf(ciText)), null);
});

test("the draft check sees a job without the skip, and a trigger without ready_for_review", () => {
  const jobs = jobsOf(ciText);
  for (const name of HEAVY) assert.match(draftGap(ci, { ...jobs, [name]: { if: String(jobs[name]?.if).replace(DRAFT_SKIP, "true") } }) ?? "", new RegExp(`runs ${name}`));
  assert.match(draftGap({ ...ci, pull_request: { types: ["opened", "synchronize"] } }, jobs) ?? "", /starts no run/);
});
