/**
 * THE RE-PIN WRITER'S PULL REQUEST IS NOT RED BY CONSTRUCTION (#5291, found on #5283).
 *
 * `docs-pin-write.yml` moves README's pin, and two files are GENERATED from README's Quickstart fence: `scripts/outsider/outsider-job.yml` and
 * `.github/workflows/consumer-gate.yml`. A re-pin alone left `outsider-job-fresh.test.ts` and `generate-consumer-gate.test.ts` red on every
 * release until a person regenerated both by hand (#4918, #5119, #5283), and #5283's reviewer found the prose under the pin still naming the
 * previous release. These cases pin each half: the premise (a re-pin ALONE is red), the planner's own rewrite (the previous release is gone from
 * README's Quickstart section and a dated mention elsewhere is not touched), the regenerated files being fresh, the writer's shape check
 * accepting every line that changed, and the workflow wiring.
 *
 * Positive controls sit beside each emptiness claim: the Quickstart section is asserted to have contained the previous release BEFORE the re-pin.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { planRepin } from "./docs-release-pin-currency.ts";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const read = (path: string) => readFileSync(`${REPO}${path}`, "utf8");

const outsider = await import("../../../scripts/outsider/generate.ts");
const gate = await import("../../../scripts/generate-consumer-gate.ts");

const readme = read("README.md");
const committedOutsider = read("scripts/outsider/outsider-job.yml");
const committedGate = read(".github/workflows/consumer-gate.yml");

const README_PIN = /uses: a11ign\/a11ign@([0-9a-f]{40})\s+# the commit of the release tagged a11ign@(\d+)\.(\d+)\.(\d+)/;
const PROMOTED_SHA = "c".repeat(40);

/** README as the writer's planner rewrites it for a release one minor past the one it pins: the text, and both versions. */
function repinned(): { text: string; from: string; to: string; } {
  const pinned = README_PIN.exec(readme);
  assert.ok(pinned, "README's pin line no longer has the shape this test reads: the premise moved");
  const [, pinnedSha, major, minor, patch] = pinned;
  const from = `${major}.${minor}.${patch}`;
  const to = `${major}.${Number(minor) + 1}.0`;
  const plan = planRepin({
    tags: () => [{ name: `a11ign@${from}`, commit: pinnedSha }, { name: `a11ign@${to}`, commit: PROMOTED_SHA }],
    v0Commit: () => PROMOTED_SHA,
    docs: () => [{ path: "README.md", text: readme }],
  });
  assert.equal(plan.status, "rewrite", `the planner did not rewrite README: ${plan.faults.join("; ")}`);
  return { text: plan.files[0].text, from, to };
}

const quickstart = (text: string) => text.slice(text.indexOf("\n## Quickstart"), text.indexOf("\n## Using it"));

test("README's Quickstart section names the pinned release before a re-pin, and does not after one (the prose #5283's reviewer caught)", () => {
  const { text, from, to } = repinned();
  assert.ok(quickstart(readme).includes(from), "the Quickstart section no longer names the pinned release: the control moved");
  assert.ok(quickstart(readme).includes(`commit of release ${from}`) && quickstart(readme).includes(`\`a11ign@${from}\` is the tag the pin above names`),
    "the two restating sentences moved: the planner's templates and this test are out of date");
  assert.equal(quickstart(text).includes(from), false, `the Quickstart section still names ${from}`);
  assert.ok(quickstart(text).includes(`commit of release ${to}`) && quickstart(text).includes(`\`a11ign@${to}\` is the tag the pin above names`));
});

test("the prose rewrite is the movable templates only: a dated mention of the previous release is left as written", () => {
  const { from, to } = repinned();
  const dated = `      - uses: a11ign/a11ign@${"1".repeat(40)}   # the commit of the release tagged a11ign@${from}\n`
    + `        # Pinned to the full 40-character commit of release ${from} (\`latest\` read ${from} on 2026-10-11), so your CI`;
  const plan = planRepin({
    tags: () => [{ name: `a11ign@${from}`, commit: "1".repeat(40) }, { name: `a11ign@${to}`, commit: PROMOTED_SHA }],
    v0Commit: () => PROMOTED_SHA,
    docs: () => [{ path: "docs/guide.md", text: `${dated}\nIt read \`latest\` ${from} on 2026-10-11, and the ${from} source accepts it.\n` }],
  });
  const text = plan.files[0].text;
  assert.match(text, new RegExp(`a11ign@${PROMOTED_SHA}   # the commit of the release tagged a11ign@${to.replaceAll(".", "\\.")}`), "the pin line moved");
  assert.ok(text.includes(`commit of release ${from} (\`latest\` read ${from} on 2026-10-11)`), "a sentence that cites the previous release as evidence was rewritten, and is now false");
  assert.ok(text.includes(`the ${from} source accepts it`), "a behavioural claim about the previous release was rewritten");
});

