// "A SCREEN READER ANNOUNCES WHAT IS TYPED" (ADR 0038, Constraint 4) — AND THE PROOF IT DOES NOT REACH A FILE.
//
// The first command of the proof is an emptiness claim: no leak found. It is worth something only if the
// detector demonstrably CAN fire, so this file holds the positive controls that need no Windows machine:
//
//   1. a checked-in transcript with the fake credential SPELLED OUT, which a contiguous search reads as clean,
//   2. the same transcript fed to the RUNTIME path (amendment 1): the scrub must refuse it, and write nothing.
//
// The decoys matter as much as the controls. A detector that fires on any four one-character announcements
// would pass the controls and be useless, so each decoy differs from the control by exactly one thing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  LEAK_EXIT,
  SPELLED_RUN_MIN,
  credentialForms,
  describeExamined,
  findContiguousLeaks,
  findLeaks,
  findSpelledOutLeaks,
  leakCheckExit,
  type Credential,
} from "./leak-detector.js";
import { ScrubError, buildScrubSet, scrubArtifact, writeScrubbed } from "./scrub.js";

// Letters and digits only, on purpose: NVDA speaks a typed punctuation character by its NAME, so a fake with
// punctuation would spell itself in words and the control would not be the thing it says it is.
const FAKE_USER = "canaryuser6d3f2a";
const FAKE_SECRET = "canarysecretb81c94";
const CREDENTIALS: Credential[] = [
  { name: "FAKE_USER", value: FAKE_USER },
  { name: "FAKE_SECRET", value: FAKE_SECRET },
];

const fixture = JSON.parse(readFileSync(new URL("./fixtures/spelled-out-transcript.json", import.meta.url), "utf8")) as {
  capture: { transcript: string[] };
};
const SPELLED = fixture.capture.transcript;

const letters = (word: string) => word.split("");

test("POSITIVE CONTROL 1: the checked-in transcript with the credential spelled out is reported", () => {
  // The control's own premise, asserted rather than assumed: a contiguous search finds nothing in it, so
  // only the per-character branch can be what fires below.
  assert.deepEqual(findContiguousLeaks(JSON.stringify(SPELLED), CREDENTIALS), []);
  const hits = findSpelledOutLeaks(SPELLED, CREDENTIALS);
  assert.ok(hits.every((hit) => hit.kind === "spelled-out"));
  // Both fakes begin "canary", so the secret is named too: a hit says WHICH values the run spelled parts of, and
  // a shared prefix is shared. The username is what was typed, and it must be among them.
  assert.ok(hits.some((hit) => hit.name === "FAKE_USER"), JSON.stringify(hits));
});

test("POSITIVE CONTROL 2, the RUNTIME path: the scrub refuses the spelled-out transcript and writes nothing", () => {
  const set = buildScrubSet(CREDENTIALS);
  const written: string[] = [];
  assert.throws(() => writeScrubbed({ capture: { transcript: SPELLED } }, set, (text) => written.push(text)),
    (e: Error) => {
      assert.ok(e instanceof ScrubError, `expected a ScrubError, got ${e.name}: ${e.message}`);
      assert.equal(e.fault, "auth-credential-in-artifact");
      assert.match(e.message, /Nothing was written and nothing was printed/);
      assert.match(e.message, /spelled out one character at a time/);
      // The refusal names the variable and never the value, or any four-character part of it.
      assert.match(e.message, /FAKE_USER/);
      for (const value of CREDENTIALS.map((c) => c.value)) {
        for (let at = 0; at + SPELLED_RUN_MIN <= value.length; at += 1) {
          assert.ok(!e.message.includes(value.slice(at, at + SPELLED_RUN_MIN)), `the message leaked ${value.slice(at, at + SPELLED_RUN_MIN)}`);
        }
      }
      return true;
    });
  assert.deepEqual(written, [], "a refused run must not have written anything");
  assert.throws(() => scrubArtifact({ transcript: SPELLED }, set), ScrubError);
});

test("the runtime path and the detector agree on every subject: one detector, not two", () => {
  const set = buildScrubSet(CREDENTIALS);
  const subjects: Array<[string, unknown, "leak" | "clean"]> = [
    ["spelled out", { transcript: SPELLED }, "leak"],
    ["spelled out, upper case", { transcript: letters(FAKE_USER.toUpperCase()) }, "leak"],
    ["a decoy: a run of three", { transcript: ["Email", ...letters("can"), "edit"] }, "clean"],
    ["a decoy: four letters spelling no part of it", { transcript: letters("xyzq") }, "clean"],
    ["a decoy: the credential's letters, not consecutive", { transcript: ["c", "edit", "a", "edit", "n", "edit", "a", "edit"] }, "clean"],
    ["an ordinary page", { transcript: ["Welcome", "Orders, heading level 1", "Sign out, link"] }, "clean"],
  ];
  for (const [label, artifact, expected] of subjects) {
    const detected = findLeaks(artifact, CREDENTIALS).length > 0;
    let refused = false;
    try {
      scrubArtifact(artifact, set);
    } catch (error) {
      assert.ok(error instanceof ScrubError, label);
      refused = true;
    }
    assert.equal(detected, expected === "leak", `${label}: the detector said ${detected}`);
    assert.equal(refused, expected === "leak", `${label}: the runtime path said ${refused}`);
  }
});

