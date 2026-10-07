/**
 * EVERY MERGE TO `main` THAT CARRIES A CHANGESET PUBLISHES TO THE DIST-TAG `next`, AND THE FLEET'S VERDICT DOES NOT GATE IT
 * (#3946, outcome 3 of #3911, items 1 and 3).
 *
 * Measured 2026-10-07: `a11ign` was `0.1.0` on npm while `main` carried `0.2.7`, because every release waited on the fleet part's
 * qualification (`gate:stability`, 44 to 46 minutes on a worker) and that status was not being posted. The design is release
 * channels and promotion by evidence: pre-merge CI and the guards are the gate for `next`, qualification is read AFTER the publish,
 * and `latest` moves only on green (the promotion row, not this one).
 *
 * ## What is pinned, by PARSING the workflow
 *
 * A step that echoes the same words must not satisfy a property, so every check reads the parsed YAML, never the text:
 *   1. the `release` call passes `dist-tag: next`, and its `uses:` is pinned by a full sha (that the sha DECLARES the input is the
 *      row's own Acceptance, which reads the called workflow over the network and so cannot run here);
 *   2. the fleet's verdict is not on the publish path: no step runs `release-reads-qualification`, none is `id: qualification`,
 *      `guards` exposes no `row-*` output, and no `qualification-row` job exists or is waited for;
 *   3. no `stage` call (`npm stage publish` needs a person's 2FA approval per version, which the design rules out);
 *   4. every guard that stays is still there, and `release` still waits for the jobs that carry them.
 *
 * ## Positive control for the emptiness
 *
 * `refusals()` returning `[]` for the real file proves nothing alone, so the tests below REFUSE a fixture for each property: the
 * real file is parsed, ONE thing is broken, and the refusal must name it. The guard loop breaks each guard of item 4 in turn, so
 * the table cannot gain an entry that nothing checks.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const WORKFLOW = join(REPO, ".github/workflows/release.yml");
const FULL_SHA_PIN = /^a11ign\/toolchain\/\.github\/workflows\/release-per-merge\.yml@[0-9a-f]{40}$/;

interface Step { id?: string; name?: string; run?: string; env?: Record<string, string> }
interface Job {
  needs?: string | string[];
  uses?: string;
  with?: Record<string, unknown>;
  outputs?: Record<string, string>;
  steps?: Step[];
}
interface Workflow { jobs?: Record<string, Job> }

const stepsOf = (workflow: Workflow, job: string): Step[] => workflow.jobs?.[job]?.steps ?? [];
const runsOf = (workflow: Workflow, job: string): string[] => stepsOf(workflow, job).map((step) => step.run ?? "");
const needsOf = (workflow: Workflow): string[] => [workflow.jobs?.release?.needs ?? []].flat();

/** A guard that stays (item 3 of the row): its name, and how the PARSED `guards` job shows it is still there. */
const GUARDS_THAT_STAY: readonly { name: string; present: (workflow: Workflow) => boolean }[] = [
  { name: "release:gate:ci", present: (w) => runsOf(w, "guards").some((r) => /pnpm run release:gate:ci\b/.test(r)) },
  { name: "the consumer-gate currency check", present: (w) => runsOf(w, "guards").some((r) => /generate-consumer-gate\.mjs --check/.test(r)) },
  { name: "the packed-install check", present: (w) => runsOf(w, "guards").some((r) => /pnpm run gate:isolation\b/.test(r)) },
  { name: "the manifest-repository check", present: (w) => runsOf(w, "guards").some((r) => /manifest-repository-check\.mjs/.test(r)) },
  { name: "the #3126 hold", present: (w) => stepsOf(w, "guards").some((s) => s.env?.A11Y_CHECK_RELEASE_HOLD === "1") },
  { name: "the access read-back", present: (w) => runsOf(w, "guards").some((r) => /\.changeset\/config\.json/.test(r) && /public/.test(r)) },
  { name: "the refusal to publish older than the registry", present: (w) => runsOf(w, "guards").some((r) => /Behind the registry/.test(r)) },
  { name: "the npm floor", present: (w) => runsOf(w, "guards").some((r) => /11\.5\.1/.test(r) && /sort -V/.test(r)) },
  { name: "the provenance request", present: (w) => stepsOf(w, "guards").some((s) => s.env?.NPM_CONFIG_PROVENANCE === "true" && /release-publish-rehearsal\.mjs/.test(s.run ?? "")) },
];

