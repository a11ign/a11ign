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

const ci = triggersOf(readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8"));

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
