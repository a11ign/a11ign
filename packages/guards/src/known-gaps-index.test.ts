/**
 * `scripts/known-gaps-index.ts`: the index of OPEN sections at the top of `docs/known-gaps.md`, DERIVED from the headings so it cannot be hand-maintained
 * into a second, drifting copy of which sections are closed.
 *
 * What is pinned:
 *   1. WHAT A SECTION IS. Only `## ` headings; a leading `N. ` makes it a numbered gap (`number`, `title`), anything else is META and never indexed.
 *   2. WHAT CLOSED MEANS: one of the seven uppercase words anywhere in the heading (case-sensitive, so prose saying "done" does not close a section).
 *   3. THE ANCHOR is GitHub-shaped (markup stripped, punctuation dropped, spaces to hyphens) and repeats are disambiguated `-1`, `-2` across ALL headings.
 *   4. THE BLOCK is exactly the generated header line plus one line per open section, between the two markers; applying it REPLACES an existing block in
 *      place, INSERTS one before the first heading otherwise, is IDEMPOTENT, and refuses a file with no heading to insert before.
 *   5. THE CLI says OK (exit 0) for a current index, STALE (exit 1, file untouched) for a stale one, and rewrites only with `--write`. It is exercised on a COPY
 *      in a temp directory, because `--write` rewrites the file; against THIS checkout it is run only WITHOUT `--write`.
 *
 * THE POSITIVE CONTROLS: every "not indexed" case sits beside an indexed sibling in the same document, and the CLI's STALE case is the same fixture the OK case
 * was made current from.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const TSX = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SCRIPT = join(REPO_ROOT, "scripts/known-gaps-index.ts");
const {
  KNOWN_GAPS_FILE, CLOSED_PATTERN, INDEX_START, INDEX_END,
  parseHeadings, isClosed, slugify, openSections, buildIndexBlock, currentIndexBlock, applyIndexBlock,
} = await import("../../../scripts/known-gaps-index.ts");

/** Marker, generated header, marker. */
const HEADER_ONLY_LINES = 3;
const THIRD = 3;
const DOC = [
  "# Known gaps",
  "",
  "intro",
  "",
  "## Ordering note",
  "",
  "## 1. Open one",
  "text",
  "## 2. Finished thing -- DONE 2026-09-01",
  "## 3. Open `three` with **bold**",
  "## 4. Wrong turn -- WRONG",
  "",
].join("\n");

test("the constants are the file, the seven closing words and the two markers", () => {
  assert.equal(KNOWN_GAPS_FILE, "docs/known-gaps.md");
  assert.equal(CLOSED_PATTERN.source, "DONE|CLOSED|STALE|MOVED|WRONG|RESOLVED|REFUTED");
  assert.equal(INDEX_START, "<!-- known-gaps-index:start -->");
  assert.equal(INDEX_END, "<!-- known-gaps-index:end -->");
});

test("parseHeadings reads only `## ` headings, with line numbers, numbers and titles; unnumbered ones are meta", () => {
  assert.deepEqual(parseHeadings(DOC).map(({ lineNumber, number, title }: { lineNumber: number, number: number | null, title: string }) => ({ lineNumber, number, title })), [
    { lineNumber: 5, number: null, title: "Ordering note" },
    { lineNumber: 7, number: 1, title: "Open one" },
    { lineNumber: 9, number: 2, title: "Finished thing -- DONE 2026-09-01" },
    { lineNumber: 10, number: 3, title: "Open `three` with **bold**" },
    { lineNumber: 11, number: 4, title: "Wrong turn -- WRONG" },
  ]);
  assert.deepEqual(parseHeadings("# Top\n### Deep\nno headings here"), []);
  assert.deepEqual(parseHeadings(""), []);
  assert.equal(parseHeadings("## 12.   spaced")[0].title, "spaced");
});

test("isClosed is true for each closing word and false for lowercase prose or none", () => {
  for (const word of ["DONE", "CLOSED", "STALE", "MOVED", "WRONG", "RESOLVED", "REFUTED"]) {
    assert.equal(isClosed({ raw: `7. Something -- ${word}` }), true, word);
  }
  assert.equal(isClosed({ raw: "7. Something that is done and closed" }), false);
  assert.equal(isClosed({ raw: "7. Something" }), false);
});

