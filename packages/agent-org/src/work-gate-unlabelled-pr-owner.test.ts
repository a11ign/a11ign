// no-token: gh -- pure: `decide` and `withClosingRowOwners` over in-memory rows and pull requests; nothing reaches `gh`, `git` or the network
/**
 * #2882: AN UNLABELLED RED PULL REQUEST GOES TO THE SESSION ITS OWN ROW NAMES.
 *
 * #2880 (`Closes #2875`) was opened before its worktree was stamped, so it carried no `session:` label while row #2875
 * carried `session:worker-2875`, and `pr-checks-failing` went to `product-manager` six times. The POSITIVE CONTROL for
 * every "falls back to `product-manager`" assertion is the same fixture with ONE thing changed -- the rows that DO name
 * one live session -- which is the first test; nothing here is asserted against an empty population.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, withClosingRowOwners } from "./work-gate.mjs";

type Fixture = Record<string, unknown>;

const RED = [{ name: "gate", status: "COMPLETED", conclusion: "FAILURE", startedAt: "2026-10-01T14:40:00Z" }];

const row = (number: number, ...labels: string[]) => ({ number, labels: labels.map((name) => ({ name })) });
const claimed = (number: number, session: string) => row(number, "in-progress", `session:${session}`);
const pr = (closes: number[], ...labels: string[]) => ({
  number: 2880, headRefOid: "24b0e94f00000000", isDraft: false, statusCheckRollup: RED,
  labels: labels.map((name) => ({ name })), closingIssuesReferences: closes.map((number) => ({ number })),
});

/** The `pr-checks-failing` orders a tick builds for these pull requests and rows, through the same wiring `main` uses. */
function failingOrders(prs: Fixture[], openRows: Fixture[]) {
  return decide({ prs: withClosingRowOwners(prs, openRows), readyRows: [], openRows })
    .filter((order) => order.cause === "pr-checks-failing");
}

test("an unlabelled red PR whose closed row holds one live session is addressed to it, under a causeKey carrying it", () => {
  const [order, ...rest] = failingOrders([pr([2875])], [claimed(2875, "worker-2875")]);
  assert.equal(rest.length, 0);
  assert.equal(order.session, "worker-2875");
  assert.equal(order.causeKey, "worker-2875/pr-checks-failing/pr-2880/24b0e94f");
  assert.match(order.prompt, /row it closes \(#2875\) is held by you/);
});

test("the same PR with rows naming nobody, a retired claim, no read at all or an unlisted row still goes to product-manager", () => {
  const fallsBack = (openRows: Fixture[], closes = [2875]) => {
    const [order] = failingOrders([pr(closes)], openRows);
    assert.equal(order.session, "product-manager");
    assert.equal(order.causeKey, "product-manager/pr-checks-failing/pr-2880/24b0e94f");
    assert.match(order.prompt, /It names no session\./);
  };
  fallsBack([row(2875, "in-progress")]); // claimed by nobody
  fallsBack([row(2875, "session:worker-2875")]); // a released claim: the label outlived `in-progress`
  fallsBack([]); // the rows were not read
  fallsBack([claimed(9999, "worker-9999")]); // a live row, but not the one this PR closes
  fallsBack([claimed(2875, "worker-2875")], []); // GitHub resolved no closing reference
});

test("two rows naming two different sessions are a question, so product-manager keeps it; two naming the SAME one are an answer", () => {
  const [split] = failingOrders([pr([2875, 2876])], [claimed(2875, "worker-2875"), claimed(2876, "worker-2876")]);
  assert.equal(split.session, "product-manager");
  const [same] = failingOrders([pr([2875, 2876])], [claimed(2875, "worker-2875"), claimed(2876, "worker-2875")]);
  assert.equal(same.session, "worker-2875");
});

test("a PR WITH its own label keeps it, whatever the row says", () => {
  const [order] = failingOrders([pr([2875], "session:worker-1")], [claimed(2875, "worker-2875")]);
  assert.equal(order.session, "worker-1");
  assert.equal(order.causeKey, "worker-1/pr-checks-failing/pr-2880/24b0e94f");
  assert.match(order.prompt, /carries your session label/);
});

test("the NOT CONVINCED order takes the row's session too, and keeps product-manager when the row names nobody", () => {
  const convinced = (closes: number[]) => ({
    ...pr(closes), statusCheckRollup: [{ name: "gate", status: "COMPLETED", conclusion: "SUCCESS" }],
    comments: [{ author: { login: "reviewer-2880" }, createdAt: "2026-10-01T15:00:00Z", body: "Re-read of `24b0e94f` -- **not convinced**." }],
  });
  const verdictOrders = (rows: Fixture[]) => decide({ prs: withClosingRowOwners([convinced([2875])], rows), readyRows: [], openRows: rows })
    .filter((order) => order.cause === "verdict-not-convinced");
  const [owned] = verdictOrders([claimed(2875, "worker-2875")]);
  assert.equal(owned?.session, "worker-2875");
  assert.match(owned.prompt, /row it closes \(#2875\) is held by you/);
  assert.equal(owned.causeKey.startsWith("worker-2875/verdict-not-convinced/"), true);
  const [unowned] = verdictOrders([]);
  assert.equal(unowned?.session, "product-manager");
});
