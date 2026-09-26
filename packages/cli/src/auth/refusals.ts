/**
 * What an authenticated run REFUSES, and the one acknowledgement it insists on — ADR 0038, clauses 1 and 5,
 * and amendment 3. PURE decisions over values handed in, so each has a test that needs no worker and no
 * network; `cli.ts` calls them at the places the ADR names.
 *
 * Every refusal here shares one shape: **an error, never a report.** A run that would have logged in and
 * cannot must not fall back to examining the login page and calling it the product (ADR 0020: unexamined is
 * not failing, and it is certainly not clean).
 */
import { judgeBackend } from "@a11ign/judge";

import { AuthError } from "./auth-faults.js";
import type { FlowStep } from "./flows.js";

/**
 * What a run sends when it needs to log in (ADR 0038, "On the wire and per capture"): the login flow's resolved
 * steps, then the flow to replay after it and how far. **The NAMES of environment variables, never a value**
 * (clause 3) — a step's `from-env` is a variable name, and the machine that drives the browser reads it. The
 * worker replays `login`, then `flow` up to `upTo`, and then the requested capture starts. The steps are `flows.ts`'s
 * own `FlowStep`s, so the CLI's interpreter (PR 5) and the wire share one type; the worker, which cannot import it,
 * validates the same shape again on arrival because the request is untrusted input there.
 */
export interface AuthRequest {
  readonly login: readonly FlowStep[];
  /** Steps to replay after the login, e.g. a complete process to a capture point. Absent: the login alone. */
  readonly flow?: readonly FlowStep[];
  /** How many of `flow`'s steps to replay: the index of the `capture:` point, or the flow's length. */
  readonly upTo?: number;
  /**
   * A saved storage state to load INSTEAD of performing the login (`--auth-state`, ADR 0038 amendment 7, choice 5): **a PATH and
   * nothing else**, absolute, on the machine that drives the browser. Never a value, never a cookie, never the file's contents;
   * the worker reads and validates the file itself, so a request cannot make it load a value the CLI did not show it.
   */
  readonly state?: { readonly path: string };
}

/** Undefined means the run asked for no authentication, and every function below is then a no-op. */
type MaybeAuth = AuthRequest | undefined;

/** `::ffff:127.x.x.x`, which `URL` normalises to `::ffff:7f??:????` — an IPv4-mapped loopback address. */
const MAPPED_LOOPBACK = /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/;

/**
 * Is this worker address on THIS machine? Decided from the address the CLI was given, before a socket opens
 * (Constraint 1): `localhost`, anything in `127.0.0.0/8`, or `::1`, and nothing else. `URL` normalises the
 * shorthand and numeric spellings (`127.1`, `2130706433`) to dotted quads, so they are judged as what they
 * are; a name that merely BEGINS like a loopback (`localhost.evil.test`, `127.0.0.1.evil.test`) is a
 * different host and is remote.
 *
 * **An SSH tunnel to a shared worker presents as loopback and is not distinguished** — the ADR's reasoned
 * tolerance, and amendment 5 says what it does not cover. A worker address that cannot be parsed, and no
 * address at all (the run would lease a VM that is not this machine's loopback), are REMOTE: refusing by
 * default is the safe reading of "I could not tell".
 */
export function isRemoteWorker(worker: string | null | undefined): boolean {
  if (!worker) return true;
  let hostname: string;
  try {
    hostname = new URL(worker).hostname.toLowerCase();
  } catch {
    return true;
  }
  if (hostname === "localhost" || hostname === "[::1]" || MAPPED_LOOPBACK.test(hostname)) return false;
  return !/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
}

const hostOf = (worker: string | null | undefined): string => {
  try {
    return worker ? new URL(worker).host : "(no worker named)";
  } catch {
    return String(worker);
  }
};

/**
 * Remote-worker mode REFUSES an auth request (clause 1). Raised in `captureViaWorker` before the request body
 * is built, and in `captureAndScan` before the rule layer's browser launches, so neither layer can proceed.
 * The message is the ADR's own wording; the what / try / see tail is `FAULT_REMEDIATION`'s.
 */
export function refuseAuthOnRemoteWorker({ worker, auth }: { worker: string | null | undefined; auth: MaybeAuth }): void {
  if (auth === undefined || !isRemoteWorker(worker)) return;
  throw new AuthError("auth-refused-remote-worker",
    `The worker at ${hostOf(worker)} is remote, and this run needs to log in. The worker takes plain HTTP with `
    + "no authentication and no TLS, so anything sent to it can be read by anyone on the network, and a session "
    + "is a credential. Nothing was sent and no page was examined.");
}