/**
 * Item 3 of #3946 named ten guards that are steps of `guards`; #3999 moved the coverage floor to the pull request, so nine
 * remain. The table may grow past it, never under.
 */
const GUARDS_NAMED_BY_THE_ROW = 9;

/** The called workflows `release` waits for, which are guards run as jobs. */
const JOBS_THAT_STAY = ["action-smoke", "capture-regression", "consumer-gate", "guards"] as const;

function refusals(text: string): string[] {
  const workflow = parse(text) as Workflow;
  return [
    ...callRefusals(workflow),
    ...verdictOnThePublishPath(workflow),
    ...stageRefusals(workflow),
    ...guardRefusals(workflow),
    ...coverageRefusals(workflow),
  ];
}

function callRefusals(workflow: Workflow): string[] {
  const release = workflow.jobs?.release;
  const found: string[] = [];
  if (release?.with?.["dist-tag"] !== "next") found.push("the `release` call does not pass `dist-tag: next`");
  if (!FULL_SHA_PIN.test(release?.uses ?? "")) found.push("the `release` call is not pinned to release-per-merge.yml by a full sha");
  return found;
}

function stageRefusals(workflow: Workflow): string[] {
  const staging = Object.entries(workflow.jobs ?? {}).filter(([, job]) =>
    (job.steps ?? []).some((step) => /\b(npm|pnpm)\s+stage\b/.test(step.run ?? "")));
  return staging.length > 0 ? [`a \`stage\` call is present in ${staging.map(([name]) => name).join(", ")}`] : [];
}

function guardRefusals(workflow: Workflow): string[] {
  const found = GUARDS_THAT_STAY.filter((guard) => !guard.present(workflow)).map((guard) => `the guard that must stay is missing: ${guard.name}`);
  for (const job of JOBS_THAT_STAY) {
    if (!workflow.jobs?.[job]) found.push(`the guard job that must stay is missing: ${job}`);
    else if (!needsOf(workflow).includes(job)) found.push(`\`release\` no longer needs the guard job ${job}`);
  }
  return found;
}

/** #3999: the whole-repo coverage floor is the pull request's (`ci/ts`), so a release run that re-measures it, or reads nightly's verdict, is back. */
function coverageRefusals(workflow: Workflow): string[] {
  return Object.entries(workflow.jobs ?? {}).flatMap(([name, job]) => (job.steps ?? [])
    .filter((step) => /pnpm run coverage\b|release-reuses-verdict/.test(step.run ?? "") || step.id === "coverage-verdict")
    .map(() => `the whole-repo coverage floor is back on the release path, in ${name}`));
}

function verdictOnThePublishPath(workflow: Workflow): string[] {
  const found: string[] = [];
  for (const [name, job] of Object.entries(workflow.jobs ?? {})) {
    for (const step of job.steps ?? []) {
      if (/release-reads-qualification/.test(step.run ?? "")) found.push(`the fleet verdict step is back in ${name}`);
      if (step.id === "qualification") found.push(`a step with \`id: qualification\` is back in ${name}`);
    }
  }
  const rowOutputs = Object.keys(workflow.jobs?.guards?.outputs ?? {}).filter((key) => key.startsWith("row-"));
  if (rowOutputs.length > 0) found.push(`guards exposes the fleet row outputs ${rowOutputs.join(", ")}`);
  if (workflow.jobs?.["qualification-row"]) found.push("the `qualification-row` job exists");
  if (needsOf(workflow).includes("qualification-row")) found.push("`release` waits for `qualification-row`");
  return found;
}

/** The real file, parsed, ONE thing broken, and written back as text: what a regression would hand `refusals()`. */
function brokenAs(edit: (workflow: Workflow) => void): string {
  const workflow = parse(readFileSync(WORKFLOW, "utf8")) as Workflow;
  edit(workflow);
  return stringify(workflow);
}

const VERDICT_STEP: Step = {
  id: "qualification",
  name: "Read the fleet part's verdict for this sha",
  run: "node scripts/release-reads-qualification.mjs --sha=${{ github.sha }}",
};

test("the real release.yml publishes to `next`, with the fleet verdict off the path and every guard still there", () => {
  assert.deepEqual(refusals(readFileSync(WORKFLOW, "utf8")), []);
});

