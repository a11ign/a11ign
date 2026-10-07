/**
 * #3950 (outcome 3 of #3911, "a fix that merges to `main` reaches the registry in a STATED time"): `packages/cli/README.md` is the
 * page npm shows for `a11ign`, and its `## Which version you get` section says which version `npx a11ign` runs and how long a
 * merged fix takes to reach it.
 *
 * The section may state only what a reading backs. Four claims, each with a fixture positive control beside it:
 *
 *   1. The section exists, spells the `next` channel (`a11ign@next`) and the command that reads both tags (`dist-tags`).
 *   2. Every `Measured YYYY-MM-DD:` line carries a date and figures that a reading in READINGS gives, and the section cites
 *      that reading's URL, so a reader can open where the number came from.
 *   3. A quantity no reading covers is stated as "not yet measured", never as a figure.
 *   4. No sentence promises a time ("under 30 minutes"): the design's targets are targets, and a README that quotes one as
 *      a promise is a claim nobody measured.
 *
 * READINGS is the claimant's list of readings posted on #3778 (its Done-when 1 and 2): moving a figure in the README means
 * adding the reading that backs it here, with the comment that posted it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const README = fileURLToPath(new URL("../../cli/README.md", import.meta.url));
const SECTION = /^## Which version you get[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m;
/** From "Measured <date>" to the end of its bullet or paragraph: README text wraps, and a figure on the second line is still the claim. */
const MEASURED_LINE = /Measured (\d{4}-\d{2}-\d{2})[\s\S]*?(?=\n\s*\n|\n- |(?![\s\S]))/g;
const FIGURE = /\d+(?:\.\d+)?\s*(?:minutes?|hours?|days?)/g;
const PROMISE = /\b(?:under|within|less than|at most)\s+\d+(?:\.\d+)?\s*(?:minutes?|hours?|days?)/i;

interface Reading {
  date: string;
  /** The comment on #3778 that posted the reading, with the commands it was taken from. */
  source: string;
  quantity: "merge-to-next" | "next-to-latest";
  figures: string[];
}

const READINGS: Reading[] = [
  {
    date: "2026-10-07",
    source: "https://github.com/a11ign/a11ign/issues/3778#issuecomment-6043356294",
    quantity: "merge-to-next",
    figures: ["40 minutes"],
  },
];
/** What names each quantity in the README, so "not yet measured" is checked on the block that talks about THAT quantity. */
const QUANTITY_LABEL: Record<Reading["quantity"], RegExp> = {
  "merge-to-next": /merge to `(?:main|next)`/i,
  "next-to-latest": /`next` to `latest`/i,
};
const BLOCK_BOUNDARY = /\n(?=- )|\n\s*\n/;

function sectionOf(text: string): string | undefined {
  return SECTION.exec(text)?.[1];
}

function measuredLines(section: string): { line: string; date: string }[] {
  return [...section.matchAll(MEASURED_LINE)].map((m) => ({ line: m[0], date: m[1] ?? "" }));
}

function figuresBacked(line: string, date: string): string[] {
  const reading = READINGS.filter((r) => r.date === date);
  if (reading.length === 0) return [`"Measured ${date}" has no reading in READINGS`];
  const allowed = new Set(reading.flatMap((r) => r.figures));
  return (line.match(FIGURE) ?? [])
    .map((f) => f.replace(/\s+/g, " "))
    .filter((f) => !allowed.has(f))
    .map((f) => `"${f}" in a Measured ${date} line is not a figure of any reading dated ${date}`);
}

/**
 * A quantity no reading covers must be written "not yet measured" in the block that names it, with no figure beside it. A phrase
 * elsewhere in the section does not count: the reviewer of #4007 showed a README stating "24 hours" for `next` to `latest`
 * passing on an unrelated "not yet measured".
 */
function unmeasuredRefusals(section: string): string[] {
  const blocks = section.split(BLOCK_BOUNDARY);
  const out: string[] = [];
  for (const q of Object.keys(QUANTITY_LABEL) as Reading["quantity"][]) {
    if (READINGS.some((r) => r.quantity === q)) continue;
    const naming = blocks.filter((b) => QUANTITY_LABEL[q].test(b));
    if (naming.length === 0) out.push(`${q} has no reading and no block of the section names it as "not yet measured"`);
    for (const b of naming) {
      if (!/not yet measured/i.test(b)) out.push(`${q} has no reading but its block does not say "not yet measured"`);
      if (b.match(FIGURE)) out.push(`${q} has no reading but its block states a figure`);
    }
  }
  return out;
}

