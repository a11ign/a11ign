/**
 * A predicted announcement is never evidence (ADR 0021). The announcement emulator (#928, Part B) will record what NVDA is
 * PREDICTED to say beside what it said, and the two must never meet in a field an evidence claim reads. The `nvda-speech`
 * README states the rule as "a test that fails if predicted text appears in an evidence field". This is that test, written
 * before any emulator code exists, so it guards the boundary as it can be stated today:
 *
 *  1. Nothing in the evidence package or the CLI imports the speech layer or the emulator, in source or in a declared
 *     dependency. The Apache-2.0 packages never reach a package that is not theirs to ship.
 *  2. Given a capture record and a prediction record, no string in an evidence field equals or contains a string the
 *     prediction holds (`predictedTextInEvidence`).
 *
 * Check 2 reads a prediction record ONLY through `PREDICTION_TEXT_FIELDS`. A predicted-text field that list does not name
 * is not read, so the emulator's record type must add each such field to that list in the same change that adds it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { filesUnder } from "./files-under.ts";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));

/** The Apache-2.0 evidence contract and the CLI that ships it: the packages that may not reach the speech layer or the emulator. */
const BOUNDED_PACKAGES = ["packages/evidence", "packages/cli"];

/**
 * `nvda-speech` is the speech layer, and the emulator's package name is not chosen yet, so any segment containing `emulator`
 * is refused too. Matched per path segment, so `@a11ign/nvda-speech/src/x.ts` and `../../nvda-speech/src/x.ts` are both caught.
 */
const FORBIDDEN_SEGMENT = /^nvda-speech$|emulator/;

