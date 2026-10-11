/**
 * THE SIGNED-IN CHECK (#4084, the v3 login verification; the chairman's design direction on #4084, 2026-10-11).
 *
 * A run's login is judged by ONE check the adopter names: an element by its accessible name, or a URL path prefix.
 * Three decisions follow from it, and all three use the same predicate `holds`, so they cannot disagree:
 *
 *   - the check is REFUSED if it already holds on the signed-out start page, because a check the signed-out page
 *     passes proves nothing about the login;
 *   - a login is `signed-in` only when the check holds after it, and the page ended on the app's own origin;
 *   - a page is audited only while the check still holds on it, and a failed re-check re-logs in once.
 *
 * PURE: every observation is a plain value handed in by the caller, who reads the page. Nothing here opens a socket.
 */

/** An element by its ARIA role and its accessible name (exact match). */
export interface ElementRef {
  readonly role: string;
  readonly name: string;
}

/**
 * What the adopter names as the proof of signed-in: an element the signed-in page shows and the login page does not, or
 * a URL path prefix such as `/account` that matches `/account` and everything beneath it.
 */
export type SignedInCheck = { readonly role: string; readonly name: string } | { readonly url: string };

/**
 * A page as the caller observed it, after every redirect. `appOrigin` is the origin the run started on, the only one a
 * signed-in page may end on. `idpOrigins` are the origins the flows file declared (`idp-origins:`).
 */
export interface PageObservation {
  readonly appOrigin: string;
  readonly idpOrigins: readonly string[];
  readonly finalUrl: string;
  readonly elements: readonly ElementRef[];
  readonly hasPasswordField: boolean;
}

/** How many re-logins one scan may make after a failed re-check (the row's "re-logs in once"). */
const RELOGINS_ALLOWED = 1;

const originOf = (url: string): string => new URL(url).origin;

const onAppOrigin = (observation: PageObservation): boolean => originOf(observation.finalUrl) === observation.appOrigin;

const elementShown = (check: { readonly role: string; readonly name: string }, observation: PageObservation): boolean =>
  observation.elements.some((element) => element.role === check.role && element.name === check.name);

/** A prefix matches whole path segments: `/account` covers `/account/orders`, never `/accounts`. */
const pathUnderPrefix = (check: { readonly url: string }, observation: PageObservation): boolean => {
  const path = new URL(observation.finalUrl).pathname;
  const segmentPrefix = check.url.endsWith("/") ? check.url : `${check.url}/`;
  return path === check.url || path.startsWith(segmentPrefix);
};

const checkShown = (check: SignedInCheck, observation: PageObservation): boolean =>
  "url" in check ? pathUnderPrefix(check, observation) : elementShown(check, observation);

/**
 * The one predicate. The check is shown AND the page ended on the app's origin: an element present on a page that
 * ended on the identity provider's origin is the provider's sign-in form, not a signed-in app.
 */
const holds = (check: SignedInCheck, observation: PageObservation): boolean =>
  checkShown(check, observation) && onAppOrigin(observation);

export type CheckValidation =
  | { readonly outcome: "accepted" }
  | { readonly outcome: "signed-in-check-matches-signed-out" };

/**
 * Refuses a check that already holds on the signed-out start page. Run before any login is attempted, so a bad check is
 * named before a password is typed.
 */
export const validateCheck = (check: SignedInCheck, signedOut: PageObservation): CheckValidation =>
  holds(check, signedOut) ? { outcome: "signed-in-check-matches-signed-out" } : { outcome: "accepted" };

export type LoginVerdict = "signed-in" | "signed-in-check-never-matched";

/** Did the login land on the signed-in page? The check has to hold after it, not merely be absent before it. */
export const loginVerdict = (check: SignedInCheck, observation: PageObservation): LoginVerdict =>
  holds(check, observation) ? "signed-in" : "signed-in-check-never-matched";

export interface FallbackJudgement {
  readonly signedIn: boolean;
  /** Always present: a run judged without a check must say so in its report. */
  readonly warning: string;
}

/**
 * The rule for a run given NO check: the page is signed in when it ends on the app's origin, shows no password field and
 * is not on a declared identity-provider origin. Weaker than a check, so the warning is never omitted.
 */
export const fallbackCheck = (observation: PageObservation): FallbackJudgement => ({
  signedIn:
    onAppOrigin(observation) &&
    !observation.hasPasswordField &&
    !observation.idpOrigins.includes(originOf(observation.finalUrl)),
  warning:
    "No signed-in check was given: the run judged the signed-in page by its origin alone (the app's, with no password field " +
    "and no identity-provider origin). Name a check to be sure.",
});

/** What a scan has done so far: how many re-logins it has made, and how many pages it has audited. */
export interface ScanProgress {
  readonly loginsSoFar: number;
  readonly pagesAudited: number;
}

/**
 * `session-lost-mid-scan`: the session was lost after the scan had audited a page, which is the case the re-check exists
 * for. `signed-out-at-start`: the first page already failed its check, so nothing was audited under this session.
 */
export type ScanLoss = "session-lost-mid-scan" | "signed-out-at-start";

export type PageDecision =
  | { readonly decision: "audit" }
  | { readonly decision: "relogin"; readonly loss: ScanLoss }
  | { readonly decision: "not-audited-signed-out"; readonly loss: ScanLoss };

/**
 * Before each audited page: audit it while the check holds; on a failed re-check re-log in ONCE; a page that still fails
 * after that is reported not audited. A page that fails its check is never audited.
 */
export const pageDecision = (check: SignedInCheck, observation: PageObservation, progress: ScanProgress): PageDecision => {
  if (holds(check, observation)) return { decision: "audit" };
  const loss: ScanLoss = progress.pagesAudited > 0 ? "session-lost-mid-scan" : "signed-out-at-start";
  return progress.loginsSoFar < RELOGINS_ALLOWED ? { decision: "relogin", loss } : { decision: "not-audited-signed-out", loss };
};
