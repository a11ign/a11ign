// THE NIGHTLY EXAMPLE FITS ITS OWN PAGE LIST (#4090, #4084 outcome 6): `examples/nightly-workflow.yml` is read, not copied.
//
// The defect this stands in front of: the only documented workflow carried `timeout-minutes: 20`, which `capture-cost.md` says
// "fits two captures and no more", so a ten-page nightly written from the docs was killed by its own timeout. Three things are
// held here, each with a control that is the shipped file broken in exactly that way:
//   1. the shape: a `schedule:` with a valid five-field cron, the Action as `uses:`, and `max-pages` equal to the URL count;
//   2. the timeout is at least `worstMinutes(<its URL count>)`, the function the Action's own estimate uses, and at least the
//      slowest-capture cell of the cost document's own row;
//   3. every figure in its budget comment, and in the docs' nightly table, is the cost document's figure (or arithmetic on it),
//      READ from `docs/capture-cost.md`, so a retyped number that drifts fails.
// The positive control for each emptiness assertion is named where it is made: the shipped file has ten URLs and four budget lines.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { splitUrlList, worstMinutes } from "../multi-page.js";

const ROOT = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "../../../..");
const read = (path: string): string => readFileSync(resolve(ROOT, path), "utf8");

const EXAMPLE = read("examples/nightly-workflow.yml");
const COST = read("docs/capture-cost.md");
const ACTION_DOC = read("docs/github-action.md");

const RUNS_PER_MONTH = 30;
const CENTS = 100;

interface Workflow {
  on?: { schedule?: Array<{ cron?: string }> };
  jobs?: Record<string, { "timeout-minutes"?: number; steps?: Array<{ uses?: string; with?: Record<string, string> }> }>;
}

/** One row of the cost document's "Cap basis" extrapolation table, in the document's own words. */
interface CostRow { typical: number; worst: number; worstDollars: number }

const CRON_RANGES: ReadonlyArray<readonly [number, number]> = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];

/** A numeric five-field cron: `*`, `a`, `a-b`, each optionally `/step`, comma-separated, inside its field's range. Names are not accepted. */
export function validCron(expression: string): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== CRON_RANGES.length) return false;
  return fields.every((field, index) => field.split(",").every((item) => validCronItem(item, CRON_RANGES[index])));
}

function validCronItem(item: string, [low, high]: readonly [number, number]): boolean {
  const match = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(item);
  if (!match) return false;
  if (match[2] !== undefined && Number(match[2]) < 1) return false;
  if (match[1] === "*") return true;
  const [from, to = from] = match[1].split("-").map(Number);
  return from >= low && to <= high && from <= to;
}

/** The "Cap basis" row for `pages` captures. Throws when the document has none: a missing row must not read as "no budget". */
function costRow(cost: string, pages: number): CostRow {
  const section = cost.slice(cost.indexOf("## Cap basis"));
  for (const line of section.split("\n")) {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.replaceAll("*", "").trim());
    if (cells.length === 5 && cells[0] === String(pages)) {
      return { typical: Number.parseInt(cells[2], 10), worst: Number.parseInt(cells[3], 10), worstDollars: Number.parseFloat(cells[4].replace("$", "")) };
    }
  }
  throw new Error(`docs/capture-cost.md has no Cap basis row for ${pages} captures`);
}

/** A seconds figure from the document's Inputs table (`**460 s**`), by the row's label. */
function costSeconds(cost: string, label: string): number {
  const found = new RegExp(`\\|\\s*${label}[^|]*\\|\\s*\\*\\*(\\d+) s\\*\\*`).exec(cost);
  if (!found) throw new Error(`docs/capture-cost.md has no Inputs row "${label}"`);
  return Number(found[1]);
}

/** GitHub's price per Windows minute as the document quotes it (`**$0.010**`). */
function costDollarsPerMinute(cost: string): number {
  const found = /Windows 2-core \(x64\) \*\*\$([\d.]+)\*\*/.exec(cost);
  if (!found) throw new Error("docs/capture-cost.md does not state the Windows price per minute");
  return Number(found[1]);
}

const dollars = (minutes: number, rate: number): number => Math.round(minutes * rate * CENTS) / CENTS;

interface BudgetLine { label: string; minutes: number; dollars: number }

