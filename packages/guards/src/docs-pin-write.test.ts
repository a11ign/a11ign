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
 *
 * #5468 added two halves. The writer DID run the consumer-gate generator and its `--check` passed, and the pull request still carried a stale
 * `consumer-gate.yml`: `actions/upload-artifact` leaves hidden files out by default, so `.github/workflows/consumer-gate.yml` never left the
 * `regenerate` job (run 38453561679 printed "there will be 1 file uploaded"). So the upload keeps hidden files, `write` refuses a delivery
 * short of what `regenerate` declared, and every generator that reads README's fence is derived from the scripts and asserted RUN.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
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

test("the prose rewrite is the two templates only: a dated mention of the previous release is left as written", () => {
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

/** Repo-relative paths of every non-test script under `scripts/`, with its text. */
function scriptTexts(): Record<string, string> {
  const found: Record<string, string> = {};
  for (const entry of readdirSync(`${REPO}scripts`, { recursive: true, encoding: "utf8" })) {
    if (!entry.endsWith(".ts") || entry.endsWith(".test.ts") || /(^|\/)(node_modules|fixtures)\//.test(entry)) continue;
    found[`scripts/${entry}`] = read(`scripts/${entry}`);
  }
  return found;
}

/**
 * The scripts that GENERATE a file from README's Quickstart fence: they read the ROOT README through `README_PATH` and write a file. Derived
 * from the text of the scripts, never listed here, so a third generator is found the day it is added. `scripts/doc-checks/roles-readme.ts`
 * also exports a `README_PATH`, of a different file and read through `resolve`, which is why the reading is matched and not the name.
 */
function fenceGenerators(scripts: Record<string, string>): string[] {
  const rootReadme = /README_PATH\s*=\s*`\$\{REPO\}README\.md`|README_PATH[^;]*?\}\s*from\s*"[^"]*generate-consumer-gate\.ts"/;
  return Object.entries(scripts)
    .filter(([, text]) => /readFileSync\(README_PATH\b/.test(text) && rootReadme.test(text) && /\bwriteFileSync\(/.test(text))
    .map(([path]) => path)
    .sort();
}

/** The generators with no line in the job that RUNS them: a `--check` line proves a file fresh and writes nothing, so it does not count. */
function generatorsNotRun(generators: string[], regenerateBody: string): string[] {
  const lines = regenerateBody.split("\n");
  return generators.filter((path) => !lines.some((line) => line.includes(path) && !line.includes("--check")));
}

const CONSUMER_GATE_GENERATOR = "scripts/generate-consumer-gate.ts";
const OUTSIDER_GENERATOR = "scripts/outsider/generate.ts";

test("the `regenerate` job runs every generator that reads README's Quickstart fence (#5468)", () => {
  const generators = fenceGenerators(scriptTexts());
  assert.ok(generators.includes(CONSUMER_GATE_GENERATOR) && generators.includes(OUTSIDER_GENERATOR),
    `the discovery no longer finds the two known generators (found: ${generators.join(", ") || "none"}): the marker is broken, not the workflow`);
  assert.equal(generators.includes("scripts/doc-checks/roles-readme.ts"), false, "a check of another README was taken for a generator");
  assert.deepEqual(generatorsNotRun(generators, jobBody("regenerate")), []);
});

test("the enumeration notices a generator the workflow does not run, and a generator it only checks (positive controls for the test above)", () => {
  const body = jobBody("regenerate");
  const generators = [CONSUMER_GATE_GENERATOR, OUTSIDER_GENERATOR];
  const another = "scripts/another-fence-generator.ts";
  assert.deepEqual(generatorsNotRun([...generators, another], body), [another]);
  const withoutRun = body.split("\n").filter((line) => !(line.includes(CONSUMER_GATE_GENERATOR) && !line.includes("--check"))).join("\n");
  assert.ok(withoutRun.includes(`${CONSUMER_GATE_GENERATOR} --check`), "the control lost its --check line: the fixture is not the shape it claims");
  assert.deepEqual(generatorsNotRun(generators, withoutRun), [CONSUMER_GATE_GENERATOR]);
  const discovered = fenceGenerators({
    ...scriptTexts(),
    [another]: 'import { README_PATH } from "./generate-consumer-gate.ts";\nwriteFileSync(OUT, f(readFileSync(README_PATH, "utf8")));',
  });
  assert.ok(discovered.includes(another), "a new script that reads README's fence and writes a file was not discovered");
});

/** One step of a job of the workflow, found by the text of its `with:` or `name:`. */
function stepWith(job: string, needle: string): string {
  const step = jobBody(job).split(/\n(?= {6}- )/).find((candidate) => candidate.includes(needle));
  assert.ok(step, `no step of \`${job}\` contains '${needle}'`);
  return step;
}

test("the regenerated files leave the `regenerate` job with their hidden directories, which `upload-artifact` omits by default (#5468)", () => {
  const generated = [gate.OUT, outsider.OUT].map((path: string) => path.slice(REPO.length));
  const hidden = generated.filter((path: string) => path.split("/").some((segment: string) => segment.startsWith(".")));
  assert.deepEqual(hidden, [".github/workflows/consumer-gate.yml"], "the control moved: no generated file sits under a hidden directory any more");
  assert.match(stepWith("regenerate", "name: files-regenerated"), /^\s*include-hidden-files: true$/m);
});

test("`write` refuses a delivery short of the files `regenerate` declared, so a dropped file is a red job and not a red pull request (#5468)", () => {
  assert.match(jobBody("regenerate"), /^\s*files: \$\{\{ steps\.stage\.outputs\.files \}\}$/m);
  assert.match(jobBody("regenerate"), /echo "files=.*>> "\$GITHUB_OUTPUT"/);
  const write = jobBody("write");
  assert.match(write, /^\s*REGENERATED: \$\{\{ needs\.regenerate\.outputs\.files \}\}$/m);
  assert.match(write, /for declared in \$REGENERATED; do\n\s*\[ -f "\$HANDED\/\$declared" \] \|\| fail /);
});

test("a re-pin leaves the consumer gate's pin comment naming the promoted release, by the generator's own staleness predicate (#5468)", () => {
  const { text, from, to } = repinned();
  const naming = (file: string, version: string) => file.split("\n").filter((line) => line.includes(`release ${version}`));
  const before = naming(committedGate, from);
  assert.ok(before.length > 0, "the committed consumer gate no longer names the pinned release in prose: the control moved");
  const regenerated: string = gate.generate(text, gate.extractPinnedSha(committedGate));
  assert.deepEqual(naming(regenerated, from), [], `the regenerated consumer gate still names ${from}`);
  assert.equal(naming(regenerated, to).length, before.length);
  assert.equal(gate.consumerGateIsStale(committedGate, regenerated), true, "the committed file is not stale for the re-pinned README: the writer has nothing to hand on");
  assert.equal(gate.consumerGateIsStale(regenerated, gate.generate(text, "e".repeat(PROMOTED_SHA.length))), false);
});