test("the per-character branch: what counts as a run", () => {
  const spelled = (announcements: string[]) => findSpelledOutLeaks(announcements, CREDENTIALS).map((hit) => hit.name);
  const BOTH = ["FAKE_USER", "FAKE_SECRET"]; // both begin "canary"
  assert.deepEqual(spelled(letters("canary")), BOTH, "six consecutive letters of the value");
  assert.deepEqual(spelled(letters("nary")), BOTH, "exactly four, from the middle of the value");
  assert.deepEqual(spelled(letters("nar")), [], "three is below the floor of four");
  assert.deepEqual(spelled([...letters("can"), "space", ...letters("ary")]), [], "a longer announcement ends the run");
  assert.deepEqual(spelled(letters("cAnArY")), BOTH, "case-insensitive");
  assert.deepEqual(spelled(["c ", " a", "n", "a", "r", "y"]), BOTH, "an announcement is trimmed before it is judged one character");
  assert.deepEqual(spelled(letters("secretb81")), ["FAKE_SECRET"], "only the credential it spells");
  assert.deepEqual(spelled(letters("qzxw")), [], "a run that spells nothing of either");
});

test("the contiguous branch finds all four forms, and names which", () => {
  // Punctuation in THIS fake on purpose: it is the only way the JSON-escaped and URL-encoded forms differ from
  // the raw one. The fake in the controls above stays alphanumeric because that is the typed-by-keystroke case.
  const value = 'can"ary user\\1&2';
  const credentials: Credential[] = [{ name: "V", value }];
  const all = credentialForms(value);
  const textOf = (form: string) => all.filter((f) => f.form === form).map((f) => f.text);
  assert.deepEqual(textOf("json-escaped"), ['can\\"ary user\\\\1&2']);
  assert.deepEqual(textOf("url-encoded"), ["can%22ary%20user%5C1%262"]);
  assert.ok(textOf("base64").includes(Buffer.from(value).toString("base64")));
  for (const { form, text } of all) {
    const hits = findContiguousLeaks(`before ${text} after`, credentials);
    assert.ok(hits.some((hit) => hit.kind === "contiguous" && hit.form === form), `${form} form was not found`);
  }
  assert.deepEqual(findContiguousLeaks("nothing of the kind", credentials), []);
  // Unpadded and URL-safe base64 are spellings in use, so they are looked for too.
  const padded = Buffer.from("subject~??>>", "utf8").toString("base64");
  const urlSafe = padded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assert.notEqual(urlSafe, padded);
  assert.ok(findContiguousLeaks(urlSafe, [{ name: "S", value: "subject~??>>" }]).length > 0);
});

test("a hit carries the variable's name and never the value", () => {
  const hits = [
    ...findLeaks({ transcript: SPELLED, page: `Signed in as ${FAKE_USER} ${FAKE_SECRET}` }, CREDENTIALS),
  ];
  const kinds = new Set(hits.map((hit) => `${hit.kind}:${hit.name}`));
  for (const expected of ["contiguous:FAKE_USER", "contiguous:FAKE_SECRET", "spelled-out:FAKE_USER"]) assert.ok(kinds.has(expected), expected);
  const printed = JSON.stringify(hits);
  assert.ok(!printed.includes(FAKE_USER) && !printed.includes(FAKE_SECRET), printed);
});

test("EXIT CONTRACT: 0 clean, 1 a leak, 2 could not examine, and examining zero is 2", () => {
  const examined = { examinedFiles: 3, examinedAnnouncements: 412 };
  const leak = findLeaks({ transcript: SPELLED }, CREDENTIALS);
  assert.equal(LEAK_EXIT.clean, 0);
  assert.equal(LEAK_EXIT.leak, 1);
  assert.equal(LEAK_EXIT.couldNotExamine, 2);
  assert.equal(leakCheckExit({ ...examined, hits: [] }), 0);
  assert.equal(leakCheckExit({ ...examined, hits: leak }), 1);
  // The two ways of examining nothing: an empty directory, and a capture with no announcements. Neither may
  // read as clean, because the first command of the proof is an emptiness claim.
  assert.equal(leakCheckExit({ examinedFiles: 0, examinedAnnouncements: 0, hits: [] }), 2);
  assert.equal(leakCheckExit({ examinedFiles: 2, examinedAnnouncements: 0, hits: [] }), 2);
  assert.equal(leakCheckExit({ examinedFiles: 0, examinedAnnouncements: 9, hits: [] }), 2);
  // A hit is a leak whatever else is true: it outranks "examined nothing", it is never softened to 2.
  assert.equal(leakCheckExit({ examinedFiles: 1, examinedAnnouncements: 0, hits: leak }), 1);
  assert.equal(describeExamined(examined), "examined 3 files and 412 announcements");
  assert.equal(describeExamined({ examinedFiles: 1, examinedAnnouncements: 1 }), "examined 1 file and 1 announcement");
});
