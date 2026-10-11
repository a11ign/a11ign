// THE otpauth:// URI AND THE BARE SEED: both resolve to the shape totpCode takes, and every refusal is by NAME
// and never carries the secret.
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseTotpSecret } from "./otpauth.js";
import { totpCode, TotpError } from "./totp.js";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const base32 = (text: string): string => {
  let bits = "";
  for (const byte of Buffer.from(text)) bits += byte.toString(2).padStart(8, "0");
  return (bits.match(/.{1,5}/g) ?? []).map((group) => ALPHABET[parseInt(group.padEnd(5, "0"), 2)]).join("");
};
const RFC_SEED = base32("12345678901234567890");
const SECOND = 1000;
const uri = (query: string, scheme = "totp"): string => `otpauth://${scheme}/Example:me@example.com?${query}`;

test("POSITIVE CONTROL: a URI's algorithm, digits and period are returned exactly", () => {
  const parsed = parseTotpSecret(uri(`secret=${RFC_SEED}&algorithm=SHA256&digits=8&period=60&issuer=Example`));
  assert.deepEqual(parsed, { seed: RFC_SEED, algorithm: "sha256", digits: 8, periodSeconds: 60 });
});

test("POSITIVE CONTROL: a bare seed, and a URI with only a secret, return SHA-1, 6 digits and 30 s", () => {
  const defaults = { seed: RFC_SEED, algorithm: "sha1", digits: 6, periodSeconds: 30 };
  assert.deepEqual(parseTotpSecret(RFC_SEED), defaults);
  assert.deepEqual(parseTotpSecret(uri(`secret=${RFC_SEED}`)), defaults);
});

test("POSITIVE CONTROL: the RFC 6238 SHA-1 seed as a URI computes the Appendix B code through totpCode", () => {
  const { seed, ...options } = parseTotpSecret(uri(`secret=${RFC_SEED}&digits=8`));
  assert.equal(totpCode(seed, 59 * SECOND, options), "94287082");
});

test("POSITIVE CONTROL: the period reaches the code, so a 60 s URI is not read as 30 s", () => {
  const { seed, ...options } = parseTotpSecret(uri(`secret=${RFC_SEED}&period=60`));
  assert.equal(totpCode(seed, 59 * SECOND, options), totpCode(seed, 0, { periodSeconds: 60 }));
  assert.notEqual(totpCode(seed, 59 * SECOND, options), totpCode(seed, 59 * SECOND));
});

const REFUSALS: readonly (readonly [string, string, string])[] = [
  ["hotp", uri(`secret=${RFC_SEED}&counter=0`, "hotp"), "counter-based"],
  ["missing secret", uri("algorithm=SHA1"), "no secret parameter"],
  ["algorithm=MD5", uri(`secret=${RFC_SEED}&algorithm=MD5`), "algorithm must be one of"],
  ["digits=5", uri(`secret=${RFC_SEED}&digits=5`), "digits must be a whole number"],
  ["period=0", uri(`secret=${RFC_SEED}&period=0`), "period must be a whole number"],
  ["period=301", uri(`secret=${RFC_SEED}&period=301`), "period must be a whole number"],
  ["period=abc", uri(`secret=${RFC_SEED}&period=abc`), "period must be a whole number"],
  ["non-base32 secret in a URI", uri("secret=NOT1BASE32SECRET8%2F"), "secret parameter does not hold a base32 seed"],
  ["non-base32 bare value", "NOT1BASE32SECRET8/", "does not hold a base32 seed"],
  ["short seed", "JBSWY3DP", "shorter than"],
  ["a URI of no totp form", "otpauth://" + RFC_SEED, "not of the form otpauth://totp/"],
];

for (const [label, value, reason] of REFUSALS) {
  test(`NEGATIVE CONTROL: ${label} is refused by name, and the message does not carry the value`, () => {
    assert.throws(
      () => parseTotpSecret(value),
      (error: unknown) => {
        assert.ok(error instanceof TotpError, "a TotpError");
        assert.ok(error.message.includes(reason), `names its reason: ${error.message}`);
        return true;
      },
    );
  });
}

test("NEGATIVE CONTROL: no refusal message holds the secret, the URI or any piece of either", () => {
  const secrets = [RFC_SEED, "NOT1BASE32SECRET8", "example.com"];
  for (const [, value] of REFUSALS) {
    try {
      parseTotpSecret(value);
      assert.fail("expected a refusal");
    } catch (error) {
      assert.ok(error instanceof TotpError);
      for (const secret of [...secrets, value]) assert.ok(!error.message.includes(secret), `leaked ${secret}`);
    }
  }
});
