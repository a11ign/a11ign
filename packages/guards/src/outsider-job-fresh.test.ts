/**
 * THE COMMITTED OUTSIDER JOB IS WHAT README'S QUICKSTART FENCE GENERATES (#4035, found on #4031).
 *
 * `scripts/outsider/outsider-job.yml` is generated from README's fence. Nothing in CI ran `node scripts/outsider/generate.mjs --check`,
 * so #3299 moved the fence and left the file stale on `main` with no red check. The sibling `consumer-gate.yml` has its check in a
 * workflow; this one is a test, so the PR `ts` job runs it with no workflow edit.
 *
 * Positive control: the same call on a README whose fence lost its `summary-md` line must NOT be ok. An `ok` assertion alone passes
 * if `checkCommitted` stopped comparing anything.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const read = (path: string) => readFileSync(`${REPO}${path}`, "utf8");

const { checkCommitted } = await import(pathToFileURL(`${REPO}scripts/outsider/generate.mjs`).href);

const readme = read("README.md");
const committed = read("scripts/outsider/outsider-job.yml");

/** The fence line the control removes: the upload step's `summary-md` output, which the generator copies into the job. */
const SUMMARY_MD_LINE = /^.*steps\.a11ign\.outputs\.summary-md.*\n/m;

test("the committed outsider-job.yml matches what README's Quickstart fence generates", () => {
  const result = checkCommitted(readme, committed);
  assert.ok(result.ok, `outsider-job.yml is stale: run \`node scripts/outsider/generate.mjs\` and commit it.\n${result.ok ? "" : result.diff}`);
});

test("positive control: a README fence without its summary-md line is NOT ok", () => {
  assert.ok(SUMMARY_MD_LINE.test(readme), "README's fence no longer has the summary-md line this control removes: the control moved");
  const result = checkCommitted(readme.replace(SUMMARY_MD_LINE, ""), committed);
  assert.equal(result.ok, false);
});
