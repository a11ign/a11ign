/**
 * `witness`'s one-shot sanity probe of a GUESSED worker address, and what it says for each outcome (#2683).
 *
 * Its own module so a test can import it without `cli.ts`, which reaches a corpus reader (`row-file` flagged
 * `cli.ts:851`, #2683) and would put the corpus closure under `probe-outcome.test.ts`. It imports only
 * `@a11ign/worker-fleet`.
 *
 * `witness` does NOT wake a worker (ADR 0012: `@a11ign/worker-fleet` and `a11ign` are published and
 * `@a11ign/control` never is; ruled by product-manager 2026-09-26). It says which of three things happened --
 * refused, no answer, answered-but-not-ready -- and names the command that wakes a box.
 */
import { workerIsUsable } from "@a11ign/worker-fleet/health";
import {
  WORKER_PROBE_TIMEOUT_MS, describeProbe, probeHealth, type Probe, type ProbeRequest,
} from "@a11ign/worker-fleet/probe-outcome";


/**
 * Exported as a pure builder, not just the throw site, because `docs/try-it.md` quotes this text
 * verbatim as "the most likely first result" -- `quoted-cli-output.test.ts` calls this function to
 * derive the expected quote rather than comparing two independently retyped literals.
 *
 * This is the REFUSED sentence: the connection was refused, so nothing listens at the address.
 */
export function noWorkerMessage({ worker, reason }: { worker: string; reason: string }): string {
  return `No capture worker answered at ${worker} (nothing was configured, so this address was a guess).\n`
    + `A screen reader is a Windows application, so nothing runs here without one. Set A11Y_WORKER to `
    + `point at a worker you have, or see docs/getting-started.md to set one up (~20 minutes with a `
    + `Windows machine already, or use the GitHub Action if you have none).\n(${reason})`;
}

/**
 * The NO-ANSWER sentence, the sibling of `noWorkerMessage`. Silence is not refusal -- the address may be a box that
 * is asleep or slow -- so this says "did not answer within T", never "down", and keeps the guess explanation.
 */
export function noAnswerMessage({ worker, probe }: { worker: string; probe: Probe }): string {
  return `${describeProbe(probe, { worker })}\n(Nothing was configured, so this address was a guess.) `
    + `A screen reader is a Windows application, so nothing runs here without a worker. Set A11Y_WORKER to `
    + `point at one you have, or see docs/getting-started.md to set one up.`;
}

/**
 * REFUSE FAST WHEN NOBODY CONFIGURED ANYTHING AND NOTHING IS LISTENING.
 *
 * `source: "default"` means the user set no `A11Y_WORKER`, declared no fleet, and has no local VM --
 * we GUESSED `http://localhost:8765` because the historical local-worker setup uses that address. If a
 * real worker is there, this guess is exactly right and must behave as it always has. If nothing is
 * there, `ECONNREFUSED` is a TRANSIENT network code (`transient-fault.mjs`), so `captureTolerantly`'s
 * lost-acceptance recovery -- correct for a real worker that dropped one socket -- reconciles for the
 * FULL `CAPTURE_CLIENT_TIMEOUT_MS` (620 s) against an address nothing has ever answered. Measured: a
 * first-time user with no worker sees "Scanning ..." and then silence for over ten minutes.
 *
 * The fix is not in the retry classification -- `ECONNREFUSED` really is transient for a worker that
 * might restart, and 620 s is the correct budget for one that legitimately dropped a socket
 * (architecture-audit.md §14.5). The fix is to ask, once, whether anyone is even there before
 * committing to that budget -- which this repo's own capture path could always have done and never did,
 * because nothing upstream of the retry loop knew the address had been GUESSED rather than GIVEN.
 *
 * A response of ANY kind -- 200, busy, not yet ready -- means something is listening at this address,
 * and the existing recovery machinery is exactly the right tool for whatever state it is in. Only a
 * connection that never completes (nothing listening, or a firewall dropping it silently) is refused
 * here; `workerIsUsable` is not the gate; that predicate answers "should I dispatch a capture to this
 * worker RIGHT NOW", not "does an answer exist at all", and conflating the two would refuse a real
 * worker that is merely busy or still warming up -- exactly the documented local-worker-on-8765 setup
 * this must not break.
 *
 * THE TIMEOUT is `WORKER_PROBE_TIMEOUT_MS` (12 s, its reading is beside it): it was 5 s, which left 1.91 s over
 * the slowest healthy box on the real fleet (3.09 s first-after-idle, #2671) and none over a loaded one.
 * `request` and `warn` are injectable so a test reads no network.
 */
export async function refuseIfNothingListening(worker: string, options: {
  timeoutMs?: number; request?: ProbeRequest; warn?: (line: string) => void;
} = {}): Promise<void> {
  const { timeoutMs = WORKER_PROBE_TIMEOUT_MS, request, warn = (line) => process.stderr.write(line) } = options;
  const probe = await probeHealth(worker, { timeoutMs, request });
  if (probe.outcome === "refused") throw new Error(noWorkerMessage({ worker, reason: probe.message }));
  if (probe.outcome === "no-answer") throw new Error(noAnswerMessage({ worker, probe }));
  // Surfaced only as a heads-up, because a user staring at a silent terminal deserves to know the wait has a reason.
  if (!workerIsUsable(probe.health)) {
    warn(`  (that worker answered, so it is up, but it is not immediately ready -- waiting for it)\n`);
  }
}
