/**
 * `--compare-axe`: what a11ign adds to axe on ONE page, what it merely repeats, and how much of WCAG each layer decides (#4528,
 * #4084 outcome 16).
 *
 * The evaluator's own test of this tool was to run axe beside it and see what it adds, counting by hand. This is that join over
 * two outputs a run already produces (axe's violations and the judge's findings), so it is NOT a new instrument. It lives apart
 * from `cli.ts` and imports nothing from it: `cli.ts` reaches the corpus reader, and a test whose closure reaches it cannot run
 * where the corpus is absent.
 *
 * **A layer that did not run is a state, never an empty list.** "a11ign added nothing" and "a11ign was not there" print
 * differently, because the first is a finding about the page and the second is a finding about the run.
 */
import { RULE_CRITERIA, criterionNumber } from "@a11ign/judge/coverage";
import { CRITERION_COVERAGE } from "@a11ign/judge/internal";

/** The slice of an axe violation the join reads: the criteria it maps to and the rule that raised it. */
export interface AxeViolationLike { wcag: readonly string[]; rule: string }

/** The slice of a judge finding the join reads. `mapping: "conformance"` is what makes a finding ASSERTED; absent is referred. */
export interface JudgeFindingLike { wcag?: string; mapping?: string }

/** A layer's contribution: what it reported, or why it was not there. */
export type LayerReading<T> = { ran: true; reported: readonly T[] } | { ran: false; why: string };

export interface ComparisonInput {
  axe: LayerReading<AxeViolationLike>;
  a11ign: LayerReading<JudgeFindingLike>;
}

/** One criterion with what each layer said about it. `axeRules` is empty when axe did not violate it; `a11ign` is null when nothing was found. */
export interface CriterionLine {
  criterion: string;
  axeRules: string[];
  a11ign: "asserted" | "referred" | null;
}

export interface ComparisonLists { axeOnly: CriterionLine[]; a11ignOnly: CriterionLine[]; both: CriterionLine[] }

/** How much of the A/AA criteria a11ign decides, read from `criterion-coverage.ts` rather than counted by hand. */
export interface CoverageStatement {
  total: number;
  /** `status: "assessed"`: the shipped judge can answer the whole criterion, as against `partial` (a named failure mode is not covered). */
  fullyAssessed: string[];
  /** Fully assessed AND decidable by a deterministic rule (`RULE_CRITERIA`), as against the trained scorer alone. */
  deterministic: string[];
}

export interface AxeComparison {
  axe: LayerReading<AxeViolationLike>;
  a11ign: LayerReading<JudgeFindingLike>;
  /** Null unless BOTH layers ran: with one missing, which side "only" found a thing is not knowable. */
  lists: ComparisonLists | null;
  coverage: CoverageStatement;
}

const byCriterion = (a: { criterion: string }, b: { criterion: string }): number =>
  a.criterion.localeCompare(b.criterion, "en", { numeric: true });

function axeRulesByCriterion(violations: readonly AxeViolationLike[]): Map<string, Set<string>> {
  const rules = new Map<string, Set<string>>();
  for (const { wcag, rule } of violations) {
    for (const criterion of wcag) rules.set(criterion, (rules.get(criterion) ?? new Set()).add(rule));
  }
  return rules;
}

/** Asserted beats referred: one conformance-mapped finding on a criterion makes the criterion asserted. */
function a11ignByCriterion(findings: readonly JudgeFindingLike[]): Map<string, "asserted" | "referred"> {
  const found = new Map<string, "asserted" | "referred">();
  for (const { wcag, mapping } of findings) {
    const criterion = criterionNumber(wcag);
    if (!criterion) continue;
    found.set(criterion, mapping === "conformance" || found.get(criterion) === "asserted" ? "asserted" : "referred");
  }
  return found;
}

