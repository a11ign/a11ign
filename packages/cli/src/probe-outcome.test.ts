/**
 * THE ENTRIES THAT PROBE A WORKER FROM THE PUBLISHED SIDE AND BY HAND SAY "DID NOT ANSWER", NEVER "DOWN", AND WAIT
 * LONG ENOUGH FOR THE SLOWEST HEALTHY BOX (#2683, split from #2655).
 *
 * Three entries reach a worker without being able to wake it (ADR 0012): `witness` (`worker-probe.ts`),
 * `auth:leak-check` (`scripts/auth-leak-worker-probe.mjs`) and `worker:compare` (`measure-guard.mjs`: its busy guard
 * and its vitals read). Each is tested THROUGH ITS OWN DEFAULT TIMEOUT, so putting an old number back in any one of
 * them fails that entry's test and no other's. Offline: every probe is a stub that models a worker as "answers after D
 * ms, but only if the caller waited that long".
 *
 * Kept out of the `corpus` closure: this file imports `worker-probe.ts` and the two `.mjs` modules, none of which
 * import `cli.ts`, and never `cli.ts` itself.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { WAKE_HINT, WORKER_PROBE_TIMEOUT_MS, describeProbe, probeHealth } from "@a11ign/worker-fleet/probe-outcome";
import { refuseIfNothingListening } from "./worker-probe.js";
import { workerProblem } from "../../../scripts/auth-leak-worker-probe.mjs";
import { refuseIfBusy, sampleVitals } from "../../worker-fleet/src/measure-guard.mjs";

/** The slowest healthy first-after-idle answer on the real fleet (a11y-worker-13/-14/-16, read by `orchestrator`, #2671). */
const SLOW_HEALTHY_MS = 3_090;
/** The loaded ceiling read in the same place: a box that has just stopped a capture, two 5 s PowerShell calls. */
const LOADED_MS = 10_000;
/** The numbers these entries used before #2683, read at `d119fb0f2`: `witness`, `auth:leak-check`, the busy guard. */
const OLD_TIMEOUTS_MS = [5_000, 8_000, 10_000];

const READY = { ok: true, ready: true, busy: false, vitals: { captures: 3, recoveries: 0 } };
const WORKER = "http://192.0.2.7:8765";

type Answer = { delayMs: number; json?: unknown; status?: number };
type Fail = { code?: string; message?: string };

/** A worker that answers after `delayMs`, unless the caller's own `timeoutMs` ran out first, as `requestJson` does. */
function slowWorker(answer: Answer) {
  const seen: number[] = [];
  const request = async (_url: string, { timeoutMs = 30_000 }: { timeoutMs?: number } = {}) => {
    seen.push(timeoutMs);
    if (answer.delayMs > timeoutMs) {
      throw Object.assign(new Error(`Request to ${_url} timed out after ${timeoutMs} ms`), { code: "ETIMEDOUT" });
    }
    const status = answer.status ?? 200;
    return { status, ok: status >= 200 && status < 300, text: "", json: answer.json };
  };
  return { request, seen };
}

/** A transport that fails at once with `code`, as a refused or unreachable box does. */
const failing = ({ code, message = "" }: Fail) => async () => { throw Object.assign(new Error(message), { code }); };

const SILENT = { delayMs: Infinity };
const NOT_DOWN = /\bdown\b|unreachable/i;

test("the timeout is a stated number that clears the slowest healthy box and a loaded one, and the OLD numbers did not", () => {
  assert.ok(WORKER_PROBE_TIMEOUT_MS > SLOW_HEALTHY_MS, "clears the 3.09 s box");
  assert.ok(WORKER_PROBE_TIMEOUT_MS >= LOADED_MS + 2_000, "clears a loaded box (about 10 s) with 2 s to spare");
  // The positive control for the two tests below: a timeout that CLEARS the slow box is what they prove is in use.
  assert.ok(OLD_TIMEOUTS_MS.every((old) => old < WORKER_PROBE_TIMEOUT_MS));
});