test("a re-pin of README alone leaves both generated files stale: the failures #5283 was red on", () => {
  const { text } = repinned();
  assert.notEqual(text, readme, "the re-pin did not change README: the control has nothing to say");
  assert.equal(outsider.checkCommitted(text, committedOutsider).ok, false);
  assert.equal(gate.consumerGateIsStale(committedGate, gate.generate(text, gate.extractPinnedSha(committedGate))), true);
});

test("the generators as the workflow runs them make both files fresh for the re-pinned README", () => {
  const { text, to } = repinned();
  const regeneratedOutsider: string = outsider.generateOutsiderJob(text, PROMOTED_SHA, to);
  assert.ok(outsider.checkCommitted(text, regeneratedOutsider).ok);
  const regeneratedGate: string = gate.generate(text, gate.extractPinnedSha(committedGate));
  assert.equal(gate.consumerGateIsStale(regeneratedGate, gate.generate(text, "d".repeat(40))), false);
  assert.equal(gate.extractPinnedSha(regeneratedGate), gate.extractPinnedSha(committedGate), "the consumer gate's committed pin is kept");
});

/** What the `write` job's loop accepts of a changed line: an action pin naming the commit, or a line naming the promoted version. */
function refusedLines({ before, after, to }: { before: string; after: string; to: string; }): string[] {
  const was = before.split("\n");
  const now = after.split("\n");
  assert.equal(now.length, was.length, "the line count moved: the write job refuses a file that changed its number of lines");
  const mask = (line: string) => line.replace(/[0-9a-f]{40}/g, "SHA").replace(/\d+\.\d+\.\d+/g, "VER");
  const added = now.filter((line, at) => line !== was[at]);
  const removed = was.filter((line, at) => line !== now[at]);
  assert.ok(added.length > 0, "nothing changed, so the check is vacuous");
  assert.deepEqual(added.map(mask), removed.map(mask), "a line changed in more than its shas and versions");
  return added.filter((line) => !(new RegExp(`uses:\\s*a11ign/a11ign@${PROMOTED_SHA}\\b`).test(line)
    || line.includes(`a11ign@${to}`) || line.includes(`commit of release ${to}`)));
}

test("every line the regeneration changes in either file is one the writer's shape check accepts", () => {
  const { text, to } = repinned();
  const outsiderAfter: string = outsider.generateOutsiderJob(text, PROMOTED_SHA, to);
  assert.deepEqual(refusedLines({ before: committedOutsider, after: outsiderAfter, to }), []);
  const gateAfter: string = gate.generate(text, gate.extractPinnedSha(committedGate));
  assert.deepEqual(refusedLines({ before: committedGate, after: gateAfter, to }), []);
});

/** The comment-free body of one job of `docs-pin-write.yml`, read as text the way `consumer-gate-pin-needed.test.ts` reads its workflow. */
function jobBody(job: string): string {
  const lines = read(".github/workflows/docs-pin-write.yml").split("\n");
  const start = lines.indexOf(`  ${job}:`);
  assert.ok(start >= 0, `docs-pin-write.yml has no job \`${job}\``);
  const end = lines.findIndex((line, at) => at > start && /^ {2}[a-z-]+:$/.test(line));
  return lines.slice(start, end < 0 ? undefined : end).filter((line) => !/^\s*#/.test(line)).join("\n");
}

test("docs-pin-write.yml regenerates both files in a job that cannot mint, and the job that mints writes exactly them", () => {
  const regenerate = jobBody("regenerate");
  assert.match(regenerate, /node scripts\/outsider\/generate\.ts --sha="\$COMMIT" --version="\$VERSION"/);
  assert.match(regenerate, /gate\.generate\(readFileSync\(gate\.README_PATH, "utf8"\), gate\.extractPinnedSha\(committed\)\)/, "the consumer gate is regenerated with its committed pin kept");
  assert.match(regenerate, /^\s*node "\$script"$/m, "the script that regenerates the consumer gate is run");
  assert.doesNotMatch(regenerate, /id-token/, "the job that runs repository code must not hold the token request");
  const write = jobBody("write");
  assert.match(write, /guarded='[^']*scripts\/outsider\/outsider-job\\\.yml[^']*\\\.github\/workflows\/consumer-gate\\\.yml/);
  assert.match(write, /needs: \[decide, regenerate\]/);
  assert.match(write, /\*"commit of release \$VERSION"\*/, "the loop must accept the one restating sentence a re-pin changes");
  assert.doesNotMatch(write, /actions\/checkout|pnpm install/, "the job that mints runs no repository code");
});

test("the policy that mints for docs-pin-write.yml holds `workflows`, because the re-pin writes a file under .github/workflows/", () => {
  const policy = read(".github/chainguard/docs-pin-write.sts.yaml").split("\n").filter((line) => !/^\s*#/.test(line)).join("\n");
  assert.match(policy, /^permissions:\n {2}contents: write\n {2}pull_requests: write\n {2}workflows: write$/m);
  assert.match(policy, /job_workflow_ref: a11ign\/a11ign\/\\\.github\/workflows\/docs-pin-write\\\.yml@refs\/heads\/main/);
});