/** The lines between `BUDGET:BEGIN` and `BUDGET:END`: `# <label>: <n> runner-minutes, $<d> on a private repository`. */
function budgetLines(workflow: string): BudgetLine[] {
  const block = /# BUDGET:BEGIN[\s\S]*?\n([\s\S]*?)# BUDGET:END/.exec(workflow)?.[1] ?? "";
  return [...block.matchAll(/^#\s+(.+?):\s+([\d,]+) runner-minutes, \$([\d,.]+) on a private repository\s*$/gm)]
    .map((line) => ({ label: line[1], minutes: Number(line[2].replaceAll(",", "")), dollars: Number(line[3].replaceAll(",", "")) }));
}

/** Everything wrong with `workflow` against `cost`, in words. Empty means the example fits its own list and its budget is the document's. */
export function problemsWith(workflow: string, cost: string): string[] {
  const parsed = parse(workflow) as Workflow;
  const problems = cronProblems(parsed.on?.schedule?.[0]?.cron);
  const job = Object.values(parsed.jobs ?? {})[0];
  const step = job?.steps?.find((candidate) => /^a11ign\/a11ign@/.test(candidate.uses ?? ""));
  if (!step) return [...problems, "no step uses a11ign/a11ign"];
  const pages = splitUrlList(step.with?.urls ?? "").length;
  if (pages === 0) return [...problems, "the Action step lists no `urls`"];
  return [...problems, ...stepProblems(step.with ?? {}, pages), ...timeoutProblems(job?.["timeout-minutes"], pages, cost), ...budgetProblems(workflow, pages, cost)];
}

function cronProblems(cron: string | undefined): string[] {
  if (cron === undefined) return ["no `schedule:` trigger with a cron"];
  return validCron(cron) ? [] : [`cron "${cron}" is not a valid five-field numeric cron`];
}

function stepProblems(inputs: Record<string, string>, pages: number): string[] {
  const problems: string[] = [];
  if (Number(inputs["max-pages"]) !== pages) problems.push(`max-pages is ${String(inputs["max-pages"])}, the list has ${pages} URLs`);
  if (String(inputs["comment-on-pr"]) !== "false") problems.push("comment-on-pr is not off, and no pull request exists on a schedule");
  return problems;
}

function timeoutProblems(timeout: number | undefined, pages: number, cost: string): string[] {
  const needed = Math.max(worstMinutes(pages), costRow(cost, pages).worst);
  return typeof timeout === "number" && timeout >= needed ? [] : [`timeout-minutes ${String(timeout)} is under the ${needed} minutes ${pages} captures need at the slowest capture`];
}

function budgetProblems(workflow: string, pages: number, cost: string): string[] {
  const row = costRow(cost, pages);
  const rate = costDollarsPerMinute(cost);
  const lines = budgetLines(workflow);
  const expected = [
    { match: /per run.*worst/, seconds: costSeconds(cost, "worst single capture observed"), minutes: row.worst },
    { match: /per run.*typical/, seconds: costSeconds(cost, "a typical capture"), minutes: row.typical },
    { match: /per month.*worst/, seconds: undefined, minutes: row.worst * RUNS_PER_MONTH },
    { match: /per month.*typical/, seconds: undefined, minutes: row.typical * RUNS_PER_MONTH },
  ];
  const problems = expected.flatMap((want) => budgetLineProblems(want, lines, rate));
  if (lines.some((line) => line.label.startsWith("per month") && !line.label.includes(`${RUNS_PER_MONTH} runs`))) problems.push(`a per-month line does not say ${RUNS_PER_MONTH} runs`);
  if (Math.abs((lines.find((line) => /per run.*worst/.test(line.label))?.dollars ?? Number.NaN) - row.worstDollars) > 0) problems.push(`the per-run worst price is not the document's $${row.worstDollars}`);
  return problems;
}

function budgetLineProblems(want: { match: RegExp; seconds: number | undefined; minutes: number }, lines: BudgetLine[], rate: number): string[] {
  const found = lines.filter((line) => want.match.test(line.label));
  if (found.length !== 1) return [`${found.length} budget lines match ${String(want.match)}, expected exactly one`];
  const [line] = found;
  const out: string[] = [];
  if (line.minutes !== want.minutes) out.push(`"${line.label}" says ${line.minutes} runner-minutes, the cost document gives ${want.minutes}`);
  if (line.dollars !== dollars(want.minutes, rate)) out.push(`"${line.label}" says $${line.dollars}, ${want.minutes} minutes at $${rate} is $${dollars(want.minutes, rate)}`);
  const seconds = /\((\d+) s\)/.exec(line.label)?.[1];
  if (want.seconds !== undefined && Number(seconds) !== want.seconds) out.push(`"${line.label}" names ${String(seconds)} s, the cost document says ${want.seconds} s`);
  return out;
}

/** The docs' "Run it nightly" table rows against the cost document: `pages | typical | worst | month worst | $ month worst`. */
export function docsTableProblems(actionDoc: string, cost: string): string[] {
  const section = /\n## Run it nightly\n([\s\S]*?)\n## /.exec(actionDoc)?.[1];
  if (section === undefined) return ["docs/github-action.md has no \"Run it nightly\" section"];
  const rows = section.split("\n").map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.length === 5 && /^\d+/.test(cells[0]));
  const rate = costDollarsPerMinute(cost);
  const problems = rows.length === 3 ? [] : [`the nightly table has ${rows.length} page-count rows, expected 5, 10 and 25`];
  for (const cells of rows) {
    const pages = Number.parseInt(cells[0], 10);
    const row = costRow(cost, pages);
    const want = [row.typical, row.worst, row.worst * RUNS_PER_MONTH, `$${dollars(row.worst * RUNS_PER_MONTH, rate).toFixed(2)}`].map(String);
    cells.slice(1).forEach((cell, index) => { if (cell !== want[index]) problems.push(`${pages} pages, column ${index + 2}: "${cell}", the cost document gives ${want[index]}`); });
  }
  return problems;
}

const withText = (text: string, from: string, to: string): string => {
  assert.ok(text.includes(from), `the control must be able to find "${from}" to break it`);
  return text.replace(from, to);
};

test("the shipped example fits its own page list, and its budget is the cost document's", () => {
  assert.deepEqual(problemsWith(EXAMPLE, COST), []);
});

test("POSITIVE CONTROL for the emptiness above: the shipped file has ten URLs and four budget lines, so the checks had something to read", () => {
  const step = Object.values((parse(EXAMPLE) as Workflow).jobs ?? {})[0]?.steps?.find((candidate) => /^a11ign\/a11ign@/.test(candidate.uses ?? ""));
  assert.equal(splitUrlList(step?.with?.urls ?? "").length, 10);
  assert.equal(budgetLines(EXAMPLE).length, 4);
  assert.ok(worstMinutes(10) > 20, "ten captures at the worst page do not fit the documented 20 minutes");
});

test("CONTROL: the documented `timeout-minutes: 20` with ten URLs is refused", () => {
  const problems = problemsWith(withText(EXAMPLE, "timeout-minutes: 90", "timeout-minutes: 20"), COST);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /timeout-minutes 20 is under the \d+ minutes 10 captures need/);
});

