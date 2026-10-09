/**
 * THE FILES CORE TESTS READ BY NAME ARE IN `forceRerunTriggers` (#4419, found by lab#39 / a11ign#4372).
 *
 * A `verify --changed` run re-runs only the tests whose import closure a change touches (#3210). A test that reads a data file by path has
 * that file outside its closure, so `scripts/rstest/rstest.config.ts` lists such files as `forceRerunTriggers` and a change to one runs
 * everything. Twenty-seven files were read by name and listed nowhere, so editing one left the local affected set green. CI runs the whole
 * suite, which bounds the cost to the local run.
 *
 * THE POPULATION IS READ FROM THE TREE, not kept as a copy: the three directories are listed (`.github/chainguard`, the
 * `registry-consumer-gate` fixtures, the `octo-sts-*` fixtures) and only the five single files are named, because a file added to one of
 * those directories is read by the same test. The lab derives the same population from the tests' string literals; this test pins the
 * outcome over the tree it can see.
 *
 * THE MATCHER: rstest matches `picomatch(triggers)` against the root-relative path. `picomatch` is declared by no manifest here (it is a
 * dev dependency bundled INTO `@rstest/core`), so it cannot be imported honestly, and `path.posix.matchesGlob` stands in. Measured
 * 2026-10-09 against picomatch 4.0.7 over every trigger of the 132 here and every tracked file (886 incl. a made-up one): one disagreement
 * class, a trailing `/**` also matching the bare name (`**\/package.json/**` vs `package.json`), which cannot affect a file's
 * coverage by a directory pattern. `TRIGGER_GRAMMAR` fails if a trigger leaves `*`, `**` and literal segments, so a matcher that
 * could disagree further is never silently trusted.
 *
 * Controls (the emptiness of "not covered" is only worth something if the matcher can say no): a path nothing names is NOT matched, and
 * removing one directory pattern from a copy of the list turns exactly the files under it uncovered.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));

const config = (await import(pathToFileURL(`${REPO}scripts/rstest/rstest.config.ts`).href)).default;
const TRIGGERS: string[] = config.forceRerunTriggers;

/** What the stand-in matcher is trusted for: literal segments, `*` inside a segment, and `**` as a whole trailing or middle segment. */
const TRIGGER_GRAMMAR = /^(?:[\w.@-]+|\*|\*\*|[\w.@-]*\*[\w.@-]*)(?:\/(?:[\w.@-]+|\*|\*\*|[\w.@-]*\*[\w.@-]*))*$/;

const matchedBy = (triggers: string[], path: string) => triggers.filter((trigger) => posix.matchesGlob(path, trigger));
const covered = (triggers: string[], path: string) => matchedBy(triggers, path).length > 0;

const list = (dir: string, keep: (name: string) => boolean = () => true) =>
  readdirSync(`${REPO}${dir}`)
    .filter(keep)
    .map((name) => `${dir}/${name}`);

const CHAINGUARD_DIR = ".github/chainguard";
const CONSUMER_GATE_DIR = "scripts/fixtures/registry-consumer-gate";

/** Single files, read by name by the test beside each: `licence-faq.test.ts`, `attach-spike.test.ts`, `evidence-pack.test.ts`, `ci-health.test.ts`, `outsider-job-fresh.test.ts`. */
const NAMED_FILES = [
  "docs/auth-attach-spike.md",
  "docs/ci-targets.json",
  "docs/evidence-pack.md",
  "docs/licence-faq.md",
  "scripts/outsider/outsider-job.yml",
];

const chainguard = list(CHAINGUARD_DIR);
const octoSts = list("scripts/fixtures", (name) => name.startsWith("octo-sts-"));
const consumerGate = list(CONSUMER_GATE_DIR);
/** What the row and the lab count: five STS policies, six `octo-sts-*` fixtures, ten gate fixtures at least, and 27 in all. */
const EXPECTED = { chainguard: 5, octoSts: 6, consumerGateAtLeast: 10, total: 27, triggersAtLeast: 100 };
const THE_27 = [...chainguard, ...NAMED_FILES, ...octoSts, ...consumerGate];

test("positive control: the population is read from a tree that has the files the row names", () => {
  assert.equal(chainguard.length, EXPECTED.chainguard, `.github/chainguard: ${chainguard.join(", ")}`);
  assert.equal(octoSts.length, EXPECTED.octoSts, `scripts/fixtures/octo-sts-*: ${octoSts.join(", ")}`);
  assert.ok(consumerGate.length >= EXPECTED.consumerGateAtLeast, `${CONSUMER_GATE_DIR} lost fixtures: ${consumerGate.length}`);
  assert.ok(THE_27.length >= EXPECTED.total, `the population shrank below the 27 the row names: ${THE_27.length}`);
});

test("every trigger is in the grammar the stand-in matcher is trusted for", () => {
  const outside = TRIGGERS.filter((trigger) => !TRIGGER_GRAMMAR.test(trigger));
  assert.deepEqual(outside, [], "a trigger left the grammar `posix.matchesGlob` shares with picomatch: use a real picomatch before trusting this test");
  assert.ok(TRIGGERS.length > EXPECTED.triggersAtLeast, `positive control: the grammar check saw ${TRIGGERS.length} triggers, so it did run`);
});

test("every file a core test reads by name is matched by some forceRerunTrigger", () => {
  assert.ok(THE_27.length >= EXPECTED.total, `the population is ${THE_27.length}, so an empty "unmatched" would prove nothing`);
  const unmatched = THE_27.filter((path) => !covered(TRIGGERS, path));
  assert.deepEqual(unmatched, [], "these are read by name by a core test and no trigger names them: add them to READ_DIRECTORY_TRIGGERS / READ_FILE_TRIGGERS");
});

test("negative control: a path no trigger names is NOT matched", () => {
  assert.equal(covered(TRIGGERS, "docs/not-read-by-anything.md"), false);
  assert.equal(covered(TRIGGERS, "scripts/fixtures/not-read-by-anything.json"), false);
});

test("removing a directory pattern turns exactly the files under it uncovered", () => {
  const cases: Array<[string, string[]]> = [
    [`${CHAINGUARD_DIR}/**`, chainguard],
    [`${CONSUMER_GATE_DIR}/**`, consumerGate],
  ];
  for (const [pattern, under] of cases) {
    assert.ok(TRIGGERS.includes(pattern), `${pattern} is not a trigger, so there is nothing to remove`);
    const without = TRIGGERS.filter((trigger) => trigger !== pattern);
    // Only files covered to begin with: a file already uncovered is the coverage test's failure, not this one's.
    const uncovered = THE_27.filter((path) => covered(TRIGGERS, path) && !covered(without, path));
    assert.deepEqual(uncovered.sort(), [...under].sort(), `removing ${pattern}`);
  }
});
