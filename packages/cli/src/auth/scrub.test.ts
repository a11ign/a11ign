// THE CONTAINMENT (ADR 0038, Constraint 4's second defence) AND ITS TWO AMENDED PROMISES: a floor for a
// scrubbed value (amendment 2), and a count that is always disclosed (Constraint 4, "discloses the count").
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MARKER,
  MIN_SCRUBBED_LENGTH,
  ScrubError,
  buildScrubSet,
  redactionNotice,
  scrubArtifact,
  scrubText,
  writeScrubbed,
} from "./scrub.js";

/** The number ADR 0038 amendment 2 states. Written here as well so changing the constant fails a test. */
const ADR_FLOOR = 8;
const ANNOUNCEMENTS_CHANGED = 5; // the leaves of the four-forms test that hold the value, one occurrence or two
const FAKE_USER = "canaryuser6d3f2a";
const FAKE_SECRET = "canarysecretb81c94";
const SET = buildScrubSet([{ name: "FAKE_USER", value: FAKE_USER }, { name: "FAKE_SECRET", value: FAKE_SECRET }]);

const messageFor = (name: string, value: string): string => {
  try {
    buildScrubSet([{ name, value }]);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error(`${JSON.stringify(value)} was accepted`);
};

const refusedAsTooShort = (name: string, value: string) =>
  assert.throws(() => buildScrubSet([{ name, value }]), (e: Error) => {
    assert.ok(e instanceof ScrubError, `expected a ScrubError, got ${e.name}`);
    assert.equal(e.fault, "auth-credential-too-short");
    assert.match(e.message, new RegExp(name));
    // "test" and "" both appear in the fixed wording, so a substring check cannot say the value was not printed.
    // The message being IDENTICAL for a different short value can: nothing in it depends on the value.
    assert.equal(e.message, messageFor(name, "\u0000"), "the refusal's text must not depend on the value");
    return true;
  });

test("AMENDMENT 2: a username of ada, admin or test refuses the run instead of rewriting the page", () => {
  for (const username of ["ada", "admin", "test"]) refusedAsTooShort("APP_TEST_USER", username);
  // The floor is the ADR's number, pinned, so the paragraph and the constant cannot drift apart.
  assert.equal(MIN_SCRUBBED_LENGTH, ADR_FLOOR);
});

test("AMENDMENT 2: the page's own text is not turned into the marker, because the run never scrubs a short value", () => {
  // What the refusal prevents, shown: with a short value in the set a page that says "Admin panel" would read
  // "‹credential› panel". Building the set is where that is stopped, so no scrub of a short value can occur.
  const page = { transcript: ["Admin panel, heading level 1", "Run a test, button", "ada, link"] };
  for (const short of ["ada", "admin", "test"]) assert.throws(() => buildScrubSet([{ name: "U", value: short }]), ScrubError);
  // And with the credentials the run does accept, the same page comes through byte for byte.
  const { value, redactions } = scrubArtifact(page, SET);
  assert.deepEqual(value, page);
  assert.equal(redactions, 0);
  assert.ok(!JSON.stringify(value).includes(MARKER));
});

test("the floor is counted in code points at the boundary, and both credentials are held to it", () => {
  refusedAsTooShort("U", "abcdefg"); // 7
  buildScrubSet([{ name: "U", value: "abcdefgh" }]); // 8 is accepted
  refusedAsTooShort("U", "😀😀😀😀"); // 4 code points, 8 UTF-16 units: the floor is not fooled by the encoding
  buildScrubSet([{ name: "U", value: "😀".repeat(MIN_SCRUBBED_LENGTH) }]);
  refusedAsTooShort("APP_TEST_PASSWORD", "hunter2"); // the secret is held to it as well as the username
  refusedAsTooShort("EMPTY", "");
});

test("a value is replaced in all four forms, wherever it occurs, and the count is announcements not occurrences", () => {
  const value = 'can"ary user\\1&2';
  const set = buildScrubSet([{ name: "V", value }]);
  const b64 = Buffer.from(value).toString("base64");
  const artifact = {
    transcript: [
      `Signed in as ${value}`,
      `Signed in as ${value}, and again ${value}`, // two occurrences, still one announcement
      `?user=${encodeURIComponent(value)}`,
      `token ${b64}`,
      `escaped ${JSON.stringify(value).slice(1, -1)}`,
      "Orders, heading level 1",
    ],
  };
  const { value: scrubbed, redactions } = scrubArtifact(artifact, set);
  assert.equal(redactions, ANNOUNCEMENTS_CHANGED);
  assert.deepEqual(scrubbed.transcript, [
    `Signed in as ${MARKER}`,
    `Signed in as ${MARKER}, and again ${MARKER}`,
    `?user=${MARKER}`,
    `token ${MARKER}`,
    `escaped ${MARKER}`,
    "Orders, heading level 1",
  ]);
  // The input is not mutated: the caller's capture is still the evidence it was.
  assert.match(artifact.transcript[0], /can"ary/);
});

test("a page that legitimately says Signed in as <username> does not fail the run and does not publish the name", () => {
  const { value, redactions } = scrubArtifact({ transcript: [`Signed in as ${FAKE_USER}`, "Dashboard"] }, SET);
  assert.deepEqual(value.transcript, [`Signed in as ${MARKER}`, "Dashboard"]);
  assert.equal(redactions, 1);
});

test("the redaction count is disclosed, on every path, in the ADR's own words", () => {
  assert.equal(redactionNotice(2), "2 announcements contained a value from your login and were redacted.");
  assert.equal(redactionNotice(1), "1 announcement contained a value from your login and was redacted.");
  assert.equal(redactionNotice(0), "No announcement contained a value from your login.");
});

test("writeScrubbed hands the text over once, clean, and returns the count for the notice", () => {
  const written: string[] = [];
  const count = writeScrubbed({ capture: { transcript: [`hello ${FAKE_SECRET}`, "bye"] } }, SET, (text) => written.push(text));
  assert.equal(count, 1);
  assert.equal(written.length, 1);
  assert.ok(!written[0].includes(FAKE_SECRET) && written[0].includes(MARKER));
  assert.ok(written[0].endsWith("\n"));
  assert.deepEqual(JSON.parse(written[0]), { capture: { transcript: [`hello ${MARKER}`, "bye"] } });
});

test("a value that survives redaction ends the run: in a key, nothing is written", () => {
  // Keys are not redacted, so a credential used as a key survives to the rescan, which must refuse it.
  const written: string[] = [];
  assert.throws(() => writeScrubbed({ [FAKE_USER]: 1 }, SET, (text) => written.push(text)),
    (e: Error) => e instanceof ScrubError && e.fault === "auth-credential-in-artifact" && !e.message.includes(FAKE_USER));
  assert.deepEqual(written, []);
});

test("the same value under two names is one thing to look for, and is reported under both", () => {
  const set = buildScrubSet([{ name: "A_USER", value: "samevalue-12" }, { name: "A_PASSWORD", value: "samevalue-12" }]);
  assert.equal(set.credentials.length, 1);
  assert.equal(set.credentials[0].name, "A_USER/A_PASSWORD");
});

test("printed text is scrubbed line by line, and a spelled-out run in it is refused", () => {
  const { value, redactions } = scrubText(`Signed in as ${FAKE_USER}\nOrders\n${FAKE_SECRET}`, SET);
  assert.equal(value, `Signed in as ${MARKER}\nOrders\n${MARKER}`);
  assert.equal(redactions, 2);
  assert.throws(() => scrubText(["c", "a", "n", "a", "r", "y"].join("\n"), SET),
    (e: Error) => e instanceof ScrubError && e.fault === "auth-credential-in-artifact");
});
