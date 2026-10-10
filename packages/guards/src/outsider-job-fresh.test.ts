/**
 * THE COMMITTED OUTSIDER JOB IS WHAT README'S QUICKSTART FENCE GENERATES (#4035, found on #4031).
 *
 * `scripts/outsider/outsider-job.yml` is generated from README's fence. Nothing in CI ran `node scripts/outsider/generate.ts --check`,
 * so #3299 moved the fence and left the file stale on `main` with no red check. The sibling `consumer-gate.yml` has its check in a
 * workflow; this one is a test, so the PR `ts` job runs it with no workflow edit.
 *
 * Positive control: the same call on a README whose fence lost its `summary-md` line must NOT be ok. An `ok` assertion alone passes
 * if `checkCommitted` stopped comparing anything.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const read = (path: string) => readFileSync(`${REPO}${path}`, "utf8");

const { checkCommitted } = await import("../../../scripts/outsider/generate.ts");

const readme = read("README.md");
const committed = read("scripts/outsider/outsider-job.yml");

/** The fence line the control removes: the upload step's `summary-md` output, which the generator copies into the job. */
const SUMMARY_MD_LINE = /^.*steps\.a11ign\.outputs\.summary-md.*\n/m;

test("the committed outsider-job.yml matches what README's Quickstart fence generates", () => {
  const result = checkCommitted(readme, committed);
  assert.ok(result.ok, `outsider-job.yml is stale: run \`node scripts/outsider/generate.ts\` and commit it.\n${result.ok ? "" : result.diff}`);
});

test("positive control: a README fence without its summary-md line is NOT ok", () => {
  assert.ok(SUMMARY_MD_LINE.test(readme), "README's fence no longer has the summary-md line this control removes: the control moved");
  const result = checkCommitted(readme.replace(SUMMARY_MD_LINE, ""), committed);
  assert.equal(result.ok, false);
});

const { generateOutsiderJob } = await import("../../../scripts/outsider/generate.ts");

const RELEASE_SHA = "d92e97384b11edb7bf1cdfcf150394af46a9a2f6";
const PIN_LINE = /^\s*- uses: a11ign\/a11ign@.*$/m;

test("--version replaces README's own comment on the pin line with `# v<version>`, and a regeneration of README at HEAD does not throw (#4041)", () => {
  assert.match(readme, /uses: a11ign\/a11ign@[0-9a-f]{40}\s+# /, "README's pin line no longer carries a comment: this test's premise moved");
  const pin = PIN_LINE.exec(generateOutsiderJob(readme, RELEASE_SHA, "0.4.0"))?.[0];
  assert.equal(pin?.trim(), `- uses: a11ign/a11ign@${RELEASE_SHA} # v0.4.0`);
});

test("positive control: trailing text that is not a comment is still refused, and no --version writes no comment", () => {
  const notAComment = readme.replace(/(uses: a11ign\/a11ign@[0-9a-f]{40})\s+#[^\n]*/, "$1 extra");
  assert.notEqual(notAComment, readme, "the control did not change README");
  assert.throws(() => generateOutsiderJob(notAComment, RELEASE_SHA, "0.4.0"), /not a comment/);
  assert.doesNotMatch(generateOutsiderJob(readme, RELEASE_SHA, undefined), /# v0\.4\.0/);
});

test("the generated job carries exactly one full-sha `uses: a11ign/a11ign@` text: the substitution record does not quote README's pin (#4041)", () => {
  const generated: string = generateOutsiderJob(readme, RELEASE_SHA, "0.4.0");
  const pins = generated.match(/uses: a11ign\/a11ign@[0-9a-f]{40}/g) ?? [];
  assert.deepEqual(pins, [`uses: a11ign/a11ign@${RELEASE_SHA}`]);
  assert.ok(/README\.md line \d+: `- uses: a11ign\/a11ign@<the release's full commit sha/.test(generated), "the record line this test guards is gone: the control moved");
});