test("positive control: the checker is not vacuous (the table is non-empty and the unbroken file is the only thing it accepts)", () => {
  assert.ok(GUARDS_THAT_STAY.length >= GUARDS_NAMED_BY_THE_ROW, "#3999 leaves nine of item 3's ten guards as steps of `guards`");
  assert.ok(refusals(brokenAs((w) => { delete w.jobs!.release.with!["dist-tag"]; })).length > 0);
});

test("a release call with no `dist-tag` is REFUSED, even when a step echoes the words", () => {
  const text = brokenAs((workflow) => {
    delete workflow.jobs!.release.with!["dist-tag"];
    workflow.jobs!.guards.steps!.push({ run: "echo 'dist-tag: next'" });
  });
  assert.deepEqual(refusals(text), ["the `release` call does not pass `dist-tag: next`"]);
});

test("a `dist-tag` that is `latest` is REFUSED", () => {
  const text = brokenAs((workflow) => { workflow.jobs!.release.with!["dist-tag"] = "latest"; });
  assert.deepEqual(refusals(text), ["the `release` call does not pass `dist-tag: next`"]);
});

test("a release call pinned to a branch rather than a full sha is REFUSED", () => {
  const text = brokenAs((workflow) => { workflow.jobs!.release.uses = "a11ign/toolchain/.github/workflows/release-per-merge.yml@main"; });
  assert.deepEqual(refusals(text), ["the `release` call is not pinned to release-per-merge.yml by a full sha"]);
});

test("the verdict step back in `guards` is REFUSED, naming the job", () => {
  const text = brokenAs((workflow) => { workflow.jobs!.guards.steps!.push(VERDICT_STEP); });
  assert.deepEqual(refusals(text), ["the fleet verdict step is back in guards", "a step with `id: qualification` is back in guards"]);
});

test("the `row-*` outputs back on `guards` are REFUSED", () => {
  const text = brokenAs((workflow) => { workflow.jobs!.guards.outputs = { "row-title": "${{ steps.qualification.outputs.row-title }}" }; });
  assert.deepEqual(refusals(text), ["guards exposes the fleet row outputs row-title"]);
});

test("the `qualification-row` job back, and waited for by `release`, is REFUSED", () => {
  const text = brokenAs((workflow) => {
    workflow.jobs!["qualification-row"] = { needs: ["guards"], steps: [{ run: "gh issue create" }] };
    workflow.jobs!.release.needs = [...needsOf(workflow), "qualification-row"];
  });
  assert.deepEqual(refusals(text), ["the `qualification-row` job exists", "`release` waits for `qualification-row`"]);
});

test("the coverage run, or nightly's verdict for it, back in `guards` is REFUSED, naming the job (#3999)", () => {
  assert.deepEqual(refusals(brokenAs((w) => { w.jobs!.guards.steps!.push({ run: "pnpm run coverage" }); })),
    ["the whole-repo coverage floor is back on the release path, in guards"]);
  assert.deepEqual(refusals(brokenAs((w) => { w.jobs!.guards.steps!.push({ id: "coverage-verdict", run: "node scripts/release-reuses-verdict.mjs --sha=x" }); })),
    ["the whole-repo coverage floor is back on the release path, in guards"]);
});

test("a `stage` call is REFUSED, and the file names the job it is in", () => {
  const text = brokenAs((workflow) => { workflow.jobs!.guards.steps!.push({ run: "npm stage publish --tag next" }); });
  assert.deepEqual(refusals(text), ["a `stage` call is present in guards"]);
});

for (const guard of GUARDS_THAT_STAY) {
  test(`dropping a guard that must stay is REFUSED, naming it: ${guard.name}`, () => {
    const text = brokenAs((workflow) => {
      const job = workflow.jobs!.guards;
      job.steps = job.steps!.filter((step) => !guard.present({ jobs: { guards: { steps: [step] } } }));
    });
    assert.deepEqual(refusals(text), [`the guard that must stay is missing: ${guard.name}`]);
  });
}

for (const name of JOBS_THAT_STAY) {
  test(`release no longer waiting for ${name} is REFUSED`, () => {
    const text = brokenAs((workflow) => { workflow.jobs!.release.needs = needsOf(workflow).filter((need) => need !== name); });
    assert.deepEqual(refusals(text), [`\`release\` no longer needs the guard job ${name}`]);
  });
}
