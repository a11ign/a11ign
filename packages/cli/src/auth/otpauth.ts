/**
 * A TOTP secret as an adopter names it: a bare base32 seed, or the whole `otpauth://totp/...` URI an
 * authenticator enrolment screen and its QR code hand over. The URI carries `algorithm`, `digits` and `period`,
 * which the bare seed cannot, so both forms resolve to the one shape `totpCode` takes.
 *
 * PURE: no environment, no file, no clock. The seed rules are `requireTotpSeed`'s, called rather than copied.
 *
 * **A refusal names the PARAMETER and never a value**, for the reason `totp.ts` gives: a URI that nearly parsed
 * holds a real secret, and an error message is a log line.
 */
import { DEFAULT_ALGORITHM, DEFAULT_DIGITS, DEFAULT_PERIOD_SECONDS, requireTotpSeed, TotpError } from "./totp.js";
import type { TotpAlgorithm } from "./totp.js";

export interface TotpSecret {
  readonly seed: string;
  readonly algorithm: TotpAlgorithm;
  readonly digits: number;
  readonly periodSeconds: number;
}

const TOTP_SCHEME = "otpauth://totp/";
const OTPAUTH_SCHEME = "otpauth:";
const HOTP_SCHEME = "otpauth://hotp/";
const MIN_DIGITS = 6;
const MAX_DIGITS = 8;
/** The URI's ceiling. `totpCode` has its own, lower one, and refuses a period above it by name when a code is asked for. */
const MAX_PERIOD_SECONDS = 300;
const WHOLE_NUMBER = /^\d+$/;
const SEED_SOURCE = "the TOTP secret";
const URI_SEED_SOURCE = "the otpauth URI's secret parameter";
const ALGORITHMS: Readonly<Record<string, TotpAlgorithm>> = { SHA1: "sha1", SHA256: "sha256", SHA512: "sha512" };

function wholeNumber(raw: string | null, name: string, fallback: number, range: readonly [number, number]): number {
  if (raw === null) return fallback;
  const value = WHOLE_NUMBER.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(value) || value < range[0] || value > range[1]) {
    throw new TotpError("totp-option-invalid", `The otpauth URI's ${name} must be a whole number from ${range[0]} to ${range[1]}. Its value is not shown.`);
  }
  return value;
}

function algorithmOf(raw: string | null): TotpAlgorithm {
  if (raw === null) return DEFAULT_ALGORITHM;
  const found = ALGORITHMS[raw.toUpperCase()];
  if (found === undefined) {
    throw new TotpError("totp-option-invalid", `The otpauth URI's algorithm must be one of ${Object.keys(ALGORITHMS).join(", ")}. Its value is not shown.`);
  }
  return found;
}

function parseUri(uri: string): TotpSecret {
  const params = new URL(uri).searchParams;
  const secret = params.get("secret");
  if (secret === null || secret.trim() === "") {
    throw new TotpError("totp-seed-missing", "The otpauth URI has no secret parameter; nothing was captured.");
  }
  return {
    seed: requireTotpSeed({ [URI_SEED_SOURCE]: secret }, URI_SEED_SOURCE),
    algorithm: algorithmOf(params.get("algorithm")),
    digits: wholeNumber(params.get("digits"), "digits", DEFAULT_DIGITS, [MIN_DIGITS, MAX_DIGITS]),
    periodSeconds: wholeNumber(params.get("period"), "period", DEFAULT_PERIOD_SECONDS, [1, MAX_PERIOD_SECONDS]),
  };
}

/** A bare seed resolves to SHA-1, 6 digits, 30 s; an `otpauth://totp/` URI to what it says, defaulted the same way. */
export function parseTotpSecret(value: string): TotpSecret {
  const trimmed = value.trim();
  if (trimmed.toLowerCase().startsWith(HOTP_SCHEME)) {
    throw new TotpError("totp-seed-invalid", "The otpauth URI is counter-based (hotp), which is not supported; only time-based (totp) is. Its value is not shown.");
  }
  if (trimmed.toLowerCase().startsWith(TOTP_SCHEME)) return parseUri(trimmed);
  if (trimmed.toLowerCase().startsWith(OTPAUTH_SCHEME)) {
    throw new TotpError("totp-seed-invalid", "The otpauth URI is not of the form otpauth://totp/...; nothing was captured. Its value is not shown.");
  }
  return {
    seed: requireTotpSeed({ [SEED_SOURCE]: trimmed }, SEED_SOURCE),
    algorithm: DEFAULT_ALGORITHM,
    digits: DEFAULT_DIGITS,
    periodSeconds: DEFAULT_PERIOD_SECONDS,
  };
}