test("probeHealth: a timeout, a refusal, a not-ready box and a busy box are four different outcomes", async () => {
  assert.deepEqual(await probeHealth(WORKER, slowWorker(SILENT)), {
    outcome: "no-answer", timedOut: true,
    message: `ETIMEDOUT: Request to ${WORKER}/health timed out after ${WORKER_PROBE_TIMEOUT_MS} ms`,
  });
  assert.equal((await probeHealth(WORKER, { request: failing({ code: "ECONNREFUSED" }) })).outcome, "refused");
  const unreachable = await probeHealth(WORKER, { request: failing({ code: "EHOSTUNREACH", message: "no route" }) });
  assert.deepEqual(unreachable, { outcome: "no-answer", timedOut: false, message: "EHOSTUNREACH: no route" });
  const notReady = await probeHealth(WORKER, slowWorker({ delayMs: 0, json: { ready: false, reason: "NVDA is starting" } }));
  assert.equal(notReady.outcome, "not-ready");
  assert.equal((await probeHealth(WORKER, slowWorker({ delayMs: 0, json: { busy: true } }))).outcome, "busy");
  assert.equal((await probeHealth(WORKER, slowWorker({ delayMs: 0, json: READY }))).outcome, "ready");
});

test("THREE SENTENCES: only a refusal and the box's own ready:false say the box is up; silence says 'did not answer within T'", async () => {
  const timeout = describeProbe(await probeHealth(WORKER, slowWorker(SILENT)), { worker: WORKER });
  const refusal = describeProbe(await probeHealth(WORKER, { request: failing({ code: "ECONNREFUSED" }) }), { worker: WORKER });
  const notReady = describeProbe(
    await probeHealth(WORKER, slowWorker({ delayMs: 0, json: { ready: false, reason: "NVDA is starting" } })), { worker: WORKER });

  assert.match(timeout, /did not answer within 12 s/);
  assert.doesNotMatch(timeout, NOT_DOWN, "silence is unknown, and 'unreachable' is a claim too");
  assert.doesNotMatch(timeout, /\bis up\b/);
  assert.ok(timeout.includes(WAKE_HINT) && timeout.includes("npm run fleet:wake -- <name>"), "names how to wake it");

  assert.match(refusal, /machine is up/);
  assert.doesNotMatch(refusal, /did not answer/);
  assert.match(notReady, /is up and answered/);
  assert.match(notReady, /NVDA is starting/);
  assert.doesNotMatch(notReady, /did not answer/);
  assert.equal(new Set([timeout, refusal, notReady]).size, 3);
});

// ---- witness: `refuseIfNothingListening` ----

test("witness: a healthy box that answers after the OLD timeout and inside the new one is not refused", async () => {
  for (const delayMs of [SLOW_HEALTHY_MS, LOADED_MS]) {
    const box = slowWorker({ delayMs, json: READY });
    await refuseIfNothingListening(WORKER, { request: box.request });
    assert.deepEqual(box.seen, [WORKER_PROBE_TIMEOUT_MS], "the entry's own default is what the probe waited with");
  }
  assert.ok(LOADED_MS > OLD_TIMEOUTS_MS[0], "the loaded stub sits past witness's old 5 s, or it proves nothing");
});

test("witness: silence is 'did not answer within 12 s' and names the wake command; a refusal is the documented no-worker text", async () => {
  await assert.rejects(() => refuseIfNothingListening(WORKER, { request: slowWorker(SILENT).request }), (error: Error) => {
    assert.match(error.message, /did not answer within 12 s/);
    assert.doesNotMatch(error.message, NOT_DOWN);
    assert.match(error.message, /npm run fleet:wake -- <name>/);
    return true;
  });
  await assert.rejects(() => refuseIfNothingListening(WORKER, { request: failing({ code: "ECONNREFUSED" }) }), (error: Error) => {
    assert.match(error.message, /^No capture worker answered at http:\/\/192\.0\.2\.7:8765 \(nothing was configured/);
    assert.doesNotMatch(error.message, /did not answer/);
    return true;
  });
});

test("witness: a box that answered but says ready:false is up, is NOT refused, and the heads-up says so and why", async () => {
  const lines: string[] = [];
  const request = slowWorker({ delayMs: 0, json: { ready: false, reason: "NVDA is starting" } }).request;
  await refuseIfNothingListening(WORKER, { request, warn: (line) => lines.push(line) });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /answered, so it is up/);
  const ready: string[] = [];
  await refuseIfNothingListening(WORKER, { request: slowWorker({ delayMs: 0, json: READY }).request, warn: (l) => ready.push(l) });
  assert.deepEqual(ready, [], "a ready box says nothing");
});

