/**
 * A SINGLE URL BEHIND A LOGIN REPORTS THE LOGINS IT PERFORMED (#2645, finding (a) of #2561).
 *
 * The run stated a floor before it started and counted a tally the whole way, then dropped the tally: only a page list
 * (`runPages`) turned it into a report, so the comparison the docs ask a reader to make -- the floor against what the run
 * did, weighed against a lockout -- could not be made from the tool's own output.
 *
 * This file imports `multi-page.ts` and NOT `cli.ts`: `cli.ts` reaches `corpus`, which the token-less acceptance job does
 * not have. So the single-URL flow lives in `runSingleUrl` (which `cli.ts`'s `main` calls and does nothing else for a
 * single URL), and the worker seam is a stub that counts a login exactly where `captureViaWorker` and the rule layer's scan
 * do: once per ask, on the tally.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  captureCount, loginLine, loginReport, minimumLogins, multiPageJson, newLoginTally, rollUpLines, runSingleUrl,
  type LoginTally, type PageEntry,
} from "../multi-page.js";

const RESULT = { url: "https://app.example.test/orders", verdict: { findings: [] } };

/** What the CLI does for a run with a form-state list of `states` states, its worker seam asked `asks` times per capture. */
async function run({ states, tally, axe = true, asks, emitsResult = true, failAt }: {
  states: string[]; tally?: LoginTally; axe?: boolean; asks: number[]; emitsResult?: boolean; failAt?: number;
}) {
  const emitted: object[] = [];
  const said: string[] = [];
  const outcome = await runSingleUrl({
    states, tally, axe, emit: (json) => emitted.push(json), say: (line) => said.push(line),
    capture: async ({ index, sink }) => {
      // The worker seam: a login is counted when it is ASKED for, so a capture repeated because it did not read the page counts again.
      for (let ask = 0; ask < asks[index]; ask++) if (tally) tally.workerAttempts += 1;
      if (tally) tally.ruleLayerScans += 1;
      if (failAt === index) throw new Error("the capture ran out of time");
      if (emitsResult) sink({ ...RESULT, state: states[index] ?? null });
    },
  }).then(() => "ok", (error: Error) => error.message);
  return { emitted, said, outcome };
}

test("AN AUTHENTICATED SINGLE URL REPORTS THE LOGINS IT PERFORMED: one capture repeated once = 2 worker attempts + 1 rule-layer scan = 3, against a floor of 2", async () => {
  const tally = newLoginTally();
  const { emitted, said } = await run({ states: [], tally, asks: [2] });
  assert.equal(emitted.length, 1, "one result, as before");
  assert.deepEqual((emitted[0] as { logins?: unknown }).logins,
    { performed: 3, workerAttempts: 2, ruleLayerScans: 1, minimum: minimumLogins({ captures: 1, axe: true }) });
  assert.equal(minimumLogins({ captures: 1, axe: true }), 2);
  assert.deepEqual(said, [], "in --json the report is IN the result, not also said");
  assert.equal((emitted[0] as { url: string }).url, RESULT.url, "the result itself is untouched");
});

test("`performed` equals the logins the worker seam was asked for, whatever the seam does", async () => {
  for (const asks of [1, 2, 3]) {
    const tally = newLoginTally();
    const { emitted } = await run({ states: [], tally, axe: false, asks: [asks] });
    const report = (emitted[0] as { logins: { performed: number; ruleLayerScans: number } }).logins;
    assert.equal(report.performed, asks + report.ruleLayerScans, `${asks} asks`);
    assert.equal(report.performed, tally.workerAttempts + tally.ruleLayerScans);
  }
});

test("SEVERAL FORM STATES: the tally is cumulative, so the report is made once, on the LAST result, and every result is still emitted in order", async () => {
  const tally = newLoginTally();
  const { emitted } = await run({ states: ["empty", "invalid", "valid"], tally, asks: [1, 1, 2] });
  assert.deepEqual(emitted.map((json) => (json as { state: string }).state), ["empty", "invalid", "valid"]);
  assert.deepEqual(emitted.map((json) => "logins" in json), [false, false, true]);
  assert.deepEqual((emitted[2] as { logins: unknown }).logins,
    { performed: 7, workerAttempts: 4, ruleLayerScans: 3, minimum: minimumLogins({ captures: captureCount({ pages: 1, states: 3 }), axe: true }) });
});

test("with no JSON result (the human report) the report is ONE line, the list's own line", async () => {
  const tally = newLoginTally();
  const { emitted, said } = await run({ states: [], tally, asks: [1], emitsResult: false });
  assert.deepEqual(emitted, []);
  assert.deepEqual(said, ["Logins: 2 performed (1 capture attempts, 1 rule-layer scans); the minimum stated before the run was 2."]);
});

test("a run that logged in and then FAILED still reports what it performed, and still fails", async () => {
  const tally = newLoginTally();
  const { emitted, said, outcome } = await run({ states: [], tally, asks: [3], emitsResult: false, failAt: 0 });
  assert.equal(outcome, "the capture ran out of time", "the error is not swallowed");
  assert.deepEqual(emitted, []);
  assert.match(said[0], /^Logins: 4 performed \(3 capture attempts, 1 rule-layer scans\)/);
});

test("POSITIVE CONTROL: an unauthenticated single URL prints and returns no `logins`, so the tests above do not pass for a path that always reports one", async () => {
  const json = await run({ states: [], asks: [1] });
  assert.equal(json.emitted.length, 1);
  assert.ok(!("logins" in json.emitted[0]), "no logins field");
  assert.deepEqual(json.emitted[0], { ...RESULT, state: null }, "the result is byte-identical to what the seam handed over");
  const human = await run({ states: [], asks: [1], emitsResult: false });
  assert.deepEqual(human.said, [], "no line either");
});

test("POSITIVE CONTROL: the list path's report is unchanged for the same inputs (a literal, read before the change)", () => {
  const tally: LoginTally = { workerAttempts: 4, ruleLayerScans: 3 };
  const report = loginReport({ tally, minimum: minimumLogins({ captures: 3, axe: true }) });
  assert.equal(JSON.stringify(report), '{"performed":7,"workerAttempts":4,"ruleLayerScans":3,"minimum":6}');
  assert.equal(loginLine(report), "Logins: 7 performed (4 capture attempts, 3 rule-layer scans); the minimum stated before the run was 6.");
  const entries: PageEntry[] = [{ url: "https://a.example/", status: "captured", results: [] }];
  assert.equal(JSON.stringify(multiPageJson(entries, report)),
    '{"multiPage":true,"pages":[{"url":"https://a.example/","status":"captured","results":[]}],"logins":{"performed":7,"workerAttempts":4,"ruleLayerScans":3,"minimum":6}}');
  assert.deepEqual(rollUpLines(entries, report).at(-1), loginLine(report));
});
