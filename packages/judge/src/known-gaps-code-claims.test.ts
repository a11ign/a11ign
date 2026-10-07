/**
 * A known-gaps paragraph that says a file "still has `if (...)`" has to be right about that file.
 *
 * §42's `CORRECTED 2026-09-25 (#2551)` paragraph said `rules.ts` still had the `i === 0` exception; #2602
 * deleted it the next day and nobody swept the section, so a reader deciding whether F55 at index 0 is
 * special read the paragraph and was wrong (#3913). A correction is true at a date; this pins the one shape
 * of it a machine can check -- a named file "still has" a backticked `if (...)` -- against the file itself.
 *
 * The reading below covers whichever such claims the repository holds, and at the time of writing that is
 * none: the one that existed was rewritten in past tense as history. The positive control is therefore the
 * fixture, which goes through the same `staleCodeClaims` the real reading uses.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(import.meta.dirname, "..", "..", "..");

/** `path/to/file.ext` still has `if (...)` -- whitespace between the words may be a line break. */
const STILL_HAS_CLAIM = /`([\w./-]+\.\w+)`\s+still\s+has\s+`(if \([^`]+\))`/g;

interface CodeClaim {
  file: string;
  snippet: string;
}

interface Disagreement extends CodeClaim {
  reason: "snippet-absent" | "file-missing";
}

const squash = (text: string): string => text.replace(/\s+/g, " ");

function codeClaimsIn(markdown: string): CodeClaim[] {
  return [...markdown.matchAll(STILL_HAS_CLAIM)].map((m) => ({ file: m[1], snippet: m[2] }));
}

/** Claims whose named file does not hold the snippet; a file that cannot be read is its own reason, never "fine". */
function staleCodeClaims(markdown: string, readRepoFile: (path: string) => string | null): Disagreement[] {
  const stale: Disagreement[] = [];
  for (const claim of codeClaimsIn(markdown)) {
    const source = readRepoFile(claim.file);
    if (source === null) stale.push({ ...claim, reason: "file-missing" });
    else if (!squash(source).includes(squash(claim.snippet))) stale.push({ ...claim, reason: "snippet-absent" });
  }
  return stale;
}

const CLAIM_TEXT = "**CORRECTED (#x).** `packages/judge/src/rules.ts` still has\n`if (i === 0)` in `focusLossVerdict`.";

test("a claim that a file still has `if (...)` is reported when the file lacks it", () => {
  const withoutIt = () => "export function focusLossVerdict() { return null; }";
  assert.deepEqual(staleCodeClaims(CLAIM_TEXT, withoutIt), [
    { file: "packages/judge/src/rules.ts", snippet: "if (i === 0)", reason: "snippet-absent" },
  ]);
});

test("the same claim is not reported when the file has the snippet, however it is wrapped", () => {
  const withIt = () => "function f() {\n  if (i\n === 0) return 1;\n}";
  assert.deepEqual(staleCodeClaims(CLAIM_TEXT, withIt), []);
});

test("a claim over a file that cannot be read is reported, not passed", () => {
  assert.deepEqual(staleCodeClaims(CLAIM_TEXT, () => null), [
    { file: "packages/judge/src/rules.ts", snippet: "if (i === 0)", reason: "file-missing" },
  ]);
});

test("past tense is history, not a claim", () => {
  assert.deepEqual(codeClaimsIn("`rules.ts` still had `if (i === 0)` and `rules.ts` has no `if (i === 0)`."), []);
});

test("the real known-gaps agrees with the files it says still have an `if (...)`", () => {
  const knownGaps = readFileSync(join(REPO, "docs/known-gaps.md"), "utf8");
  const readRepoFile = (path: string) => (existsSync(join(REPO, path)) ? readFileSync(join(REPO, path), "utf8") : null);
  assert.deepEqual(staleCodeClaims(knownGaps, readRepoFile), []);
});

test("§42 no longer says the i === 0 exception is not deleted", () => {
  const knownGaps = readFileSync(join(REPO, "docs/known-gaps.md"), "utf8");
  assert.ok(!/THE EXCEPTION IS NOT DELETED/.test(knownGaps), "§42 still announces an exception rules.ts no longer has");
  assert.match(knownGaps, /THE EXCEPTION IS DELETED/);
});