// ---- auth:leak-check: `workerProblem` ----

test("auth:leak-check: a healthy box slower than the OLD 8 s and inside the new number proceeds; silence and refusal stop, in words", async () => {
  const slow = slowWorker({ delayMs: LOADED_MS, json: READY });
  assert.equal(await workerProblem(WORKER, { request: slow.request }), null);
  assert.deepEqual(slow.seen, [WORKER_PROBE_TIMEOUT_MS]);
  assert.ok(LOADED_MS > OLD_TIMEOUTS_MS[1], "past the old 8 s, or it proves nothing");

  const silent = await workerProblem(WORKER, { request: slowWorker(SILENT).request });
  assert.match(silent ?? "", /did not answer within 12 s/);
  assert.doesNotMatch(silent ?? "", NOT_DOWN);
  assert.match(silent ?? "", /npm run fleet:wake -- <name>/);
  assert.match(silent ?? "", /runs on the machine the worker runs on/);

  const refused = await workerProblem(WORKER, { request: failing({ code: "ECONNREFUSED" }) });
  assert.match(refused ?? "", /machine is up/);
  assert.doesNotMatch(refused ?? "", /did not answer/);
  // Answered, busy or not ready: not stopped here, the capture path's own recovery handles them, as before.
  assert.equal(await workerProblem(WORKER, { request: slowWorker({ delayMs: 0, json: { busy: true } }).request }), null);
});

// ---- worker:compare: `refuseIfBusy` and `sampleVitals` ----

test("worker:compare busy guard: a box answering after the OLD 10 s and inside the new number is free; silence refuses in words", async () => {
  const slow = slowWorker({ delayMs: LOADED_MS + 1_000, json: READY });
  await refuseIfBusy([WORKER], { what: "a throughput comparison", request: slow.request });
  assert.deepEqual(slow.seen, [WORKER_PROBE_TIMEOUT_MS]);
  assert.ok(LOADED_MS + 1_000 > OLD_TIMEOUTS_MS[2], "past the old 10 s, or it proves nothing");

  await assert.rejects(() => refuseIfBusy([WORKER], { what: "a throughput comparison", request: slowWorker(SILENT).request }),
    (error: Error) => {
      assert.match(error.message, /REFUSING to measure a throughput comparison: 1 of 1 worker\(s\) are not free/);
      assert.match(error.message, /did not answer within 12 s/);
      assert.doesNotMatch(error.message, NOT_DOWN);
      assert.match(error.message, /npm run fleet:wake -- <name>/);
      return true;
    });
  await assert.rejects(() => refuseIfBusy([WORKER], { what: "x", request: failing({ code: "ECONNREFUSED" }) }),
    (error: Error) => /machine is up/.test(error.message) && !/did not answer/.test(error.message));
  await assert.rejects(() => refuseIfBusy([WORKER], { what: "x", request: slowWorker({ delayMs: 0, json: { ready: false, reason: "warming" } }).request }),
    (error: Error) => /is up and answered/.test(error.message) && /warming/.test(error.message));
});

test("worker:compare vitals: read from a loaded box inside the timeout; a silent one yields null AND a stated reason", async () => {
  const loaded = slowWorker({ delayMs: LOADED_MS, json: READY });
  assert.deepEqual(await sampleVitals(WORKER, { request: loaded.request }), READY.vitals);
  assert.ok(loaded.seen[0] >= 20_000, `the vitals read waits ${loaded.seen[0]} ms, and its reading is that it is sampled after a capture`);

  const lines: string[] = [];
  assert.equal(await sampleVitals(WORKER, { request: slowWorker(SILENT).request, warn: (l) => lines.push(l) }), null);
  assert.equal(lines.length, 1, "the empty column has a reason, where it used to have none");
  assert.match(lines[0], /did not answer within 20 s/);
  assert.doesNotMatch(lines[0], NOT_DOWN);

  const refused: string[] = [];
  assert.equal(await sampleVitals(WORKER, { request: failing({ code: "ECONNREFUSED" }), warn: (l) => refused.push(l) }), null);
  assert.match(refused[0], /machine is up/);
});