/**
 * The positive acknowledgement (clause 1, fact 1). A worker that predates `auth` IGNORES the field on purpose
 * (`captureOptions`: "an unknown field must be ignored rather than obeyed"), so an older worker answers an auth
 * request with a capture of the LOGIN PAGE. Only `authApplied: true` — strictly, not truthy — says the worker
 * performed the login; anything else is `auth-not-applied` and no report.
 */
export function requireAuthApplied({ response, auth }: { response: unknown; auth: MaybeAuth }): void {
  if (auth === undefined) return;
  const applied = typeof response === "object" && response !== null
    && (response as { authApplied?: unknown }).authApplied === true;
  if (applied) return;
  throw new AuthError("auth-not-applied",
    "This run asked to log in, and the worker's answer does not say it did (no authApplied: true). A worker that "
    + "predates authenticated capture ignores the request and captures the login page, so what came back may be "
    + "the sign-in wall and not your product. No report was made.");
}

/**
 * Authentication with a non-local judge backend refuses by default (clause 5), decided by CALLING
 * `judgeBackend()` — the function the judge reads `JUDGE_BACKEND` with — and not by re-spelling the
 * comparison: it lower-cases the value and reads an empty string as `local`, and a second spelling would
 * disagree with it the first time one of them changed.
 *
 * `sendTranscriptToJudgeVendor` is the override, `--send-authenticated-transcript-to-judge-vendor`. It is a
 * value the CLI parsed from ITS ARGUMENTS and this function reads nothing else: **it cannot be set from the
 * environment**, so a variable left in a shared runner cannot turn it on for a job that never named it. Given
 * it returns the line to print on stderr BEFORE the judge runs, naming the vendor that receives the
 * transcript; otherwise null. It does not extend to credentials, which are scrubbed before the transcript
 * leaves whatever this returns.
 */
export function judgeBackendDecision(
  { auth, sendTranscriptToJudgeVendor }: { auth: MaybeAuth; sendTranscriptToJudgeVendor: boolean },
): string | null {
  const backend = judgeBackend();
  if (auth === undefined || backend === "local") return null;
  if (!sendTranscriptToJudgeVendor) {
    throw new AuthError("auth-refused-judge-backend",
      `This run logs in, and JUDGE_BACKEND=${backend} would send its transcript to that vendor. A transcript from `
      + "behind a login is the text of the page you signed in to, and may contain account names, order details or "
      + "anything else the page says. Nothing was captured. To send it anyway, with your own key and your own "
      + "data, pass --send-authenticated-transcript-to-judge-vendor on this command (it cannot be set from the "
      + "environment); to keep it on this machine, unset JUDGE_BACKEND.");
  }
  return `authenticated run: the transcript will be sent to the judge vendor "${backend}" `
    + "(--send-authenticated-transcript-to-judge-vendor was given). Credentials are redacted first.";
}

/** `event.repository.private` as the Action sees it: a JSON boolean, or the string an expression makes of it. */
const isPrivate = (value: unknown): boolean => value === true || value === "true";

/**
 * An authenticated run on a repository that is not PRIVATE is refused whole (amendment 3, and the ADR's reasons
 * beside it): on a public repository the comment, the job log, the artifact advice and the step summary are
 * each readable by anyone, and one gate keyed on the repository's visibility has no list of exits to fall out
 * of date. `private` must be exactly `true` — `false`, absent, empty and anything else refuse, because "I could
 * not tell whether it is private" is not permission to publish text from behind a login.
 *
 * `requestedExits` names which of the outputs the run asked for, so the message says what would have been
 * published; the decision does not depend on it, and a run that asked for none is refused all the same.
 */
export function refuseAuthOnPublicRepository(
  { auth, repositoryPrivate, requestedExits }:
  { auth: MaybeAuth; repositoryPrivate: unknown; requestedExits: readonly string[] },
): void {
  if (auth === undefined || isPrivate(repositoryPrivate)) return;
  const exits = requestedExits.length > 0 ? ` This run asked for: ${requestedExits.join(", ")}.` : "";
  throw new AuthError("auth-refused-public-repository",
    "This run logs in, and this repository is not private, so its output would be readable by anyone: the pull-"
    + "request comment, the job log, the uploaded artifact and the job summary all show the transcript, which is "
    + `the text of the page you signed in to.${exits} Nothing was captured.`);
}