/** Every reason the section may not stand, each naming what is wrong; empty means it states only what a reading backs. */
function refusals(section: string): string[] {
  const out: string[] = [];
  if (!/a11ign@next/.test(section)) out.push("the section does not spell `a11ign@next`");
  if (!/dist-tags/.test(section)) out.push("the section does not name `dist-tags`");
  const lines = measuredLines(section);
  if (lines.length === 0) out.push("the section has no `Measured YYYY-MM-DD` line");
  for (const { line, date } of lines) out.push(...figuresBacked(line, date));
  for (const r of READINGS) {
    if (lines.some((l) => l.date === r.date) && !section.includes(r.source)) {
      out.push(`the section does not cite the reading it states (${r.source})`);
    }
  }
  out.push(...unmeasuredRefusals(section));
  if (PROMISE.test(section)) out.push("the section promises a time (under/within N minutes or hours)");
  return out;
}

const GOOD = [
  "- Run `npx a11ign` for `latest`, `npx a11ign@next` for the newest; `npm view a11ign dist-tags` reads both.",
  `- Measured 2026-10-07: merge to \`next\` took 40 minutes (${READINGS[0]?.source}).`,
  "- `next` to `latest`: not yet measured.",
].join("\n");

test("the real README carries the section, and it states only what a reading backs", () => {
  const section = sectionOf(readFileSync(README, "utf8"));
  assert.ok(section, "packages/cli/README.md has no `## Which version you get` section");
  assert.deepEqual(refusals(section), []);
});

test("positive control: the fixture that states only what the readings back is accepted", () => {
  assert.deepEqual(refusals(GOOD), []);
});

test("positive control: the section extractor finds the section and stops at the next heading", () => {
  assert.equal(sectionOf("## A\nx\n## Which version you get\nbody\n## Next\ny\n"), "body\n");
  assert.equal(sectionOf("## A\nx\n"), undefined);
});

test("a target stated as if it were measured is REFUSED", () => {
  const stated = GOOD.replace("took 40 minutes", "took under 30 minutes").replace("not yet measured", "24 hours");
  const out = refusals(stated.replace("- `next` to", "- Measured 2026-10-07: `next` to"));
  assert.ok(out.some((r) => /"24 hours".*not a figure/.test(r)), out.join("\n"));
  assert.ok(out.some((r) => /promises a time/.test(r)), out.join("\n"));
});

test("a figure on the wrapped continuation of a Measured line is still REFUSED", () => {
  const wrapped = GOOD.replace("took 40 minutes", "took 40 minutes,\n  and `latest` followed in 3 hours");
  assert.ok(refusals(wrapped).some((r) => /"3 hours".*not a figure/.test(r)), refusals(wrapped).join("\n"));
});

test("a figure no reading gives is REFUSED even on a dated line", () => {
  assert.ok(refusals(GOOD.replace("40 minutes", "12 minutes")).some((r) => /"12 minutes".*not a figure/.test(r)));
});

test("a Measured line dated otherwise than any reading is REFUSED", () => {
  assert.ok(refusals(GOOD.replace("Measured 2026-10-07", "Measured 2026-10-08")).some((r) => /no reading in READINGS/.test(r)));
});

test("a section that does not cite its reading is REFUSED", () => {
  const uncited = GOOD.replace(` (${READINGS[0]?.source})`, "");
  assert.ok(refusals(uncited).some((r) => /does not cite the reading/.test(r)));
});

test("a figure for an unmeasured quantity is REFUSED even when 'not yet measured' appears elsewhere (#4007 review)", () => {
  const out = refusals(GOOD.replace("`next` to `latest`: not yet measured.", "`next` to `latest`: 24 hours.\n- Something else is not yet measured."));
  assert.ok(out.some((r) => /next-to-latest has no reading but its block does not say/.test(r)), out.join("\n"));
  assert.ok(out.some((r) => /next-to-latest has no reading but its block states a figure/.test(r)), out.join("\n"));
});

test("an unmeasured quantity not marked 'not yet measured' is REFUSED", () => {
  assert.ok(refusals(GOOD.replace("not yet measured", "soon")).some((r) => /next-to-latest has no reading/.test(r)));
});

test("a section without the next spelling, the dist-tags command or a Measured line is REFUSED", () => {
  const out = refusals("Run npx a11ign. Not yet measured.");
  for (const part of ["a11ign@next", "dist-tags", "Measured"]) assert.ok(out.some((r) => r.includes(part)), `${part}: ${out.join("\n")}`);
});