test("slugify strips markup, drops punctuation and joins words with single hyphens", () => {
  assert.equal(slugify("1. Three long jobs -- MOSTLY NOT A GAP, and it's fixed"), "1-three-long-jobs----mostly-not-a-gap-and-its-fixed");
  assert.equal(slugify("3. Open `three` with **bold** and ~~struck~~"), "3-open-three-with-bold-and-struck");
  assert.equal(slugify("4. See [the guide](./docs/x.md) now"), "4-see-the-guide-now");
  assert.equal(slugify("5. snake_case   and   spaces"), "5-snake_case-and-spaces");
  assert.equal(slugify("6. A — dash"), "6-a-dash", "an em dash is dropped, leaving two spaces that become one hyphen");
  assert.equal(slugify(""), "");
});

test("openSections keeps numbered, unclosed headings only, in document order, with anchors", () => {
  assert.deepEqual(openSections(DOC).map((h: { number: number, anchor: string }) => [h.number, h.anchor]), [[1, "1-open-one"], [THIRD, "3-open-three-with-bold"]]);
  assert.deepEqual(openSections("## 1. DONE\n## Meta\n"), []);
});

test("repeated headings are disambiguated -1, -2 in document order, counting meta headings too", () => {
  const text = "## Notes\n## 5. Same\n## 5. Same\n## 5. Same\n## notes\n";
  const anchors = openSections(text).map((h: { anchor: string }) => h.anchor);
  assert.deepEqual(anchors, ["5-same", "5-same-1", "5-same-2"]);
});

test("buildIndexBlock is the marker, the generated header, one line per open section, then the marker", () => {
  assert.equal(buildIndexBlock(DOC), [
    INDEX_START,
    "**Open sections** (generated by `scripts/known-gaps-index.ts` -- do not hand-edit; run `pnpm run docs:known-gaps-index --write` after any section's heading changes):",
    "- [§1](#1-open-one) Open one",
    "- [§3](#3-open-three-with-bold) Open three with bold",
    INDEX_END,
  ].join("\n"));
});

test("buildIndexBlock with nothing open is the header between the markers and no list", () => {
  const lines = buildIndexBlock("## 1. DONE\n").split("\n");
  assert.equal(lines.length, HEADER_ONLY_LINES);
  assert.deepEqual([lines[0], lines.at(-1)], [INDEX_START, INDEX_END]);
});

test("currentIndexBlock finds the block, and is null when either marker is missing", () => {
  const block = buildIndexBlock(DOC);
  assert.equal(currentIndexBlock(`before\n${block}\nafter`), block);
  assert.equal(currentIndexBlock(DOC), null);
  assert.equal(currentIndexBlock(`${INDEX_START}\nno end`), null);
  assert.equal(currentIndexBlock(`no start\n${INDEX_END}`), null);
});

test("applyIndexBlock inserts a fresh block before the first heading and keeps everything else", () => {
  const applied = applyIndexBlock(DOC);
  assert.equal(applied, DOC.replace("\n## Ordering note", `\n${buildIndexBlock(DOC)}\n\n## Ordering note`));
  assert.ok(applied.startsWith("# Known gaps\n\nintro\n"));
  assert.ok(applied.endsWith("## 4. Wrong turn -- WRONG\n"));
});

test("applyIndexBlock is idempotent, and replaces a STALE block in place rather than adding a second", () => {
  const once = applyIndexBlock(DOC);
  assert.equal(applyIndexBlock(once), once);
  const stale = once.replace("- [§1](#1-open-one) Open one", "- [§9](#nowhere) A section that closed");
  assert.notEqual(stale, once);
  const fixed = applyIndexBlock(stale);
  assert.equal(fixed, once);
  assert.equal(fixed.split(INDEX_START).length, 2, "one block, not two");
});

test("applyIndexBlock picks up a section closed since the block was made", () => {
  const once = applyIndexBlock(DOC);
  const closed = once.replace("## 1. Open one", "## 1. Open one -- RESOLVED");
  assert.match(once, /\[§1\]/);
  assert.doesNotMatch(applyIndexBlock(closed), /\[§1\]/);
  assert.match(applyIndexBlock(closed), /\[§3\]/);
});

