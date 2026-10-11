/**
 * How a login ends — the named outcomes of the v3 login (#4084, #4984), and the rules for what may be retried.
 *
 * A login that fails must say WHICH of these happened and give ONE line of what to do about it. Nothing here
 * branches on a message: a caller decides from the outcome code, and the remedy is for the person who reads it.
 *
 * Lockout safety is the reason the retry rules are here and not at each call site. Auth0 blocks a user after ten
 * failed one-time codes and an IP for up to thirty days after ten wrong passwords, so a retry that is not the
 * one allowed case is a defect that a provider can punish for days:
 *   - a credential or code rejection, a block, an enrolment, a plan stop, a challenge, a consent or organization
 *     screen, and a screen nobody recognises are FINAL: `retryDecision` never retries them, at any attempt;
 *   - a retry is allowed ONLY after a transient failure (a timeout or a 5xx), on the first attempt, once per run.
 *
 * A transient failure is reported with the outcome the screen it failed on shows (the signed-in check that timed
 * out is `signed-in-check-never-matched`), with `transient: true`. The row names no outcome for "timed out", so
 * this is the one place the caller's classification is trusted; `cli.ts` does not read this module yet.
 */

/** Whole-login retries allowed in one run, across every login the run makes. The row says at most one. */
export const MAX_LOGIN_RETRIES_PER_RUN = 1;

/** Pause before the retry, so a transient fault has a moment to clear rather than being hit twice in a row. */
export const LOGIN_RETRY_BACKOFF_MS = 10_000;

/**
 * Exit codes a login-driven run can end with that a person or a script must tell apart. `1` is the CLI's
 * "finished with failures" (`README.md`: violations found), so a lost session must not reuse it: the run found
 * nothing wrong with the page, it lost the session the scan needed.
 */
export const LOGIN_EXIT_CODES = { sessionLost: 4 } as const;

export const LOGIN_OUTCOMES = {
  "credentials-rejected": { remedy: "The username or password was refused: check the values the run reads from the environment, and do not retry." },
  "account-blocked": { remedy: "The provider has blocked this account: unblock it there, or sign in with another account." },
  "mfa-required-no-seed": { remedy: "The login asks for a one-time code and no authenticator seed is configured: set the seed the run reads, or sign in from a saved state." },
  "totp-rejected": { remedy: "The one-time code was refused: check the seed matches the authenticator app and the clock is in step, and do not retry." },
  "mfa-enrollment-required": { remedy: "The account must enrol an authenticator app before it can sign in: enrol one with the provider, then run again." },
  "mfa-unavailable-on-plan": { remedy: "The provider's plan does not include MFA, so this login cannot complete on this plan: the code is not the cause, and a plan upgrade is a decision for whoever pays for it." },
  "bot-challenge": { remedy: "The provider showed a bot check the run will not answer: sign in from a saved state (--auth-state) taken where the check does not appear." },
  "rate-limited": { remedy: "The provider is rate-limiting sign-in: wait before running again, since a retry now only adds to the limit." },
  "consent-required": { remedy: "The site asks for consent the run will not give: grant it in a saved state (--auth-state) and run again." },
  "organization-required": { remedy: "The provider asks which organization to sign in to, and the run did not name one: name it in the flow, then run again." },
  "unknown-screen": { remedy: "The login reached a screen the run does not recognise: open that page in a browser and make the flow's expect step match it." },
  "signed-in-check-never-matched": { remedy: "The signed-in check never matched after the login: check the flow's signed-in selector against the page the login reaches." },
  "signed-in-check-matches-signed-out": { remedy: "The signed-in check matched the signed-out page, so the login did not sign in: check the credentials and the steps before it." },
  "session-lost-mid-scan": { remedy: "The session ended partway through the scan: run again, and if it recurs check the site's session timeout." },
  "session-not-restorable-on-navigation": { remedy: "The session could not be restored when the scan moved to another page: check whether the site binds sessions to one browser." },
} as const satisfies Record<string, { readonly remedy: string }>;

export type LoginOutcome = keyof typeof LOGIN_OUTCOMES;

/** Outcomes a whole-login retry never follows, whatever the attempt or the failure's transience. */
const FINAL_OUTCOMES: ReadonlySet<LoginOutcome> = new Set<LoginOutcome>([
  "credentials-rejected",
  "account-blocked",
  "mfa-required-no-seed",
  "totp-rejected",
  "mfa-enrollment-required",
  "mfa-unavailable-on-plan",
  "bot-challenge",
  "consent-required",
  "organization-required",
  "unknown-screen",
]);

export const isFinal = (outcome: LoginOutcome): boolean => FINAL_OUTCOMES.has(outcome);

export type RetryInput = {
  outcome: LoginOutcome;
  /** 1 for the first login of the run; a retry is attempt 2. */
  attempt: number;
  /** A timeout or a 5xx. Anything else, including a rate limit, is not transient however it is worded. */
  transient: boolean;
  retriesSoFar: number;
};

export type RetryDecision = { action: "retry"; backoffMs: number } | { action: "stop" };

export function retryDecision({ outcome, attempt, transient, retriesSoFar }: RetryInput): RetryDecision {
  const mayRetry = transient && !isFinal(outcome) && attempt === 1 && retriesSoFar < MAX_LOGIN_RETRIES_PER_RUN;
  return mayRetry ? { action: "retry", backoffMs: LOGIN_RETRY_BACKOFF_MS } : { action: "stop" };
}
