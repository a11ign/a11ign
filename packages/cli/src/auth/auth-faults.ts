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
 * `auth-refused-public-comment` of the ADR's first draft — the reasons are in the ADR beside the amendment).
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
