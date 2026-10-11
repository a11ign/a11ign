// no-token: none -- reads tracked files; no network, no GitHub.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { evaluate, failures, fixturePath } from "./rules-check.js";
import { RULES_FITNESS_CASES, type RulesFitnessCase } from "./cases.js";

/**
 * #4936 (epic #4425, `ceo`'s option 3): THE CORE'S `rulesFitness` JOB READS THE PRODUCT'S OWN CASES, and this is the check that says it still does.
 *
 * The population is DERIVED, not listed: `rules-check.ts` runs exactly `RULES_FITNESS_CASES`, so every case it can run is in the loop below, and a
 * case added later is covered by being added. Three claims, each with its own positive control:
 *
 *   1. every fixture a case names resolves under `./fixtures/` and not under the lab's directory, and exists unless the case is declared pending;
 *   2. nothing the lab keeps unpublished is here, and nothing under `fitness/` can reach a tarball (`files` is `dist`, `README.md`, `LICENSE`).
 *
 * A third claim, that each moved fixture is the lab's byte for byte, was deleted with ADR 0045 cut 2 (#5080): it read the lab's copy by path, which
 * a repository never does to another (ADR 0045 rule 2), and its own comment said to delete it with the lab's copies.
 *
 * Positive controls: the emptiness assertions are pinned by the population-size test (claim 1's loop cannot pass on nothing), and each rule
 * below is fed a case that breaks it and must report it.
 */
const ROOT = resolve(import.meta.dirname, "../../../..");
const FITNESS_DIR = resolve(import.meta.dirname);
const FIXTURES_DIR = resolve(FITNESS_DIR, "fixtures");
/** Where a laid lab used to sit. Spelled in two parts so no tracked file carries the path (the cut's acceptance greps for it): the claim is that nothing resolves there. */
const LAB_DIR = resolve(ROOT, "packages", "lab");
/** A population this small means the loops below passed on nothing. The count at #4936 was 33 (31 captured, 2 pending). */
const FLOOR = 30;

const within = (dir: string, file: string): boolean => {
  const rel = relative(dir, file);
  return rel !== "" && !rel.startsWith("..") && !rel.startsWith(sep);
};

/** Why this case does not read a product-owned fixture, or `[]`. */
function placementProblems(c: RulesFitnessCase): string[] {
  const file = fixturePath(c);
  const problems: string[] = [];
  if (!within(FIXTURES_DIR, file)) problems.push(`${c.id}: ${file} is not under ${FIXTURES_DIR}`);
  if (within(LAB_DIR, file)) problems.push(`${c.id}: ${file} is under the lab's directory`);
  const present = existsSync(file);
  if (!present && !c.pendingCapture) problems.push(`${c.id}: ${file} does not exist and the case is not declared pendingCapture`);
  if (present && c.pendingCapture) problems.push(`${c.id}: declared pendingCapture but ${file} exists, so the declaration is stale`);
  return problems;
}

test("the population is not empty, so the loops below are not vacuous", () => {
  assert.ok(RULES_FITNESS_CASES.length >= FLOOR, `${RULES_FITNESS_CASES.length} cases`);
  assert.ok(RULES_FITNESS_CASES.some((c) => c.pendingCapture), "the declared-pending path is exercised by two cases, so the skip is not dead code");
  assert.equal(new Set(RULES_FITNESS_CASES.map((c) => c.id)).size, RULES_FITNESS_CASES.length, "case ids are unique");
});

test("every case rules-check runs resolves to a file under the product's tree, not under the lab's directory", () => {
  assert.deepEqual(RULES_FITNESS_CASES.flatMap(placementProblems), []);
});

test("positive control: a case pointed at a missing path, at the lab, or outside the tree is refused", () => {
  const missing: RulesFitnessCase = { id: "ghost", fixture: "tutorials/does-not-exist.json", expect: [] };
  assert.match(placementProblems(missing).join("\n"), /does not exist and the case is not declared pendingCapture/);
  const intoLab: RulesFitnessCase = { id: "lab", fixture: "../../../../lab/src/eval/fixtures/tutorials/images-good.json", expect: [] };
  assert.match(placementProblems(intoLab).join("\n"), /is not under .*fixtures/);
  const stale: RulesFitnessCase = { ...RULES_FITNESS_CASES[0], pendingCapture: true };
  assert.match(placementProblems(stale).join("\n"), /declared pendingCapture but .* exists/);
  const declared: RulesFitnessCase = { ...missing, pendingCapture: true };
  assert.deepEqual(placementProblems(declared), [], "a declared-pending case with no fixture is the one honest absence");
});

test("rules-check runs the product's cases and refuses a population that shrank or measured nothing", () => {
  const report = evaluate(RULES_FITNESS_CASES);
  assert.equal(report.examined + report.pending.length, RULES_FITNESS_CASES.length);
  assert.deepEqual(failures(report), [], "the product's own cases pass the check at this head");
  const ghost: RulesFitnessCase = { id: "ghost", fixture: "tutorials/does-not-exist.json", expect: [] };
  assert.deepEqual(evaluate([ghost]).missing, ["ghost"]);
  assert.match(failures(evaluate([ghost])).join("\n"), /not declared pendingCapture/);
  assert.match(failures(evaluate([])).join("\n"), /measured nothing/);
});

test("rules-check.ts and cases.ts import nothing from the lab", () => {
  for (const name of ["rules-check.ts", "cases.ts"]) {
    const specifiers = [...readFileSync(resolve(FITNESS_DIR, name), "utf8").matchAll(/\bfrom\s+"([^"]+)"|\bimport\(\s*"([^"]+)"/g)].map((m) => m[1] ?? m[2]);
    assert.deepEqual(specifiers.filter((s) => /(^|\/)lab(\/|$)|@a11ign\/lab/.test(s)), [], `${name} reaches the lab`);
  }
  const script = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")).scripts["rules-check"] as string;
  assert.equal(script, "tsx packages/judge/src/fitness/rules-check.ts", "`pnpm run rules-check` runs the product's runner");
});

test("what the lab keeps unpublished is not here, and nothing under fitness/ is in the package", () => {
  assert.equal(RULES_FITNESS_CASES.some((c) => /contamination/.test(c.id + c.fixture)), false);
  assert.equal(existsSync(resolve(FIXTURES_DIR, "contamination-test.json")), false);
  const manifest = JSON.parse(readFileSync(resolve(ROOT, "packages/judge/package.json"), "utf8"));
  assert.deepEqual(manifest.files, ["dist", "README.md", "LICENSE"]);
  const exported = JSON.stringify(manifest.exports);
  assert.equal(/fitness|fixtures|src\//.test(exported), false, "no export points into src/");
});
