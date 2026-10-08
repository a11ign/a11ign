// #4245 (#4084 outcome 8): the licence FAQ QUOTES the AGPL and does not paraphrase it.
//
// An evaluator asked whether an unmodified AGPL tool may run in CI against their own app, and the README's Licence section did not
// answer. `docs/licence-faq.md` does, and every block quote headed `LICENSE §n` in it is a claim that the words are the licence's own.
// This test makes that claim checkable: each such quotation must be a substring of `LICENSE` (whitespace-normalised, since the
// licence is hard-wrapped). Nothing here judges what the licence MEANS; the FAQ opens by saying it is not legal advice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "../../../..");
const read = (path: string): string => readFileSync(resolve(ROOT, path), "utf8");

const NOT_LEGAL_ADVICE = "This is a description of the licence text, not legal advice; ask your own counsel for your case.";
const LICENCE_QUOTE_LABEL = /^\*\*LICENSE §\d+:\*\*\s*/;

const squash = (text: string): string => text.replace(/\s+/g, " ").trim();

/** Every block quote in `markdown`, its lines joined into one string (a `>` line break is a space). */
function blockquotesOf(markdown: string): string[] {
  const quotes: string[] = [];
  let current: string[] = [];
  for (const line of [...markdown.split("\n"), ""]) {
    if (line.startsWith(">")) current.push(line.replace(/^>\s?/, ""));
    else if (current.length > 0) {
      quotes.push(current.join(" "));
      current = [];
    }
  }
  return quotes;
}

/** The licence quotations: block quotes headed `**LICENSE §n:**`, with the heading removed. */
function licenceQuotationsOf(markdown: string): string[] {
  return blockquotesOf(markdown)
    .filter((quote) => LICENCE_QUOTE_LABEL.test(quote))
    .map((quote) => squash(quote.replace(LICENCE_QUOTE_LABEL, "")));
}

/** The commercial-licence sentence of the README's Licence section. */
function commercialSentenceOf(readme: string): string | undefined {
  const licenceSection = readme.slice(readme.indexOf("\n## Licence\n"));
  return /If the AGPL does not fit[^\n]*?conversation\./.exec(licenceSection)?.[0];
}

/** The text of the first `## ` heading in the FAQ. */
function firstAnswerHeadingOf(markdown: string): string | undefined {
  return /^## (.+)$/m.exec(markdown)?.[1];
}

/** Quotations in `faq` that are not word for word in `licence`. */
function paraphrasedQuotations(faq: string, licence: string): string[] {
  const haystack = squash(licence);
  return licenceQuotationsOf(faq).filter((quotation) => !haystack.includes(quotation));
}

const faq = read("docs/licence-faq.md");
const licence = read("LICENSE");
const readme = read("README.md");

test("the FAQ quotes the licence in at least five places (the positive control for the emptiness below)", () => {
  assert.ok(licenceQuotationsOf(faq).length >= 5, `found ${licenceQuotationsOf(faq).length} licence quotations`);
});

test("every quotation headed LICENSE §n is a substring of LICENSE", () => {
  assert.deepEqual(paraphrasedQuotations(faq, licence), []);
});

test("a paraphrase presented as a quotation is caught", () => {
  const paraphrase = "> **LICENSE §2:** You are always free to run the original Program.\n";
  assert.deepEqual(paraphrasedQuotations(paraphrase, licence), ["You are always free to run the original Program."]);
  const altered = faq.replace("unlimited permission to run", "unrestricted permission to run");
  assert.notEqual(altered, faq);
  assert.equal(paraphrasedQuotations(altered, licence).length, 1);
});

test("the FAQ says it is not legal advice", () => {
  assert.ok(faq.includes(NOT_LEGAL_ADVICE));
});

test("the README's Licence section links to the FAQ", () => {
  const section = readme.slice(readme.indexOf("\n## Licence\n"));
  assert.ok(section.includes("](./docs/licence-faq.md)"), "README Licence section does not link docs/licence-faq.md");
});

test("the first answer's heading names 'unmodified' and 'CI'", () => {
  const heading = firstAnswerHeadingOf(faq) ?? "";
  assert.match(heading, /unmodified/);
  assert.match(heading, /\bCI\b/);
});

test("the FAQ's commercial-licence sentence equals the README's", () => {
  const sentence = commercialSentenceOf(readme);
  assert.ok(sentence, "README Licence section no longer has the commercial-licence sentence");
  assert.ok(blockquotesOf(faq).includes(sentence), "the FAQ does not carry the README's commercial-licence sentence unchanged");
  const edited = faq.replace("a separate commercial licence is available", "a commercial licence may be available");
  assert.notEqual(edited, faq);
  assert.ok(!blockquotesOf(edited).includes(sentence));
});
