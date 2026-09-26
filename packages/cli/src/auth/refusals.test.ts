// WHAT AN AUTHENTICATED RUN REFUSES (ADR 0038, clauses 1 and 5, amendment 3) — AND THE ACKNOWLEDGEMENT IT INSISTS ON.
//
// The first thing the ADR's own falsifier says is: "any run in remote-worker mode that produces a report has
// falsified Constraint 1's enforcement, and the test that shows it is the first one the build row writes." So
// the first tests here drive the real `captureViaWorker` and the real `captureAndScan`, not only the pure
// decision, and assert that NOTHING WAS SENT: the refusal is worth having only if it comes before the socket.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { AUTH_FAULTS, AuthError, isAuthFault } from "./auth-faults.js";
import {
  isRemoteWorker,
  judgeBackendDecision,
  refuseAuthOnPublicRepository,
  refuseAuthOnRemoteWorker,
  requireAuthApplied,
  type AuthRequest,
} from "./refusals.js";
import { captureAndScan, captureViaWorker, type CaptureRequest } from "../cli.js";
import { FAULT_REMEDIATION, formatAuthFaultMessage } from "../fault-remediation.js";

const AUTH: AuthRequest = { login: [{ goto: "/login" }, { expect: { kind: "heading", name: "Dashboard", timeoutSeconds: 10 } }] };
const REQUEST: Omit<CaptureRequest, "worker"> = {
  task: "read the page", probeForms: false, probeFocus: false, probeNavigation: false,
  probeFocusContext: false, probeFocusReveal: false,
};

const HTTP_OK = 200;
const AUTH_FAULT_COUNT = 11; // the row's eight, plus amendment 2's and amendment 3's, plus #2563's auth-session-lost

/** A test that waits longer than this has found a hang, and must say so rather than wait. */
const DEADLINE_MS = 8_000;

/**
 * A worker listening on this machine that ADDRESS-WISE is not local. `0.0.0.0` is not loopback, so
 * `isRemoteWorker` reads it as remote, and on Linux and macOS a connection to it reaches a listener here. A run
 * the refusal fails to stop therefore lands in `received`, which is what "nothing was sent" is asserted against —
 * a real socket, not a spy on the transport, because a spy that silently sees nothing would pass every test below.
 */
async function listener(address: "0.0.0.0" | "127.0.0.1", body: object = { transcript: ["Home"] }) {
  const received: unknown[] = [];
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      received.push(JSON.parse(raw || "{}"));
      res.writeHead(HTTP_OK);
      res.end(JSON.stringify(body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "0.0.0.0", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://${address}:${port}`, received,
    close: () => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }),
  };
}

const settle = async <T>(run: () => Promise<T>): Promise<PromiseSettledResult<T>> => {
  const deadline = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`no answer within ${DEADLINE_MS} ms`)), DEADLINE_MS).unref();
  });
  const [outcome] = await Promise.allSettled([Promise.race([run(), deadline])]);
  return outcome;
};

const rejectedWith = (outcome: PromiseSettledResult<unknown>): unknown =>
  outcome.status === "rejected" ? outcome.reason : undefined;

test("A REMOTE WORKER + AN AUTH REQUEST: captureViaWorker refuses with the named error, and sends nothing", async () => {
  const remote = await listener("0.0.0.0");
  try {
    const outcome = await settle(() => captureViaWorker("https://app.example.test/", {
      ...REQUEST, worker: remote.url, auth: AUTH,
    }));
    const reason = rejectedWith(outcome);
    assert.ok(reason instanceof AuthError, `expected an AuthError, got ${String(reason)}`);
    assert.equal(reason.fault, "auth-refused-remote-worker");
    assert.deepEqual(remote.received, [], "the refusal must come BEFORE the request body is built and sent");
  } finally { await remote.close(); }
});

test("the same run without an auth request is untouched: the refusal is for authentication, not for remote workers", async () => {
  const remote = await listener("0.0.0.0");
  try {
    const cap = await captureViaWorker("https://app.example.test/", { ...REQUEST, worker: remote.url });
    // This is the positive control for the test above: this listener IS reachable at this address, so an empty
    // `received` there means the refusal stopped the request and not that the address was unreachable.
    assert.deepEqual(cap.transcript, ["Home"]);
    assert.equal(remote.received.length, 1);
  } finally { await remote.close(); }
});

test("captureAndScan refuses FIRST, so the rule layer's browser never launches beside a refused capture", async () => {
  const remote = await listener("0.0.0.0");
  const written: string[] = [];
  const realWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string) => { written.push(String(chunk)); return true; }) as never;
  try {
    const outcome = await settle(() => captureAndScan({
      ...REQUEST, url: "https://app.example.test/", worker: remote.url, wantAxe: true, axeResults: null, auth: AUTH,
    }));
    const reason = rejectedWith(outcome);
    assert.ok(reason instanceof AuthError && reason.fault === "auth-refused-remote-worker", String(reason));
    assert.deepEqual(remote.received, []);
    // `Scanning <url> ...` is printed after the rule layer is chosen and just before the two layers start.
    assert.ok(!written.some((line) => line.startsWith("Scanning")), "the run announced a scan it then refused");
  } finally { process.stderr.write = realWrite; await remote.close(); }
});

