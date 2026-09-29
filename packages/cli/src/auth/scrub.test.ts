// THE CONTAINMENT (ADR 0038, Constraint 4's second defence) AND ITS TWO AMENDED PROMISES: a floor for a
// scrubbed value (amendment 2), and a count that is always disclosed (Constraint 4, "discloses the count").
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MARKER,
  MIN_SCRUBBED_LENGTH,
  ScrubError,
  buildScrubSet,
  credentialsFromState,
  redactionNotice,
  scrubArtifact,
  scrubText,
  stateEntriesFor,
  stateScrubNotices,
  writeScrubbed,
  type StorageState,
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

// ---- ADR 0038, amendment 7, choice 4: a saved storage state is a source of values to hide -------------------------------

const APP = "https://app.example.test";
const SESSION_COOKIE = "sessioncookievalue-9f31c2";
const API_TOKEN = "tok-live-0123456789abcdef";
const STATE: StorageState = {
  cookies: [
    { name: "theme", value: "dark", domain: "app.example.test" },
    { name: "sid", value: SESSION_COOKIE, domain: "app.example.test" },
    { name: "shared", value: "domaincookievalue-77aa", domain: ".example.test" },
    { name: "elsewhere", value: "othersitesession-5555", domain: "other.example.org" },
    { name: "lookalike", value: "lookalikesession-6666", domain: ".pp.example.test" },
  ],
  origins: [
    { origin: APP, localStorage: [
      { name: "auth", value: JSON.stringify({ access_token: API_TOKEN, expires: 3600 }) },
      { name: "lastPage", value: "/dashboard/settings" },
      { name: "flag", value: "true" },
    ] },
    { origin: "https://other.example.org", localStorage: [{ name: "auth", value: "othersitelocalstorage-8888" }] },
  ],
};

test("CHOICE 3/4: only the pinned origin's cookies and localStorage are selected, and a look-alike host is not the same host", () => {
  const entries = stateEntriesFor(STATE, APP);
  assert.deepEqual(entries.cookies.map((cookie) => cookie.name), ["theme", "sid", "shared"]);
  assert.deepEqual(entries.localStorage.map((item) => item.name), ["auth", "lastPage", "flag"]);
  // A host-only cookie is not sent to a subdomain, and a domain cookie is not sent to a host that merely ends in the same letters.
  assert.deepEqual(stateEntriesFor(STATE, "https://sub.app.example.test").cookies.map((cookie) => cookie.name), ["shared"]);
  assert.deepEqual(stateEntriesFor(STATE, "https://notexample.test").cookies, []);
});

test("CHOICE 3: a selected cookie keeps the attributes loading needs (path, expiry, secure, httpOnly, sameSite) and its place in the file", () => {
  const full: StorageState = {
    cookies: [
      { name: "other", value: "x".repeat(9), domain: "other.example.org" },
      { name: "sid", value: SESSION_COOKIE, domain: "app.example.test", path: "/app", expires: 1900000000, httpOnly: true, secure: true, sameSite: "Lax" },
    ],
    origins: [],
  };
  assert.deepEqual(stateEntriesFor(full, APP).cookies, [
    { name: "sid", value: SESSION_COOKIE, domain: "app.example.test", path: "/app", expires: 1900000000, httpOnly: true, secure: true, sameSite: "Lax", place: 2 },
  ]);
});

test("CHOICE 4: the state's values are hidden, named by PLACE and never by the file's own key, and a value inside JSON counts", () => {
  const found = credentialsFromState(STATE, { origin: APP, publicText: [] });
  assert.ok(found.credentials.every(({ name }) => /^state (cookie|localStorage) \d+$/.test(name)), "no key, no value in a name");
  assert.ok(found.credentials.some(({ name, value }) => name === "state cookie 2" && value === SESSION_COOKIE));
  assert.ok(found.credentials.some(({ name, value }) => name === "state localStorage 1" && value === API_TOKEN), "the token inside the JSON object");
  // Nothing from another site's session is read, so nothing from it can be hidden or claimed hidden.
  assert.ok(!found.credentials.some(({ value }) => value.includes("othersite")));
  const set = buildScrubSet(found.credentials);
  const { value, redactions } = scrubArtifact({ transcript: [`Signed in, token ${API_TOKEN}`, `cookie ${SESSION_COOKIE}`, "Orders"] }, set);
  assert.deepEqual(value, { transcript: [`Signed in, token ${MARKER}`, `cookie ${MARKER}`, "Orders"] });
  assert.equal(redactions, 2);
});

test("CHOICE 4: a value below the floor is SKIPPED and COUNTED, never refused and never silent", () => {
  const found = credentialsFromState(STATE, { origin: APP, publicText: [] });
  assert.equal(found.skippedShort, 2, "dark and true; the JSON's expires is not a string");
  assert.doesNotThrow(() => buildScrubSet(found.credentials), "the short values never reach the floor's refusal");
  assert.match(stateScrubNotices(found).join(" "), /2 values in your saved state are shorter than 8 characters and not hidden/);
  // The boundary, on both sides, so the skip and the floor are one number.
  const at = (length: number) => credentialsFromState({ cookies: [{ name: "n", value: "x".repeat(length), domain: "app.example.test" }], origins: [] },
    { origin: APP, publicText: [] });
  assert.equal(at(MIN_SCRUBBED_LENGTH).credentials.length, 1);
  assert.equal(at(MIN_SCRUBBED_LENGTH - 1).credentials.length, 0);
  assert.equal(at(MIN_SCRUBBED_LENGTH - 1).skippedShort, 1);
});

test("CHOICE 4: a value that is the run's own URL or task text is skipped and counted, and everything else is still hidden", () => {
  const publicText = [`${APP}/dashboard/settings`, "check the orders"];
  const found = credentialsFromState(STATE, { origin: APP, publicText });
  assert.equal(found.skippedPublic, 1, "/dashboard/settings is in the URL");
  assert.ok(!found.credentials.some(({ value }) => value === "/dashboard/settings"));
  assert.ok(found.credentials.some(({ value }) => value === SESSION_COOKIE), "a session cookie is not public because a URL exists");
  assert.match(stateScrubNotices(found).join(" "), /1 value in your saved state appears in your URLs or task and is not hidden/);
  // A token in the URL is the caller's text and is disclosed as skipped: the notice, not silence, is the handling.
  assert.equal(credentialsFromState(STATE, { origin: APP, publicText: [`${APP}/x?t=${SESSION_COOKIE}`] }).skippedPublic, 1);
});

test("CHOICE 4: a state that skips nothing says nothing, and a percent-encoded cookie is hidden in its decoded spelling too", () => {
  const clean: StorageState = { cookies: [{ name: "sid", value: "opaque%20session%2Fvalue-12", domain: "app.example.test" }], origins: [] };
  const found = credentialsFromState(clean, { origin: APP, publicText: [] });
  assert.deepEqual(stateScrubNotices(found), []);
  assert.deepEqual(found.credentials.map(({ value }) => value).sort(), ["opaque session/value-12", "opaque%20session%2Fvalue-12"]);
  assert.equal(scrubText("Session: opaque session/value-12", buildScrubSet(found.credentials)).value, `Session: ${MARKER}`);
});
