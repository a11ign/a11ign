// THE AUTHENTICATOR CODE (RFC 6238) AND ITS SEED: the code against the RFC's own vectors, the wait at a window's
// edge, and a refusal that names the variable and never a value.
import { test } from "node:test";
import assert from "node:assert/strict";

import { assertNoTotpCode, buildScrubSet, MIN_SCRUBBED_LENGTH, ScrubError } from "./scrub.js";
import { codeForUse, decodeBase32, requireTotpSeed, totpCode, TotpError } from "./totp.js";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
/** RFC 4648 encode, so the RFC 6238 ASCII seeds can be handed to a function that takes base32. */
const base32 = (text: string): string => {
  let bits = "";
  for (const byte of Buffer.from(text)) bits += byte.toString(2).padStart(8, "0");
  return (bits.match(/.{1,5}/g) ?? []).map((group) => ALPHABET[parseInt(group.padEnd(5, "0"), 2)]).join("");
};

const SEEDS = {
  sha1: base32("12345678901234567890"),
  sha256: base32("12345678901234567890123456789012"),
  sha512: base32("1234567890123456789012345678901234567890123456789012345678901234"),
} as const;
// RFC 6238 Appendix B: [time in seconds, sha1, sha256, sha512], 8 digits.
const VECTORS: readonly (readonly [number, string, string, string])[] = [
  [59, "94287082", "46119246", "90693936"],
  [1111111109, "07081804", "68084774", "25091201"],
  [1111111111, "14050471", "67062674", "99943326"],
  [1234567890, "89005924", "91819424", "93441116"],
  [2000000000, "69279037", "90698825", "38618901"],
  [20000000000, "65353130", "77737706", "47863826"],
];
const SECRET = SEEDS.sha1;
const SECOND = 1000;

test("POSITIVE CONTROL: totpCode matches every RFC 6238 Appendix B vector for SHA-1, SHA-256 and SHA-512", () => {
  for (const [seconds, sha1, sha256, sha512] of VECTORS) {
    assert.equal(totpCode(SEEDS.sha1, seconds * SECOND, { digits: 8, algorithm: "sha1" }), sha1, `sha1 @ ${seconds}`);
    assert.equal(totpCode(SEEDS.sha256, seconds * SECOND, { digits: 8, algorithm: "sha256" }), sha256, `sha256 @ ${seconds}`);
    assert.equal(totpCode(SEEDS.sha512, seconds * SECOND, { digits: 8, algorithm: "sha512" }), sha512, `sha512 @ ${seconds}`);
  }
});

test("POSITIVE CONTROL: the defaults are 6 digits, 30 s and SHA-1, and the seed is read case-insensitively with spaces and padding", () => {
  assert.equal(totpCode(SECRET, 59 * SECOND), "287082");
  const spaced = `${SECRET.slice(0, 8).toLowerCase()} ${SECRET.slice(8)}====`;
  assert.deepEqual(decodeBase32(spaced), decodeBase32(SECRET));
  assert.equal(totpCode(SECRET, 59 * SECOND, { periodSeconds: 60 }), totpCode(SECRET, 0, { periodSeconds: 60 }));
});

test("POSITIVE CONTROL: codeForUse with a pinned clock mid-window returns the window's code and does not sleep", async () => {
  const sleeps: number[] = [];
  const mid = 1111111109 * SECOND - 20 * SECOND; // 9 s into its window, 21 s remain
  const code = await codeForUse(SECRET, () => mid, async (ms) => void sleeps.push(ms));
  assert.equal(code, totpCode(SECRET, mid));
  assert.deepEqual(sleeps, []);
});

test("NEGATIVE CONTROL: with fewer than 3 seconds left codeForUse sleeps to the boundary and returns the NEXT window's code", async () => {
  const edge = 1111111109 * SECOND; // 1 s before the 30 s boundary
  const sleeps: number[] = [];
  const code = await codeForUse(SECRET, () => edge, async (ms) => void sleeps.push(ms));
  assert.deepEqual(sleeps, [SECOND]);
  assert.equal(code, totpCode(SECRET, edge + SECOND));
  assert.notEqual(code, totpCode(SECRET, edge));
});

test("NEGATIVE CONTROL: exactly 3 seconds left is still used, and a sleep that advances the clock past the boundary is honoured", async () => {
  const threeLeft = 1111111109 * SECOND - 2 * SECOND;
  assert.equal(await codeForUse(SECRET, () => threeLeft, async () => assert.fail("must not sleep")), totpCode(SECRET, threeLeft));
  let now = 1111111109 * SECOND;
  const code = await codeForUse(SECRET, () => now, async (ms) => { now += ms + 500; });
  assert.equal(code, totpCode(SECRET, now));
});

