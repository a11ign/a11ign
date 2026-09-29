// @ts-check
// module: what `auth:leak-check` says when it asks a worker `/health` before it drives a capture (#2683). Its own file so a test can
// import it without `auth-leak-check.mjs`, which imports the CLI and reaches a corpus reader.
import { describeProbe, probeHealth, WORKER_PROBE_TIMEOUT_MS } from "@a11ign/worker-fleet/probe-outcome";

const RUN_HERE = "This command runs on the machine the worker runs on, with the worker started from a shell that exported "
  + "the two variables.";

/**
 * The sentence to stop with, or `null` when something answered and the run may go on.
 *
 * Fail fast when there is no worker to ask: `captureViaWorker` retries a refused connection for a whole capture's budget
 * (minutes), which is right for a fleet run and wrong for a person who mistyped a port. A worker that ANSWERED, busy or not
 * yet ready, is not stopped here: the capture path's own recovery handles those, as it did before this was a module. Three
 * different sentences for three different outcomes: a refusal says the machine is up and nothing listens; silence says "did
 * not answer within T" and never "down"; only the first two stop the run.
 *
 * @param {string} worker
 * @param {{ timeoutMs?: number, request?: import("@a11ign/worker-fleet/probe-outcome").ProbeRequest }} [options]
 * @returns {Promise<string | null>}
 */
export async function workerProblem(worker, { timeoutMs = WORKER_PROBE_TIMEOUT_MS, request } = {}) {
  const probe = await probeHealth(worker, { timeoutMs, request });
  if (probe.outcome !== "refused" && probe.outcome !== "no-answer") return null;
  return `Could not use the capture worker: ${describeProbe(probe, { worker, timeoutMs })} ${RUN_HERE}`;
}
