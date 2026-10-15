// #5557 (#4084 outcome 8): `SUPPORT.md` says where to ask, what is promised, who maintains the project and what is not offered, and
// promises nothing `SECURITY.md` does not.
//
// The file is a collection of statements the repository already makes, so a reader can take it as no new commitment. Four checks make
// that checkable: the one promise it quotes is SECURITY.md's own sentence, every relative link in it resolves, no response-time or
// guarantee wording appears outside that quotation, and the README points at it. Nothing here judges whether the statements are wise.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "../../../..");
const read = (path: string): string => readFileSync(resolve(ROOT, path), "utf8");

const SLA_SENTENCE =
  "There is no SLA. This is a small project with one maintainer, and saying so is more useful than promising a response time nobody is on call to meet.";
const RESPONSE_TIME_PROMISE = /\bwithin \d+ (hour|day|week|business)/i;
const GUARANTEE_WORDING = /\bguarantees?\b|\bSLA of\b/i;
const README_SUPPORT_LINK = "](./SUPPORT.md)";
const MIN_RELATIVE_LINKS = 4;

const squash = (text: string): string => text.replace(/\s+/g, " ").trim();

/** Every relative link target in `markdown`, anchor removed (absolute URLs and bare anchors are not checked here). */
function relativeLinksOf(markdown: string): string[] {
  return [...markdown.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((match) => match[1].split("#")[0])
    .filter((target) => target !== "" && !/^[a-z]+:/i.test(target));
}

/** Relative link targets in `markdown` that name no file in the checkout. */
function missingLinks(markdown: string): string[] {
  return relativeLinksOf(markdown).filter((target) => !existsSync(resolve(ROOT, target)));
}

/** Response-time or guarantee wording in `markdown`, once SECURITY.md's quoted sentence is taken out of it. */
function promisesOutsideQuotation(markdown: string): string[] {
  const unquoted = squash(markdown).split(squash(SLA_SENTENCE)).join(" ");
  return [...unquoted.matchAll(new RegExp(`${RESPONSE_TIME_PROMISE.source}|${GUARANTEE_WORDING.source}`, "gi"))].map(
    (match) => match[0],
  );
}

const support = read("SUPPORT.md");
const security = read("SECURITY.md");
const readme = read("README.md");

test("SUPPORT.md exists at the repository root", () => {
  assert.ok(existsSync(resolve(ROOT, "SUPPORT.md")));
});

test("the one promise SUPPORT.md quotes is SECURITY.md's own sentence, word for word", () => {
  assert.ok(squash(security).includes(squash(SLA_SENTENCE)), "SECURITY.md no longer carries the quoted sentence");
  assert.ok(squash(support).includes(squash(SLA_SENTENCE)), "SUPPORT.md does not quote the sentence");
});

test("a paraphrase of that sentence is not SECURITY.md's words (the control for the quotation above)", () => {
  const paraphrase = "There is no SLA. We reply to reports as soon as we can.";
  assert.equal(squash(security).includes(squash(paraphrase)), false);
  assert.ok(squash(security).includes(squash(SLA_SENTENCE)));
});

test("SUPPORT.md links to the files it names, and every relative link resolves in the checkout", () => {
  assert.ok(relativeLinksOf(support).length >= MIN_RELATIVE_LINKS, "too few relative links to make the check meaningful");
  assert.deepEqual(missingLinks(support), []);
});

test("a link to a file that does not exist is caught (the control for the link check)", () => {
  assert.deepEqual(missingLinks("See [the runbook](docs/no-such-runbook.md) and [licence](docs/licence-faq.md)."), [
    "docs/no-such-runbook.md",
  ]);
});

test("SUPPORT.md makes no response-time promise and no guarantee outside SECURITY.md's quotation", () => {
  assert.deepEqual(promisesOutsideQuotation(support), []);
});

test("a response-time promise and a guarantee are both caught (the control for the wording check)", () => {
  assert.deepEqual(promisesOutsideQuotation("We reply within 2 days."), ["within 2 day"]);
  assert.deepEqual(promisesOutsideQuotation("We guarantee a fix."), ["guarantee"]);
});

test("the README links to SUPPORT.md", () => {
  assert.ok(readme.includes(README_SUPPORT_LINK));
});

test("a README without the link is caught (the control for the README check)", () => {
  assert.equal(readme.replace(README_SUPPORT_LINK, "](./SECURITY.md)").includes(README_SUPPORT_LINK), false);
});