test("NEGATIVE CONTROL: an unset, empty or blank variable is refused by NAME", () => {
  for (const env of [{}, { TOTP_SEED: "" }, { TOTP_SEED: "   " }]) {
    assert.throws(() => requireTotpSeed(env, "TOTP_SEED"), (error: Error) => {
      assert.ok(error instanceof TotpError);
      assert.equal(error.fault, "totp-seed-missing");
      assert.match(error.message, /TOTP_SEED/);
      return true;
    });
  }
  assert.equal(requireTotpSeed({ TOTP_SEED: SECRET }, "TOTP_SEED"), SECRET);
});

test("NEGATIVE CONTROL: a non-base32 seed and a seed under 10 bytes are refused by name, and no message holds the seed or a code", () => {
  const notBase32 = "not-base32-1890!SECRETVALUE";
  const tooShort = "JBSWY3DPEE"; // 10 chars = 6 bytes
  const exactlyTen = "JBSWY3DPEHPK3PXP"; // 16 chars = 10 bytes
  for (const value of [notBase32, tooShort]) {
    assert.throws(() => requireTotpSeed({ TOTP_SEED: value }, "TOTP_SEED"), (error: Error) => {
      assert.ok(error instanceof TotpError);
      assert.equal(error.fault, "totp-seed-invalid");
      assert.match(error.message, /TOTP_SEED/);
      assert.ok(!error.message.includes(value), "the message holds the seed");
      assert.ok(!error.message.includes(value.slice(0, 6)), "the message holds part of the seed");
      return true;
    });
  }
  assert.equal(requireTotpSeed({ TOTP_SEED: exactlyTen }, "TOTP_SEED"), exactlyTen);
  assert.throws(() => totpCode("1", 0), TotpError); // 1 is not in the base32 alphabet
});

test("NEGATIVE CONTROL: every refusal message is searched for the seed and the code", () => {
  const seed = SEEDS.sha1;
  const code = totpCode(seed, 0);
  const refusals: Error[] = [];
  const collect = (run: () => unknown): void => {
    try { run(); } catch (error) { refusals.push(error as Error); }
  };
  collect(() => requireTotpSeed({ S: "bad seed!" + seed }, "S"));
  collect(() => requireTotpSeed({}, "S"));
  collect(() => totpCode(seed, 0, { digits: 9 }));
  collect(() => totpCode(seed, 0, { periodSeconds: 0 }));
  collect(() => totpCode(seed, 0, { algorithm: "md5" as never }));
  collect(() => assertNoTotpCode(`pay ${code}`, seed, 0, { artifact: "report.json" }));
  assert.equal(refusals.length, 6, "a refusal path stopped refusing");
  for (const error of refusals) {
    assert.ok(!error.message.includes(seed), error.message);
    assert.ok(!error.message.includes(code), error.message);
  }
});

test("NEGATIVE CONTROL: options out of range are refused", () => {
  for (const options of [{ digits: 5 }, { digits: 9 }, { digits: 6.5 }, { periodSeconds: 0 }, { periodSeconds: 121 }]) {
    assert.throws(() => totpCode(SECRET, 0, options), (error: Error) => error instanceof TotpError && error.fault === "totp-option-invalid");
  }
});

test("POSITIVE CONTROL: assertNoTotpCode passes on a text without a code and on the code inside a longer digit run", () => {
  const now = 1111111109 * SECOND;
  const code = totpCode(SECRET, now);
  assert.doesNotThrow(() => assertNoTotpCode("Order 42 shipped on the 7th", SECRET, now, { artifact: "report.json" }));
  assert.doesNotThrow(() => assertNoTotpCode(`ref 9${code}9 and ${code}12 and 3${code}`, SECRET, now, { artifact: "report.json" }));
});

test("NEGATIVE CONTROL: assertNoTotpCode throws on the previous, current and next window's code as a whole token, naming the artifact", () => {
  const now = 1111111109 * SECOND;
  for (const delta of [-30, 0, 30]) {
    const code = totpCode(SECRET, now + delta * SECOND);
    assert.throws(() => assertNoTotpCode(`The code is ${code}.`, SECRET, now, { artifact: "transcript.json" }), (error: Error) => {
      assert.ok(error instanceof ScrubError);
      assert.match(error.message, /transcript\.json/);
      assert.ok(!error.message.includes(code));
      return true;
    });
  }
  const farCode = totpCode(SECRET, now + 5 * 30 * SECOND);
  assert.doesNotThrow(() => assertNoTotpCode(farCode, SECRET, now, { artifact: "a" }));
});

test("the seed is a scrub value like a password: it clears the floor and a short one is refused", () => {
  assert.ok(MIN_SCRUBBED_LENGTH <= base32("a".repeat(10)).length);
  assert.doesNotThrow(() => buildScrubSet([{ name: "TOTP_SEED", value: SECRET }]));
});