test("the refusal reads as the ADR prints it: the situation, the code, then what / try / see", () => {
  assert.throws(() => refuseAuthOnRemoteWorker({ worker: "http://192.0.2.10:8765", auth: AUTH }), (e: Error) => {
    assert.ok(e instanceof AuthError);
    const text = formatAuthFaultMessage(e.fault, e.message);
    assert.match(text, /^The worker at 192\.0\.2\.10:8765 is remote, and this run needs to log in\./);
    assert.match(text, /a session is a credential\. Nothing was sent and no page was examined\. \(fault: auth-refused-remote-worker\)/);
    assert.match(text, /\n {2}What happened: the run asked for authentication and its worker is not on this machine\./);
    assert.match(text, /\n {2}Try: run the capture on the same machine as the browser \(the GitHub Action does this\)/);
    assert.match(text, /\n {2}See: docs\/adr\/0038-authenticated-capture\.md, Constraint 1\./);
    return true;
  });
});

test("what counts as remote is decided from the address, and only loopback is local", () => {
  for (const local of [
    "http://localhost:8765", "http://LOCALHOST:8765", "http://127.0.0.1:8765", "http://127.255.0.9:8765",
    "http://127.1:8765", "http://2130706433:8765", "http://[::1]:8765", "http://[::ffff:127.0.0.1]:8765",
  ]) assert.equal(isRemoteWorker(local), false, local);
  for (const remote of [
    "http://192.0.2.10:8765", "http://198.51.100.7:8765", "http://worker.example.test:8765",
    "http://localhost.evil.test:8765", "http://127.0.0.1.evil.test:8765", "http://0.0.0.0:8765", "http://[::]:8765",
    "http://[::ffff:198.51.100.7]:8765", "not a url", "", null, undefined,
  ]) assert.equal(isRemoteWorker(remote), true, String(remote));
});

test("no worker named is REMOTE, because 'I could not tell' is not permission to send a login", () => {
  assert.throws(() => refuseAuthOnRemoteWorker({ worker: null, auth: AUTH }), AuthError);
  refuseAuthOnRemoteWorker({ worker: null, auth: undefined });
});

test("A RESPONSE WITHOUT authApplied: true IS auth-not-applied, and never a report", async () => {
  // An older worker ignores the field on purpose and captures the login page. It is exactly this response.
  for (const body of [{ transcript: ["Sign in, heading level 1"] }, { transcript: [], authApplied: "true" },
    { transcript: [], authApplied: 1 }, { transcript: [], authApplied: false }, { transcript: [], authApplied: null }]) {
    const worker = await listener("127.0.0.1", body);
    try {
      await assert.rejects(captureViaWorker("https://app.example.test/", { ...REQUEST, worker: worker.url, auth: AUTH }),
        (e: Error) => e instanceof AuthError && e.fault === "auth-not-applied");
      assert.equal(worker.received.length, 1, "the local worker WAS sent the request: only its answer is refused");
    } finally { await worker.close(); }
  }
});

test("a response WITH authApplied: true is the report, and the request carried the flow and no value", async () => {
  const worker = await listener("127.0.0.1", { transcript: ["Dashboard, heading level 1"], authApplied: true });
  try {
    const cap = await captureViaWorker("https://app.example.test/", { ...REQUEST, worker: worker.url, auth: AUTH });
    assert.deepEqual(cap.transcript, ["Dashboard, heading level 1"]);
    assert.deepEqual((worker.received[0] as { auth: unknown }).auth, AUTH);
  } finally { await worker.close(); }
});

test("a run that asked for no authentication is not held to the acknowledgement", async () => {
  const worker = await listener("127.0.0.1", { transcript: ["Home"] });
  try {
    const cap = await captureViaWorker("https://app.example.test/", { ...REQUEST, worker: worker.url });
    assert.deepEqual(cap.transcript, ["Home"]);
    assert.ok(!("auth" in (worker.received[0] as object)), "an unauthenticated request must not grow an auth field");
  } finally { await worker.close(); }
  requireAuthApplied({ response: {}, auth: undefined });
});

const ENV_KEYS = ["JUDGE_BACKEND", "A11Y_SEND_AUTHENTICATED_TRANSCRIPT_TO_JUDGE_VENDOR",
  "SEND_AUTHENTICATED_TRANSCRIPT_TO_JUDGE_VENDOR", "A11Y_ALLOW_AUTH_JUDGE"] as const;

function withEnv<T>(env: Partial<Record<(typeof ENV_KEYS)[number], string>>, run: () => T): T {
  const before = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, env);
  try {
    return run();
  } finally {
    for (const key of ENV_KEYS) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
}