test("applyIndexBlock refuses text with no `\\n## ` heading to insert before", () => {
  assert.throws(() => applyIndexBlock("just prose\n"), /known-gaps\.md has no '## ' heading to insert the index before/);
  assert.throws(() => applyIndexBlock("## starts the file\n"), /no '## ' heading/, "a heading on line 1 has no newline before it");
  assert.doesNotThrow(() => applyIndexBlock("intro\n## 1. A\n"));
});

test("OBSERVED LIMIT: a title containing `$$` loses one dollar when a block is replaced, because replace() reads the block as a template", () => {
  // `text.replace(existing, block)` interprets `$$` in the replacement. Pinned as observed so a fix (a replacer function) is a deliberate change.
  const doc = "intro\n## 1. Costs $$ a month\n";
  const once = applyIndexBlock(doc);
  assert.match(once, /- \[§1\]\(#1-costs-a-month\) Costs \$\$ a month/, "the fresh insert is right");
  assert.match(applyIndexBlock(once), /\) Costs \$ a month/);
});

interface Cli { dir: string, docPath: string, run: (args?: string[]) => ReturnType<typeof spawnSync> }

/** A temp repo holding a COPY of the script (its repo root is derived from its own location) with `node_modules` linked so its package import resolves. */
function withCopy(doc: string | null, body: (cli: Cli) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "known-gaps-index-test-"));
  try {
    mkdirSync(join(dir, "scripts"));
    mkdirSync(join(dir, "docs"));
    copyFileSync(SCRIPT, join(dir, "scripts/known-gaps-index.ts"));
    symlinkSync(join(REPO_ROOT, "node_modules"), join(dir, "node_modules"));
    const docPath = join(dir, KNOWN_GAPS_FILE);
    if (doc !== null) writeFileSync(docPath, doc);
    body({ dir, docPath, run: (args = []) => spawnSync(process.execPath, ["--import", TSX, join(dir, "scripts/known-gaps-index.ts"), ...args], { cwd: dir, encoding: "utf8" }) });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("CLI: a current index says OK and exits 0 without touching the file", () => {
  const current = applyIndexBlock(DOC);
  withCopy(current, (cli) => {
    const result = cli.run();
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "OK  docs/known-gaps.md's index is current.\n");
    assert.equal(readFileSync(cli.docPath, "utf8"), current);
  });
});

test("CLI: a stale or missing index says STALE and exits 1 and leaves the file as it was; --write fixes it, and then OK", () => {
  withCopy(DOC, (cli) => {
    const stale = cli.run();
    assert.equal(stale.status, 1);
    assert.match(String(stale.stderr), /^STALE {2}docs\/known-gaps\.md's index does not match its headings\. {1}Run: pnpm run docs:known-gaps-index --write\n$/);
    assert.equal(readFileSync(cli.docPath, "utf8"), DOC);

    const written = cli.run(["--write"]);
    assert.equal(written.status, 0);
    assert.equal(written.stdout, "WROTE  docs/known-gaps.md's index regenerated.\n");
    assert.equal(readFileSync(cli.docPath, "utf8"), applyIndexBlock(DOC));

    assert.equal(cli.run().status, 0);
    assert.match(String(cli.run(["--write"]).stdout), /^OK {2}/, "--write on a current file writes nothing and says OK");
  });
});

test("CLI: a missing known-gaps file exits 1 naming it, and an unknown flag exits 2", () => {
  withCopy(null, (cli) => {
    const missing = cli.run();
    assert.equal(missing.status, 1);
    assert.equal(missing.stderr, "docs/known-gaps.md does not exist\n");
    const bogus = cli.run(["--bogus"]);
    assert.equal(bogus.status, 2);
    assert.match(String(bogus.stderr), /unknown flag --bogus/);
  });
});

test("CLI against THIS checkout, read-only (never --write): its exit code agrees with whether the committed index is current", () => {
  const committed = readFileSync(join(REPO_ROOT, KNOWN_GAPS_FILE), "utf8");
  const result = spawnSync(process.execPath, ["--import", TSX, SCRIPT], { cwd: tmpdir(), encoding: "utf8" });
  assert.equal(result.status, applyIndexBlock(committed) === committed ? 0 : 1);
  assert.ok(openSections(committed).length > 0, "positive control: the real file has open sections");
});
