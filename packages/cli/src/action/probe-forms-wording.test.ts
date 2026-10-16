// #5656 (v3 adopter readiness, #4084 A.3): `probe-forms` submits forms and presses buttons, so every place the option is
// documented must say, in the same words, that it is for a seeded test organisation or account. This reads those places as
// text and fails when one of them lacks the sentence. EVERY CHECK IS A FUNCTION OF THE FILES' TEXT, so each control hands it
// a copy with the sentence taken out of ONE file: the check must then name that place and no other.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

const ROOT = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "../../../..");
const read = (relative: string): string => readFileSync(resolve(ROOT, relative), "utf8");

const SENTENCE = "Use only against a seeded test organisation or account.";

const FILES = {
  action: "action.yml",
  guide: "docs/github-action.md",
  cli: "packages/cli/src/cli.ts",
} as const;
type Key = keyof typeof FILES;
type Texts = Record<Key, string>;

/** The first paragraph of the `probe-forms` input's description: the part a reader of the Action's inputs sees first. */
function actionPlace(actionText: string): string {
  const input = (parse(actionText) as { inputs: Record<string, { description?: string }> }).inputs["probe-forms"];
  return (input.description ?? "").split("\n")[0];
}

/** The `probe-forms` row of the setting table in the Action guide: where a reader decides whether to turn it on. */
function guidePlace(guideText: string): string {
  return guideText.split("\n").find((line) => line.startsWith("| `probe-forms:")) ?? "";
}

/** The CLI's usage declaration, which `--help` prints and every usage error repeats. */
function cliPlace(cliText: string): string {
  const start = cliText.indexOf("const USAGE =");
  return start < 0 ? "" : cliText.slice(start, cliText.indexOf(";", start));
}

const PLACES: Record<Key, { name: string; within: (text: string) => string }> = {
  action: { name: "action.yml (the probe-forms input)", within: actionPlace },
  guide: { name: "docs/github-action.md (the probe-forms row)", within: guidePlace },
  cli: { name: "packages/cli/src/cli.ts (the USAGE that --help prints)", within: cliPlace },
};

const shippedTexts = (): Texts => ({ action: read(FILES.action), guide: read(FILES.guide), cli: read(FILES.cli) });

/** The names of the places whose text does not carry the sentence. */
function missingFrom(texts: Texts): string[] {
  return (Object.keys(PLACES) as Key[])
    .filter((key) => !PLACES[key].within(texts[key]).includes(SENTENCE))
    .map((key) => PLACES[key].name);
}

test("every place the probe-forms option is documented says it is for a seeded test organisation or account", () => {
  // An emptiness assertion: its positive control is the CONTROL tests below, which strip the sentence from each place in turn.
  assert.deepEqual(missingFrom(shippedTexts()), []);
});

for (const key of Object.keys(PLACES) as Key[]) {
  test(`CONTROL: the sentence taken out of ${PLACES[key].name} is reported as missing from that place and no other`, () => {
    const texts = shippedTexts();
    texts[key] = texts[key].replace(SENTENCE, "");
    assert.notEqual(texts[key], read(FILES[key]), "the mutation changed nothing, so it controls nothing");
    assert.deepEqual(missingFrom(texts), [PLACES[key].name]);
  });
}
