// no-token: none -- reads tracked files, and one child process that loads the lab's laid `cases.ts`; no network, no GitHub.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
 *   1. every fixture a case names resolves under `./fixtures/` and not under `packages/lab/`, and exists unless the case is declared pending;
 *   2. nothing the lab keeps unpublished is here, and nothing under `fitness/` can reach a tarball (`files` is `dist`, `README.md`, `LICENSE`);
 *   3. each moved fixture is the lab's byte for byte, and each case says what the lab's says (the `cross-repo-copies` shape: the lab keeps the
 *      transcripts for `run.ts`, so they live in two places and only a test that sees both can tell them apart). THIS CLAIM READS THE LAB'S LAID
 *      COPY AT THE TAG `layers.json` PINS, and it is deleted in the pull request that moves the tag to a lab that no longer carries them.
 *
 * Positive controls: the emptiness assertions are pinned by the population-size test (claim 1's loop cannot pass on nothing), and each rule
 * below is fed a case that breaks it and must report it.
 */
const ROOT = resolve(import.meta.dirname, "../../../..");
const FITNESS_DIR = resolve(import.meta.dirname);
const FIXTURES_DIR = resolve(FITNESS_DIR, "fixtures");
const LAB_FIXTURES = resolve(ROOT, "packages/lab/src/eval/fixtures");
const LAB_CASES = resolve(ROOT, "packages/lab/src/eval/cases.ts");
const TSX = resolve(ROOT, "node_modules/tsx/dist/cli.mjs");
/** The lab cases that are NOT here, each with the reason: the allow-list the pair comparison reads, so a lab case missing here is never silent. */
const KEPT_IN_LAB: Record<string, string> = {
  "contamination-fresh-page": "authored fresh and never published (its own comment in the lab's cases.ts): a copy in this tree is a copy a model can read",
};
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
  if (within(resolve(ROOT, "packages/lab"), file)) problems.push(`${c.id}: ${file} is under packages/lab/`);
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

test("every case rules-check runs resolves to a file under the product's tree, not under packages/lab/", () => {
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

type LabCase = { id: string; fixture: string; expect: string[] };

/** Where the product's copy and the lab's differ, or `[]`. Both sides are injected so each difference can be made on purpose. */
function pairProblems(product: readonly RulesFitnessCase[], lab: readonly LabCase[], labBytes: (rel: string) => Buffer | null): string[] {
  const problems: string[] = [];
  const byId = new Map(lab.map((c) => [c.id, c]));
  for (const c of product) {
    const theirs = byId.get(c.id);
    if (!theirs) { problems.push(`${c.id}: no such case in the lab`); continue; }
    if (JSON.stringify(theirs.expect) !== JSON.stringify(c.expect)) problems.push(`${c.id}: expect ${JSON.stringify(c.expect)} here, ${JSON.stringify(theirs.expect)} in the lab`);
    if (!theirs.fixture.endsWith(`/fixtures/${c.fixture}`)) problems.push(`${c.id}: fixture ${c.fixture} here, ${theirs.fixture} in the lab`);
    const ours = c.pendingCapture ? null : readFileSync(fixturePath(c));
    const lbytes = labBytes(c.fixture);
    if ((ours === null) !== (lbytes === null) || (ours && lbytes && !ours.equals(lbytes))) problems.push(`${c.id}: ${c.fixture} differs from the lab's copy`);
  }
  const ours = new Set(product.map((c) => c.id));
  for (const c of lab) if (!ours.has(c.id) && !(c.id in KEPT_IN_LAB)) problems.push(`${c.id}: a lab case that is neither here nor in KEPT_IN_LAB`);
  return problems;
}

function laidLabCases(): LabCase[] {
  assert.ok(existsSync(LAB_CASES), `${LAB_CASES} is absent: the lab is laid by \`node scripts/lay-layer.ts lab\` (pnpm install runs it)`);
  const script = `import(${JSON.stringify(LAB_CASES)}).then((m) => console.log(JSON.stringify(m.EVAL_CASES.map((c) => ({ id: c.id, fixture: c.fixture, expect: c.expect })))))`;
  return JSON.parse(execFileSync(process.execPath, [TSX, "--eval", script], { encoding: "utf8", cwd: ROOT })) as LabCase[];
}

const labBytesAt = (rel: string): Buffer | null => {
  const file = resolve(LAB_FIXTURES, rel);
  return existsSync(file) ? readFileSync(file) : null;
};

test("each moved case and fixture is the lab's, byte for byte (the pair pin; delete it with the lab's copies)", () => {
  const lab = laidLabCases();
  assert.ok(lab.length > RULES_FITNESS_CASES.length, "the lab's list is the longer one: it keeps a case this tree does not");
  assert.deepEqual(pairProblems(RULES_FITNESS_CASES, lab, labBytesAt), []);
  assert.ok(Object.keys(KEPT_IN_LAB).every((id) => lab.some((c) => c.id === id)), "every KEPT_IN_LAB entry is still a lab case, so the allow-list is not stale");
});

test("positive control: the pair pin names a differing byte, a differing expectation and an unlisted lab case", () => {
  const first = RULES_FITNESS_CASES.find((c) => !c.pendingCapture)!;
  const lab: LabCase[] = RULES_FITNESS_CASES.map((c) => ({ id: c.id, fixture: `packages/lab/src/eval/fixtures/${c.fixture}`, expect: c.expect }));
  const same = (rel: string): Buffer | null => (RULES_FITNESS_CASES.find((c) => c.fixture === rel)?.pendingCapture ? null : readFileSync(resolve(FIXTURES_DIR, rel)));
  assert.deepEqual(pairProblems(RULES_FITNESS_CASES, lab, same), [], "identical pairs report nothing");
  const edited = (rel: string): Buffer | null => (rel === first.fixture ? Buffer.from("{}") : same(rel));
  assert.match(pairProblems(RULES_FITNESS_CASES, lab, edited).join("\n"), /differs from the lab's copy/);
  const reexpected = lab.map((c) => (c.id === first.id ? { ...c, expect: [...c.expect, "9.9.9"] } : c));
  assert.match(pairProblems(RULES_FITNESS_CASES, reexpected, same).join("\n"), /in the lab/);
  const extra = [...lab, { id: "surprise", fixture: "packages/lab/src/eval/fixtures/x.json", expect: [] }];
  assert.match(pairProblems(RULES_FITNESS_CASES, extra, same).join("\n"), /neither here nor in KEPT_IN_LAB/);
  const orphaned = lab.filter((c) => c.id !== first.id);
  assert.match(pairProblems(RULES_FITNESS_CASES, orphaned, same).join("\n"), /no such case in the lab/);
});
