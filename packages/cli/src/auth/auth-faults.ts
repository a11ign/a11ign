/**
 * The named errors of an authenticated run — ADR 0038, clauses 1, 4 and 5, and amendments 2 and 3.
 *
 * ADR 0028 keys recovery and messages on CODES and never on wording, so every way an authenticated run can be
 * refused or fail has one string here, one `FAULT_REMEDIATION` entry (`../fault-remediation.ts`), and is
 * thrown as an `AuthError` carrying it. `cli.ts`'s top-level catch reads `.fault` and prints the code's
 * what / try / see; nothing parses a message to decide what to do next.
 *
 * The first eight are the row's list (#2359, clause 6). Two are added by the ADR's own text: `auth-credential-
 * too-short` (amendment 2: a value under the floor refuses the run) and `auth-refused-public-repository`
 * (amendment 3: an authenticated run on a repository that is not private is refused whole, which replaces the
 * `auth-refused-public-comment` of the ADR's first draft — the reasons are in the ADR beside the amendment). The
 * eleventh, `auth-session-lost`, is a FAULT and not a fourth `LoginFailureReason`: the login SUCCEEDED, and the page
 * it then loaded was the login form (#2563). The twelfth, `auth-challenge-detected`, is a FAULT too and not a fourth
 * `LoginFailureReason`: a step failed and a CAPTCHA widget is on the page that failed it (#2564). It NAMES the
 * challenge and never answers one. The thirteenth, `auth-state-expired`, is a FAULT for the reason `auth-session-lost` gives: the
 * login did not fail, there was none. It is raised ONLY on a run that loaded a saved storage state (`--auth-state`), when the
 * page that state was meant to sign in is not the signed-in page (ADR 0038, amendment 7, choice 2).
 */
export const AUTH_FAULTS = [
  "auth-refused-remote-worker",
  "auth-not-applied",
  "auth-login-failed",
  "auth-credential-missing",
  "auth-ambiguous",
  "auth-refused-judge-backend",
  "auth-credential-in-artifact",
  "auth-literal-secret",
  "auth-credential-too-short",
  "auth-refused-public-repository",
  "auth-session-lost",
  "auth-challenge-detected",
  "auth-state-expired",
] as const;

export type AuthFault = (typeof AUTH_FAULTS)[number];

/** Why a login did not get the run past the login: the three reasons ADR 0038 names. */
export const LOGIN_FAILURE_REASONS = ["expect-not-met", "unbindable-field", "left-origin"] as const;
export type LoginFailureReason = (typeof LOGIN_FAILURE_REASONS)[number];

export const isAuthFault = (value: unknown): value is AuthFault =>
  typeof value === "string" && (AUTH_FAULTS as readonly string[]).includes(value);

/**
 * Thrown with a sentence a person can act on. `message` states the situation and does NOT repeat the code:
 * the formatter (`formatAuthFaultMessage`) adds `(fault: <code>)` and the what / try / see block once, so a
 * message that already ended in its code would print it twice.
 */
export class AuthError extends Error {
  readonly fault: AuthFault;
  constructor(fault: AuthFault, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AuthError";
    this.fault = fault;
  }
}
