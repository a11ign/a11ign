/**
 * The nightly Auth0 matrix (#5000, under #4084): the tenant settings it flips, the outcome each must end in, and
 * the baseline it puts the tenant back to after every case.
 *
 * Pure data and one classifier. The runner that calls the Management API with the matrix client and the workflow
 * that schedules it are other rows. Nothing here holds a secret, a client id or a domain: the runner resolves the
 * matrix client and the connection itself, so a payload in this file is safe to print.
 *
 * What is NOT here is deliberate. There is no Bot Detection or attack-protection case: it is Enterprise-only, and
 * `bot-challenge` stays a named outcome tested on a fixture (a11ign#4991). The tenant is on the Free plan, where
 * MFA is test-only, so the run must be able to say the plan stopped it (`planStop`) and never call that a
 * rejected code.
 */
import type { FormScreen } from "./screen-loop.js";
import type { LoginOutcome } from "./login-outcomes.js";

/** The Management API areas a case may touch. `attack_protection` is not among them, by the row's amendment. */
export const MATRIX_AREAS = ["tenant_settings", "prompts", "guardian_factors", "mfa_policies", "clients", "connections", "organizations"] as const;
export type MatrixArea = (typeof MATRIX_AREAS)[number];

/**
 * One area's request body as the Management API takes it, so a runner sends the value as written. Two areas are keyed
 * by a path segment rather than a body field: `guardian_factors` by the factor name (`PUT /guardian/factors/{name}`,
 * whose body is the value), and `mfa_policies` is the raw array `PUT /guardian/policies` takes.
 */
export type MatrixSettings = Partial<Record<MatrixArea, unknown>>;

/** A branch the screen loop must list: the screen it met and, when it matters, text its note must contain. */
export interface ExpectedBranch {
  readonly screen: FormScreen;
  readonly noteIncludes?: string;
}

export interface MatrixExpectation {
  readonly ends: LoginOutcome | "signed-in";
  readonly branches: readonly ExpectedBranch[];
}

export interface MatrixCase {
  readonly name: string;
  readonly settings: MatrixSettings;
  readonly expect: MatrixExpectation;
}

/** The matrix client's callback: a `localhost` one, so no consent screen is ever shown to a real site. */
const LOCALHOST_CALLBACK = "http://localhost:3000/callback";

export const MATRIX_CASES: readonly MatrixCase[] = [
  {
    name: "identifier-first-on",
    settings: { prompts: { identifier_first: true } },
    expect: { ends: "signed-in", branches: [{ screen: "identifier" }, { screen: "password" }] },
  },
  {
    name: "identifier-first-off",
    settings: { prompts: { identifier_first: false } },
    expect: { ends: "signed-in", branches: [{ screen: "identifier-and-password" }] },
  },
  {
    // "Always" is the `all-applications` policy; OTP is the authenticator-app factor. Push, SMS and keys are not in v3.
    name: "mfa-always-otp",
    settings: { guardian_factors: { otp: { enabled: true } }, mfa_policies: ["all-applications"] },
    expect: { ends: "signed-in", branches: [{ screen: "one-time-code" }] },
  },
  {
    // Progressive enrollment is what makes Auth0 offer a passkey after a password login. `PATCH /connections/{id}`
    // takes it under `options`; the runner must merge it into the connection's current options, as PATCH replaces them.
    name: "progressive-enrollment-on",
    settings: { connections: { options: { passkey_options: { progressive_enrollment_enabled: true } } } },
    expect: { ends: "signed-in", branches: [{ screen: "passkey-nudge", noteIncludes: "passkey" }] },
  },
  {
    name: "consent-on-localhost-callback",
    settings: { clients: { is_first_party: false, callbacks: [LOCALHOST_CALLBACK] } },
    expect: { ends: "signed-in", branches: [{ screen: "consent", noteIncludes: "first-party" }] },
  },
  {
    name: "organizations-prompt",
    settings: { clients: { organization_usage: "require", organization_require_behavior: "pre_login_prompt" } },
    expect: { ends: "signed-in", branches: [{ screen: "organization-picker", noteIncludes: "organization" }] },
  },
];

/**
 * The settings the tenant is put back to after every case. A flipped field with no entry here is left flipped for
 * the next case, so every field a case sets has one (the test pins that).
 */
export const BASELINE: Readonly<Required<Pick<MatrixSettings, "prompts" | "guardian_factors" | "mfa_policies" | "clients" | "connections">>> = {
  prompts: { identifier_first: false },
  guardian_factors: { otp: { enabled: false } },
  mfa_policies: [],
  clients: {
    is_first_party: true,
    callbacks: [LOCALHOST_CALLBACK],
    organization_usage: "deny",
    organization_require_behavior: "no_prompt",
  },
  connections: { options: { passkey_options: { progressive_enrollment_enabled: false } } },
};

/** A recorded Management API or login response, reduced to what a classifier may read. */
export interface RecordedResponse {
  readonly status: number;
  readonly message?: string;
  readonly errorCode?: string;
}

export type PlanStop = Extract<LoginOutcome, "mfa-unavailable-on-plan" | "totp-rejected">;

const PLAN_REFUSAL = /\b(plan|subscription|upgrade|not available on your)\b/i;
const WRONG_CODE = /invalid[ _]?(otp|code|passcode)|(otp|code|passcode).{0,20}(invalid|incorrect|wrong|expired)/i;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_PAYMENT_REQUIRED = 402;
const HTTP_FORBIDDEN = 403;
const REFUSED_STATUSES: ReadonlySet<number> = new Set([HTTP_BAD_REQUEST, HTTP_UNAUTHORIZED, HTTP_PAYMENT_REQUIRED, HTTP_FORBIDDEN]);

/**
 * Which stop a recorded response is. A plan refusal is `mfa-unavailable-on-plan` and a refused code is
 * `totp-rejected`; anything else, or a response that reads as both, is `undefined`: unrecognised is not a stop
 * this function is allowed to name, because the wrong name here sends a person to fix a seed that is fine.
 */
export const planStop = (response: RecordedResponse): PlanStop | undefined => {
  if (!REFUSED_STATUSES.has(response.status)) return undefined;
  const text = `${response.errorCode ?? ""} ${response.message ?? ""}`;
  const plan = PLAN_REFUSAL.test(text);
  const code = WRONG_CODE.test(text);
  if (plan === code) return undefined;
  return plan ? "mfa-unavailable-on-plan" : "totp-rejected";
};
