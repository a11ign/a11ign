/**
 * An authenticator-app code (RFC 6238, TOTP over RFC 4226's HMAC truncation) and the seed it comes from.
 *
 * PURE apart from `node:crypto`: the clock and the sleep are handed in, and the seed arrives as an argument. It
 * reads no environment itself (`requireTotpSeed` is handed one) and no file, and it owns no flow-file key: the
 * wiring that decides when a page asks for a code is a later row's.
 *
 * **A refusal names the VARIABLE and never a value.** A seed that fails to decode is a secret that nearly
 * worked, so a message quoting it, or its length class, or the offending character, would put a real secret in
 * a log. Every message here is built from the variable's name and constants only.
 */
import { createHmac } from "node:crypto";

export type TotpAlgorithm = "sha1" | "sha256" | "sha512";

export interface TotpOptions {
  readonly digits?: number;
  readonly periodSeconds?: number;
  readonly algorithm?: TotpAlgorithm;
}

export const DEFAULT_DIGITS = 6;
export const DEFAULT_PERIOD_SECONDS = 30;
export const DEFAULT_ALGORITHM: TotpAlgorithm = "sha1";
/** RFC 4226 section 4 asks for at least 128 bits and recommends 160; 10 bytes (80 bits) is the floor below which a seed is not one. */
export const MIN_SEED_BYTES = 10;
/** A code with fewer than this many seconds left may expire between being computed and being typed and submitted. */
export const WINDOW_EDGE_SECONDS = 3;

const MILLIS = 1000;
const MIN_DIGITS = 6;
const MAX_DIGITS = 8;
const MIN_PERIOD = 1;
const MAX_PERIOD = 120;
const ALGORITHMS: readonly TotpAlgorithm[] = ["sha1", "sha256", "sha512"];
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const BITS_PER_BASE32_CHAR = 5;
const BITS_PER_BYTE = 8;
const LOW_NIBBLE = 0x0f;
const SIGN_BIT_CLEAR = 0x7fffffff;
const DECIMAL = 10;

/** A missing or malformed seed, or an option out of range. The message never holds a value. */
export class TotpError extends Error {
  readonly fault: "totp-seed-missing" | "totp-seed-invalid" | "totp-option-invalid";
  constructor(fault: TotpError["fault"], message: string, options?: { cause: unknown }) {
    super(`${message} (fault: ${fault})`, options);
    this.name = "TotpError";
    this.fault = fault;
  }
}

/** RFC 4648 base32, case-insensitive; spaces and trailing `=` are tolerated and anything else refuses. */
export function decodeBase32(seed: string): Buffer {
  const cleaned = seed.replace(/\s+/g, "").replace(/=+$/, "").toUpperCase();
  if (cleaned.length === 0 || [...cleaned].some((char) => !BASE32_ALPHABET.includes(char))) {
    throw new TotpError("totp-seed-invalid", "The authenticator seed is not base32 (letters A-Z and digits 2-7, spaces and trailing = allowed).");
  }
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of cleaned) {
    buffer = (buffer << BITS_PER_BASE32_CHAR) | BASE32_ALPHABET.indexOf(char);
    bits += BITS_PER_BASE32_CHAR;
    if (bits >= BITS_PER_BYTE) {
      bits -= BITS_PER_BYTE;
      bytes.push((buffer >> bits) & 0xff);
      buffer &= (1 << bits) - 1;
    }
  }
  return Buffer.from(bytes);
}

function resolved(options: TotpOptions): Required<TotpOptions> {
  const digits = options.digits ?? DEFAULT_DIGITS;
  const periodSeconds = options.periodSeconds ?? DEFAULT_PERIOD_SECONDS;
  const algorithm = options.algorithm ?? DEFAULT_ALGORITHM;
  if (!Number.isInteger(digits) || digits < MIN_DIGITS || digits > MAX_DIGITS) {
    throw new TotpError("totp-option-invalid", `TOTP digits must be a whole number from ${MIN_DIGITS} to ${MAX_DIGITS}.`);
  }
  if (!Number.isInteger(periodSeconds) || periodSeconds < MIN_PERIOD || periodSeconds > MAX_PERIOD) {
    throw new TotpError("totp-option-invalid", `TOTP period must be a whole number of seconds from ${MIN_PERIOD} to ${MAX_PERIOD}.`);
  }
  if (!ALGORITHMS.includes(algorithm)) {
    throw new TotpError("totp-option-invalid", `TOTP algorithm must be one of ${ALGORITHMS.join(", ")}.`);
  }
  return { digits, periodSeconds, algorithm };
}

/** The code for the window holding `nowMs` (epoch milliseconds). */
export function totpCode(seed: string, nowMs: number, options: TotpOptions = {}): string {
  const { digits, periodSeconds, algorithm } = resolved(options);
  const counter = Buffer.alloc(BITS_PER_BYTE);
  counter.writeBigUInt64BE(BigInt(Math.floor(nowMs / MILLIS / periodSeconds)));
  const hash = createHmac(algorithm, decodeBase32(seed)).update(counter).digest();
  const offset = hash[hash.length - 1]! & LOW_NIBBLE;
  const truncated = hash.readUInt32BE(offset) & SIGN_BIT_CLEAR;
  return String(truncated % DECIMAL ** digits).padStart(digits, "0");
}

/**
 * A code that will still be valid when it is typed: **when fewer than `WINDOW_EDGE_SECONDS` remain in the current
 * window, wait for the next one** and return its code. (A period under twice that is capped at half the period, or
 * a 1 s period would wait forever.) The clock is read again after the sleep and the later of that and the window
 * boundary is used, so a sleep that returns early cannot hand back the code that was about to expire.
 */
export async function codeForUse(
  seed: string,
  clock: () => number,
  sleep: (ms: number) => Promise<void>,
  options: TotpOptions = {},
): Promise<string> {
  const { periodSeconds } = resolved(options);
  const periodMs = periodSeconds * MILLIS;
  const now = clock();
  const remainingMs = periodMs - (now % periodMs);
  if (remainingMs >= Math.min(WINDOW_EDGE_SECONDS * MILLIS, periodMs / 2)) return totpCode(seed, now, options);
  await sleep(remainingMs);
  return totpCode(seed, Math.max(clock(), now + remainingMs), options);
}

/**
 * The seed from the environment, validated. **Refuses by NAME**: an unset or empty variable, a value that is not
 * base32, and a value that decodes to fewer than `MIN_SEED_BYTES`. Returns the value as given.
 */
export function requireTotpSeed(env: Readonly<Record<string, string | undefined>>, name: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === "") {
    throw new TotpError("totp-seed-missing", `${name} is not set. Set it to the base32 seed your authenticator app was enrolled with; nothing was captured.`);
  }
  let bytes: number;
  try {
    bytes = decodeBase32(value).length;
  } catch (error) {
    throw new TotpError("totp-seed-invalid", `${name} does not hold a base32 seed (letters A-Z and digits 2-7). Its value is not shown.`, { cause: error });
  }
  if (bytes < MIN_SEED_BYTES) {
    throw new TotpError("totp-seed-invalid", `${name} holds a seed shorter than ${MIN_SEED_BYTES} bytes, which is not an authenticator seed. Its value is not shown.`);
  }
  return value;
}