function joinLists(axeViolations: readonly AxeViolationLike[], findings: readonly JudgeFindingLike[]): ComparisonLists {
  const axeRules = axeRulesByCriterion(axeViolations);
  const a11ign = a11ignByCriterion(findings);
  const lists: ComparisonLists = { axeOnly: [], a11ignOnly: [], both: [] };
  for (const criterion of new Set([...axeRules.keys(), ...a11ign.keys()])) {
    const line: CriterionLine = { criterion, axeRules: [...axeRules.get(criterion) ?? []].sort(), a11ign: a11ign.get(criterion) ?? null };
    if (line.axeRules.length && line.a11ign) lists.both.push(line);
    else if (line.axeRules.length) lists.axeOnly.push(line);
    else lists.a11ignOnly.push(line);
  }
  for (const list of Object.values(lists)) list.sort(byCriterion);
  return lists;
}

/** Read off `CRITERION_COVERAGE` and `RULE_CRITERIA`, the two places this project records what it decides. */
export function coverageStatement(): CoverageStatement {
  const criteria = Object.keys(CRITERION_COVERAGE);
  const fullyAssessed = criteria.filter((c) => CRITERION_COVERAGE[c].status === "assessed").sort();
  const rules = new Set<string>(RULE_CRITERIA);
  return { total: criteria.length, fullyAssessed, deterministic: fullyAssessed.filter((c) => rules.has(c)) };
}

export function compareWithAxe({ axe, a11ign }: ComparisonInput): AxeComparison {
  const lists = axe.ran && a11ign.ran ? joinLists(axe.reported, a11ign.reported) : null;
  return { axe, a11ign, lists, coverage: coverageStatement() };
}

function describeLine({ criterion, axeRules, a11ign }: CriterionLine): string {
  const axe = axeRules.length ? `axe: ${axeRules.join(", ")}` : "";
  const sr = a11ign ? `a11ign: ${a11ign}` : "";
  return `  ${criterion}  ${[axe, sr].filter(Boolean).join("; ")}`;
}

function listBlock(title: string, lines: readonly CriterionLine[]): string[] {
  return [`${title} (${lines.length})`, ...(lines.length ? lines.map(describeLine) : ["  none"])];
}

/** When one layer is missing the other's findings are still worth printing, but under a heading that does not claim a comparison. */
function oneSidedLines(comparison: AxeComparison): string[] {
  const { axe, a11ign } = comparison;
  if (axe.ran) {
    const criteria = [...axeRulesByCriterion(axe.reported)].map(([criterion, rules]) => ({ criterion, axeRules: [...rules].sort(), a11ign: null }));
    return [...listBlock("axe-core reported", criteria.sort(byCriterion)), `a11ign did not run: ${a11ign.ran ? "" : a11ign.why}`,
      "Nothing is said about what a11ign adds, because it was not there to add it."];
  }
  const criteria = [...a11ignByCriterion(a11ign.ran ? a11ign.reported : [])]
    .map(([criterion, found]) => ({ criterion, axeRules: [], a11ign: found }));
  return [...listBlock("a11ign reported", criteria.sort(byCriterion)), `axe-core did not run: ${axe.why}`,
    "Nothing is said about what a11ign repeats, because axe was not there to be repeated."];
}

/** The line the evaluator counted by hand, with the definitions beside the numbers so neither can be read as the other. */
export function coverageLine({ total, fullyAssessed, deterministic }: CoverageStatement): string {
  return `a11ign fully assesses ${fullyAssessed.length} of ${total} A/AA criteria (${fullyAssessed.join(", ")}), `
    + `${deterministic.length} of them by a deterministic rule (${deterministic.join(", ")}); `
    + "the rest are partly assessed, referred or not reached (docs/known-gaps.md). axe-core decides only part of any criterion it touches.";
}

export function comparisonLines(comparison: AxeComparison): string[] {
  const body = comparison.lists
    ? [...listBlock("axe only", comparison.lists.axeOnly), ...listBlock("a11ign only (screen-reader findings axe cannot make)", comparison.lists.a11ignOnly),
      ...listBlock("both", comparison.lists.both)]
    : oneSidedLines(comparison);
  return [...body, coverageLine(comparison.coverage)];
}