/** Import, export-from, side-effect import, dynamic import and require, each with its quoted specifier. */
const IMPORT_SPECIFIER = /(?:\bfrom\s+|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([^"'\n]+)["']/g;

/** The keys of a manifest that declare a dependency of any kind. */
const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

/**
 * The evidence fields that hold what a screen reader OBSERVED. `transcript` is the announcement log of `CaptureResult`
 * (`packages/evidence/src/index.ts`); the last test below proves each name is still declared there.
 */
const EVIDENCE_TEXT_FIELDS = ["transcript"];

/**
 * The prediction-record fields that hold PREDICTED text. The emulator's record type adds its predicted-text fields here
 * when it adds them; a field not named here is not read by `predictedTextInEvidence`.
 */
const PREDICTION_TEXT_FIELDS = ["predictedAnnouncements"];

export interface PredictedTextFinding {
  field: string;
  predicted: string;
  observed: string;
}

function reachesSpeechLayer(specifier: string): boolean {
  return specifier.split("/").some((segment) => FORBIDDEN_SEGMENT.test(segment));
}

function sourceFindings(path: string, source: string): string[] {
  return [...source.matchAll(IMPORT_SPECIFIER)]
    .map((match) => match[1])
    .filter(reachesSpeechLayer)
    .map((specifier) => `${path} imports ${specifier}`);
}

function manifestFindings(path: string, manifest: string): string[] {
  const parsed = JSON.parse(manifest) as Record<string, Record<string, string> | undefined>;
  return DEPENDENCY_FIELDS.flatMap((field) =>
    Object.keys(parsed[field] ?? {})
      .filter(reachesSpeechLayer)
      .map((name) => `${path} declares ${name} in ${field}`),
  );
}

/** Every reach into the speech layer or the emulator, across a map of repo-relative path to file text. */
export function boundaryFindings(files: ReadonlyMap<string, string>): string[] {
  return [...files].flatMap(([path, text]) =>
    path.endsWith("package.json") ? manifestFindings(path, text) : sourceFindings(path, text),
  );
}

function stringsIn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * Every evidence string that equals or contains a predicted one. An empty predicted string is skipped: every string contains
 * it, so it would refuse every record and tell nobody anything.
 */
export function predictedTextInEvidence(
  capture: Record<string, unknown>,
  prediction: Record<string, unknown>,
): PredictedTextFinding[] {
  const predicted = PREDICTION_TEXT_FIELDS.flatMap((field) => stringsIn(prediction[field])).filter((text) => text !== "");
  return EVIDENCE_TEXT_FIELDS.flatMap((field) =>
    stringsIn(capture[field]).flatMap((observed) =>
      predicted.filter((text) => observed.includes(text)).map((text) => ({ field, predicted: text, observed })),
    ),
  );
}

/** Every file the check reads in the bounded packages: their source and their manifests, not their build output. */
function boundedFiles(): Map<string, string> {
  const files = new Map<string, string>();
  for (const pkg of BOUNDED_PACKAGES) {
    const found = filesUnder(join(REPO, pkg), {
      skipDirectory: (name) => name === "node_modules" || name === "dist",
      keepFile: (name) => name === "package.json" || /\.m?[jt]s$/.test(name),
    });
    for (const full of found) files.set(full.slice(REPO.length), readFileSync(full, "utf8"));
  }
  return files;
}

/** Measured on 2026-10-16: 154 source files and manifests across the two packages. A floor far below that fails a moved layout here. */
const BOUNDED_FILE_FLOOR = 20;

test("the bounded packages are read, so the boundary check cannot pass having read nothing", () => {
  const files = boundedFiles();
  assert.ok(files.size >= BOUNDED_FILE_FLOOR, `only ${files.size} files read in ${BOUNDED_PACKAGES.join(" and ")}; the layout moved`);
  assert.ok(files.has("packages/evidence/src/index.ts"), "the evidence contract is read");
  assert.ok(files.has("packages/cli/package.json"), "the CLI manifest is read");
});

test("nothing in the evidence package or the CLI reaches the speech layer or the emulator", () => {
  // Its positive control is the fixture test below, which proves this scan refuses a reach when there is one.
  assert.deepEqual(boundaryFindings(boundedFiles()), []);
});

test("a source file or manifest that reaches the speech layer is refused, however it reaches it", () => {
  const reaches = [
    'import { x } from "@a11ign/nvda-speech";',
    'import "../../nvda-speech/src/own.ts";',
    'export { y } from "@a11ign/nvda-speech/src/own.ts";',
    'const z = await import("@a11ign/some-emulator");',
    'const w = require("nvda-speech");',
  ];
  for (const source of reaches) {
    assert.equal(boundaryFindings(new Map([["packages/evidence/src/x.ts", source]])).length, 1, source);
  }
  const manifest = JSON.stringify({ devDependencies: { "@a11ign/nvda-speech": "^1.0.0" } });
  assert.equal(boundaryFindings(new Map([["packages/cli/package.json", manifest]])).length, 1, "a declared dependency");
});

test("a source file with no reach into the speech layer is not refused", () => {
  const clean = new Map([
    ["packages/evidence/src/x.ts", 'import { verify } from "./verify.ts";\nexport const SPEECH_NOTE = "nvda-speech is named in a string, not imported";'],
    ["packages/cli/package.json", JSON.stringify({ dependencies: { "@a11ign/evidence": "0.2.0" } })],
  ]);
  assert.deepEqual(boundaryFindings(clean), []);
});

test("a predicted string copied into the transcript is a finding", () => {
  const prediction = { predictedAnnouncements: ["Submit button, clickable"] };
  const capture = { transcript: ["Name, edit", "Submit button, clickable"] };
  assert.deepEqual(predictedTextInEvidence(capture, prediction), [
    { field: "transcript", predicted: "Submit button, clickable", observed: "Submit button, clickable" },
  ]);
});

test("a predicted string contained in an observed announcement is a finding", () => {
  const capture = { transcript: ["Submit button, clickable, not pressed"] };
  const found = predictedTextInEvidence(capture, { predictedAnnouncements: ["Submit button"] });
  assert.equal(found.length, 1);
  assert.equal(found[0].observed, "Submit button, clickable, not pressed");
});

test("a predicted string kept apart from the transcript is not a finding", () => {
  const capture = { transcript: ["Name, edit", "Heading level 2, Results"] };
  assert.deepEqual(predictedTextInEvidence(capture, { predictedAnnouncements: ["Submit button, clickable"] }), []);
});

test("an empty predicted string is not a finding, since every string contains it", () => {
  const capture = { transcript: ["Name, edit"] };
  assert.deepEqual(predictedTextInEvidence(capture, { predictedAnnouncements: [""] }), []);
});

test("the evidence fields the check reads are still declared by the evidence contract", () => {
  const contract = readFileSync(join(REPO, "packages/evidence/src/index.ts"), "utf8");
  for (const field of EVIDENCE_TEXT_FIELDS) {
    assert.match(contract, new RegExp(`^\\s+${field}: string\\[\\];`, "m"), `${field} is no longer declared`);
  }
});