test("CONTROL: a timeout one minute under the cost document's own slowest-capture cell is refused", () => {
  const cell = costRow(COST, 10).worst;
  assert.deepEqual(problemsWith(withText(EXAMPLE, "timeout-minutes: 90", `timeout-minutes: ${cell - 1}`), COST).length, 1);
  assert.deepEqual(problemsWith(withText(EXAMPLE, "timeout-minutes: 90", `timeout-minutes: ${cell}`), COST), []);
});

test("CONTROL: max-pages not equal to the URL count, comment-on-pr left on, and no schedule are each refused", () => {
  assert.match(problemsWith(withText(EXAMPLE, 'max-pages: "10"', 'max-pages: "5"'), COST).join(), /max-pages is 5, the list has 10 URLs/);
  assert.match(problemsWith(withText(EXAMPLE, 'comment-on-pr: "false"', 'comment-on-pr: "true"'), COST).join(), /comment-on-pr is not off/);
  assert.match(problemsWith(withText(EXAMPLE, "  schedule:\n    - cron:", "  push:\n    - cron:"), COST).join(), /no `schedule:` trigger/);
});

test("CONTROL: a cron that is not five numeric in-range fields is refused, and the shipped one is accepted", () => {
  assert.ok(validCron("17 3 * * *"));
  assert.ok(validCron("*/15 0-6 1,15 * 1-5"));
  for (const bad of ["17 3 * *", "60 3 * * *", "17 24 * * *", "17 3 32 * *", "17 3 * 13 *", "17 3 * * 7", "*/0 * * * *", "5-1 * * * *", "a b c d e"]) assert.equal(validCron(bad), false, bad);
  assert.match(problemsWith(withText(EXAMPLE, '"17 3 * * *"', '"17 25 * * *"'), COST).join(), /not a valid five-field numeric cron/);
});

test("CONTROL: one number changed in the budget comment is refused, in every line and in the capture seconds", () => {
  assert.match(problemsWith(withText(EXAMPLE, "85 runner-minutes", "84 runner-minutes"), COST).join(), /says 84 runner-minutes, the cost document gives 85/);
  assert.match(problemsWith(withText(EXAMPLE, "1950 runner-minutes", "1949 runner-minutes"), COST).join(), /says 1949 runner-minutes/);
  assert.match(problemsWith(withText(EXAMPLE, "$25.50", "$25.00"), COST).join(), /says \$25/);
  assert.match(problemsWith(withText(EXAMPLE, "(460 s)", "(450 s)"), COST).join(), /names 450 s, the cost document says 460 s/);
});

test("CONTROL: the example follows the document, not the other way round -- a cost document with one cell moved refuses the shipped file", () => {
  const moved = withText(COST, "| 10 | 57-77 min | 65 min | 85 min | $0.85 |", "| 10 | 57-77 min | 65 min | 90 min | $0.90 |");
  assert.ok(problemsWith(EXAMPLE, moved).length > 0);
});

test("docs/github-action.md has a Run it nightly section pointing at the example, whose table is the cost document's", () => {
  assert.deepEqual(docsTableProblems(ACTION_DOC, COST), []);
  assert.match(ACTION_DOC, /\(\.\.\/examples\/nightly-workflow\.yml\)/);
  const month = costRow(COST, 10).worst * RUNS_PER_MONTH;
  assert.ok(ACTION_DOC.includes(String(month)), `the docs state the example's ${month} runner-minutes a month`);
});

test("CONTROL: a number changed in the docs table, and a missing section, are refused", () => {
  assert.match(docsTableProblems(withText(ACTION_DOC, "| 10 (the example) | 65 | 85 | 2550 |", "| 10 (the example) | 65 | 85 | 2500 |"), COST).join(), /10 pages, column 4: "2500"/);
  assert.match(docsTableProblems(ACTION_DOC.replace("## Run it nightly", "## Run it weekly"), COST).join(), /has no "Run it nightly" section/);
});
