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

/*
 * THE RE-PIN WRITER REGENERATES THE FILE, SO ITS PULL REQUEST IS NOT RED BY CONSTRUCTION (#5291, found on #5283).
 *
 * `docs-pin-write.yml` moves README's pin, and README's Quickstart fence is what `outsider-job.yml` is generated from, so every re-pin
 * went red on the first test of this file until a person ran `node scripts/outsider/generate.ts --sha=<pin's commit> --version=<x.y.z>`
 * by hand (#4918, #5119, #5283). The workflow now runs that command in its `regenerate` job. These cases pin the three halves of it: that
 * the re-pin ALONE is red (the premise), that the generator at the pin's own sha and version is green, and that the file the generator
 * makes differs from the committed one only in lines the `write` job's shape check accepts.
 */
const { planRepin } = await import("./docs-release-pin-currency.ts");

const README_PIN = /uses: a11ign\/a11ign@([0-9a-f]{40})\s+# the commit of the release tagged a11ign@(\d+)\.(\d+)\.(\d+)/;
const PROMOTED_SHA = "c".repeat(40);

/** README as the writer's planner rewrites it for a release one minor past the one it pins, with the commit and version it moved to. */
function repinnedReadme(): { text: string; version: string; } {
  const pinned = README_PIN.exec(readme);
  assert.ok(pinned, "README's pin line no longer has the shape this test reads: the premise moved");
  const [, pinnedSha, major, minor, patch] = pinned;
  const version = `${major}.${Number(minor) + 1}.0`;
  const plan = planRepin({
    tags: () => [{ name: `a11ign@${major}.${minor}.${patch}`, commit: pinnedSha }, { name: `a11ign@${version}`, commit: PROMOTED_SHA }],
    v0Commit: () => PROMOTED_SHA,
    docs: () => [{ path: "README.md", text: readme }],
  });
  assert.equal(plan.status, "rewrite", `the planner did not rewrite README: ${plan.faults.join("; ")}`);
  return { text: plan.files[0].text, version };
}

test("a re-pin of README alone leaves outsider-job.yml stale: the failure #5283 was red on", () => {
  const { text } = repinnedReadme();
  assert.notEqual(text, readme, "the re-pin did not change README: the control has nothing to say");
  assert.equal(checkCommitted(text, committed).ok, false);
});

test("the generator at the pin's own sha and version makes the re-pinned README's outsider job fresh", () => {
  const { text, version } = repinnedReadme();
  const regenerated: string = generateOutsiderJob(text, PROMOTED_SHA, version);
  assert.ok(checkCommitted(text, regenerated).ok);
  assert.match(regenerated, new RegExp(`uses: a11ign/a11ign@${PROMOTED_SHA} # v${version.replaceAll(".", "\\.")}`));
});

test("the regenerated file differs from the committed one only in lines the writer's shape check accepts", () => {
  const { text, version } = repinnedReadme();
  const regenerated: string[] = generateOutsiderJob(text, PROMOTED_SHA, version).split("\n");
  const before = committed.split("\n");
  assert.equal(regenerated.length, before.length, "the line count moved: the write job refuses a file that changed its number of lines");
  const added = regenerated.filter((line, at) => line !== before[at]);
  assert.ok(added.length > 0, "nothing changed, so the check below is vacuous");
  const mask = (line: string) => line.replace(/[0-9a-f]{40}/g, "SHA").replace(/\d+\.\d+\.\d+/g, "VER");
  const removed = before.filter((line, at) => line !== regenerated[at]);
  assert.deepEqual(added.map(mask), removed.map(mask), "a line changed in more than its shas and versions");
  const pin = new RegExp(`uses:\\s*a11ign/a11ign@${PROMOTED_SHA}\\b`);
  for (const line of added) assert.ok(pin.test(line) || line.includes(`a11ign@${version}`), `the writer would refuse this changed line: ${line}`);
});

/** The comment-free body of one job of `docs-pin-write.yml`, read as text the way `consumer-gate-pin-needed.test.ts` reads its workflow. */
function jobBody(job: string): string {
  const lines = read(".github/workflows/docs-pin-write.yml").split("\n");
  const start = lines.indexOf(`  ${job}:`);
  assert.ok(start >= 0, `docs-pin-write.yml has no job \`${job}\``);
  const end = lines.findIndex((line, at) => at > start && /^ {2}[a-z-]+:$/.test(line));
  return lines.slice(start, end < 0 ? undefined : end).filter((line) => !/^\s*#/.test(line)).join("\n");
}

test("docs-pin-write.yml regenerates the outsider job at the pin's sha and version, in a job that cannot mint, and writes it", () => {
  const regenerate = jobBody("regenerate");
  assert.match(regenerate, /node scripts\/outsider\/generate\.ts --sha="\$COMMIT" --version="\$VERSION"/);
  assert.doesNotMatch(regenerate, /id-token/, "the job that runs repository code must not hold the token request");
  assert.match(jobBody("write"), /guarded='[^']*scripts\/outsider\/outsider-job\\\.yml/);
  assert.match(jobBody("write"), /needs: \[decide, regenerate\]/);
  assert.doesNotMatch(jobBody("write"), /actions\/checkout|pnpm install/, "the job that mints runs no repository code");
});
