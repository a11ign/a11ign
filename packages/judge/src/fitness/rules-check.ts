/**
 * Validate the deterministic absence rules (`../rules.ts`) over the product's own cases (`./cases.ts`). Exits non-zero if the rules produce ANY
 * false positive on a conformant page: precision is the whole point of a rule.
 *
 * Run: pnpm run rules-check
 *
 * This was `src/eval/rules-check.ts` in `a11ign/lab`, which read its cases out of the lab's tree; #4936 moved the check and the cases it reads here
 * (see `./cases.ts` for what moved and what did not).
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { oracleCounts } from "@a11ign/evidence/verify";
import { ruleFindings, type RuleInput } from "../rules.js";
import { FITNESS_FIXTURES_DIR, RULES_FITNESS_CASES, type RulesFitnessCase } from "./cases.js";

const ID_WIDTH = 28; // padding for aligned case-id output

export interface FitnessReport {
  lines: string[];
  /** Conformant pages the rules flagged anyway, counted in criteria. */
  cleanFP: number;
  /** Cases that expect a 1.1.1 or 4.1.2 absence, and how many of them had every one found. */
  absenceTotal: number;
  absenceCaught: number;
  /** Declared `pendingCapture`, so skipped by name. */
  pending: string[];
  /** Cases that were NOT declared pending and have no fixture: the population shrank, so the check fails. */
  missing: string[];
  /** Cases whose rules actually ran. Zero is a check that measured nothing. */
  examined: number;
}

const crit = (wcag: string): string => wcag.match(/(\d+\.\d+\.\d+)/)?.[1] ?? wcag;

export const fixturePath = (c: RulesFitnessCase): string => fileURLToPath(new URL(c.fixture, FITNESS_FIXTURES_DIR));

/** The criteria the rules assert on one capture. A fixture on disk is a RAW capture, so the oracle counts are extracted here exactly as the CLI extracts them: otherwise this check cannot reach a census-reading rule. */
function criteriaFor(file: string): string[] {
  const data = JSON.parse(readFileSync(file, "utf8")) as RuleInput;
  return [...new Set(ruleFindings({ ...data, ...oracleCounts(data as never) }).map((f) => crit(f.wcag)))];
}

export function evaluate(cases: readonly RulesFitnessCase[]): FitnessReport {
  const report: FitnessReport = { lines: [], cleanFP: 0, absenceTotal: 0, absenceCaught: 0, pending: [], missing: [], examined: 0 };
  for (const c of cases) {
    const file = fixturePath(c);
    if (!existsSync(file)) {
      (c.pendingCapture ? report.pending : report.missing).push(c.id);
      continue;
    }
    const crits = criteriaFor(file);
    report.examined++;
    const absence = c.expect.filter((x) => x === "1.1.1" || x === "4.1.2");
    if (c.expect.length === 0) report.cleanFP += crits.length;
    if (absence.length) {
      report.absenceTotal++;
      if (absence.every((x) => crits.includes(x))) report.absenceCaught++;
    }
    const fp = c.expect.length === 0 && crits.length ? "  <-- FALSE POSITIVE" : "";
    report.lines.push(`${c.expect.length ? "FAIL " : "CLEAN"} ${c.id.padEnd(ID_WIDTH)} rules=${JSON.stringify(crits)}${fp}`);
  }
  return report;
}

/** What the check refuses on, one message per reason; empty means it passed. */
export function failures(report: FitnessReport): string[] {
  const found: string[] = [];
  if (report.cleanFP > 0) found.push("FAIL: deterministic rules produced false positives on conformant pages");
  if (report.missing.length) found.push(`FAIL: fixture absent and not declared pendingCapture: ${report.missing.join(", ")}`);
  if (report.examined === 0) found.push("FAIL: no case was examined, so this measured nothing");
  return found;
}

function main(): void {
  const report = evaluate(RULES_FITNESS_CASES);
  for (const line of report.lines) console.log(line);
  console.log(`\nAbsence cases fully caught: ${report.absenceCaught}/${report.absenceTotal}  |  clean-page false positives: ${report.cleanFP}`);
  if (report.pending.length) console.log(`Pending capture (skipped): ${report.pending.join(", ")}`);
  const refused = failures(report);
  for (const reason of refused) console.error(reason);
  if (refused.length) process.exit(1);
}

/**
 * Run ONLY when this file is the program, never when it is imported, so a test can reach the logic above without the script exiting the test
 * runner via `process.exit(1)`. See `entry-points.test.ts`.
 */
const isProgram = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isProgram) main();