test("AUTH + A NON-LOCAL JUDGE BACKEND refuses, decided by judgeBackend() and not by a second spelling", () => {
  // These are spellings `judgeBackend()` lower-cases or defaults, which a re-typed `=== "anthropic"` misses.
  for (const backend of ["anthropic", "Anthropic", "OPENAI", "codex", "CoDeX"]) {
    withEnv({ JUDGE_BACKEND: backend }, () => {
      assert.throws(() => judgeBackendDecision({ auth: AUTH, sendTranscriptToJudgeVendor: false }), (e: Error) => {
        assert.ok(e instanceof AuthError && e.fault === "auth-refused-judge-backend");
        assert.ok(e.message.includes(`JUDGE_BACKEND=${backend.toLowerCase()}`), "it names the backend that would receive the transcript");
        assert.match(e.message, /--send-authenticated-transcript-to-judge-vendor/, "it names the override");
        return true;
      });
    });
  }
  // The control, three ways: local by name, local by default, and local by the empty string `judgeBackend()` reads as local.
  for (const env of [{ JUDGE_BACKEND: "local" }, {}, { JUDGE_BACKEND: "" }, { JUDGE_BACKEND: "LOCAL" }]) {
    withEnv(env, () => assert.equal(judgeBackendDecision({ auth: AUTH, sendTranscriptToJudgeVendor: false }), null));
  }
  // No authentication, no refusal: a run that logs in to nothing is not this rule's business.
  withEnv({ JUDGE_BACKEND: "anthropic" }, () =>
    assert.equal(judgeBackendDecision({ auth: undefined, sendTranscriptToJudgeVendor: false }), null));
});

test("the override lets the run through and says which vendor receives the transcript", () => {
  withEnv({ JUDGE_BACKEND: "Anthropic" }, () => {
    const notice = judgeBackendDecision({ auth: AUTH, sendTranscriptToJudgeVendor: true });
    assert.match(String(notice), /the transcript will be sent to the judge vendor "anthropic"/);
    assert.match(String(notice), /Credentials are redacted first/);
  });
});

test("the override CANNOT be set from the environment", () => {
  for (const variable of ["A11Y_SEND_AUTHENTICATED_TRANSCRIPT_TO_JUDGE_VENDOR",
    "SEND_AUTHENTICATED_TRANSCRIPT_TO_JUDGE_VENDOR", "A11Y_ALLOW_AUTH_JUDGE"] as const) {
    withEnv({ JUDGE_BACKEND: "openai", [variable]: "1" }, () => {
      assert.throws(() => judgeBackendDecision({ auth: AUTH, sendTranscriptToJudgeVendor: false }),
        (e: Error) => e instanceof AuthError && e.fault === "auth-refused-judge-backend", variable);
    });
  }
});

test("AMENDMENT 3: an authenticated run on a repository that is not private is refused, whichever exit it asked for", () => {
  const exits = ["comment-on-pr", "print the transcript to the job log", "advice to upload result-json"];
  for (const exit of exits) {
    assert.throws(() => refuseAuthOnPublicRepository({ auth: AUTH, repositoryPrivate: false, requestedExits: [exit] }),
      (e: Error) => e instanceof AuthError && e.fault === "auth-refused-public-repository" && e.message.includes(exit), exit);
  }
  // Refused whole: a run that asked for NONE of the three exits is refused as well, because the exits are not a closed list.
  assert.throws(() => refuseAuthOnPublicRepository({ auth: AUTH, repositoryPrivate: false, requestedExits: [] }), AuthError);
  // "Not true" is the test, so absence and every spelling that is not `true` refuse.
  for (const notPrivate of [false, "false", undefined, null, "", "True", 1, "yes"]) {
    assert.throws(() => refuseAuthOnPublicRepository({ auth: AUTH, repositoryPrivate: notPrivate, requestedExits: exits }),
      AuthError, JSON.stringify(notPrivate));
  }
  // The controls: a private repository passes every exit (as a boolean and as the string an expression makes of
  // it), and an unauthenticated run is not affected by a public repository at all.
  for (const isPrivate of [true, "true"]) {
    refuseAuthOnPublicRepository({ auth: AUTH, repositoryPrivate: isPrivate, requestedExits: exits });
  }
  refuseAuthOnPublicRepository({ auth: undefined, repositoryPrivate: false, requestedExits: exits });
});

test("every named error has a remediation entry in the ADR's shape, and the population is not vacuous", () => {
  assert.equal(AUTH_FAULTS.length, AUTH_FAULT_COUNT);
  for (const code of AUTH_FAULTS) {
    const entry = FAULT_REMEDIATION[code];
    assert.ok(entry, `${code} has no FAULT_REMEDIATION entry`);
    for (const field of ["what", "tryThis", "whereToLook"] as const) assert.ok(entry[field].trim() !== "", `${code}.${field}`);
    assert.ok(isAuthFault(code));
  }
  assert.ok(!isAuthFault("hard-timeout") && !isAuthFault(undefined));
  assert.match(formatAuthFaultMessage("auth-login-failed", "The login did not complete."), /\(fault: auth-login-failed\)\n {2}What happened: .*expect-not-met.*unbindable-field.*left-origin/s);
  // The code is stated once, even when the raiser already put it in the sentence.
  const stated = formatAuthFaultMessage("auth-ambiguous", "Two mechanisms. (fault: auth-ambiguous)");
  assert.equal(stated.split("(fault: auth-ambiguous)").length - 1, 1);
});
