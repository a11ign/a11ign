/**
 * #4377 (#4084 outcome 4): a criterion referred on at least half of a multi-page run's pages is said once in the summary,
 * with its page count and the reason of its first page. The cases are the row's four, by name, plus the bounds around them.
 */
import { strict as assert } from "node:assert";
import test from "node:test";

import { renderMultiSummary, renderSummary, type MultiPageResult, type PageReport, type RunResult } from "./summary.js";

type Outcome = NonNullable<RunResult["outcomes"]>[number];
const referred = (criterion: string, reason = `reason for ${criterion}`): Outcome => ({ criterion, outcome: "cantTell", reason });
const failed = (criterion: string): Outcome => ({ criterion, outcome: "failed", reason: "asserted", assessor: "rules" });

const runResult = (url: string, outcomes: Outcome[]): RunResult => ({
  url, task: "Read", screenReader: "NVDA", ruleBased: null, outcomes,
  verdict: { taskCompletable: true, summary: "s", findings: [], confidence: 0.8 },
});
const page = (n: number, outcomes: Outcome[]): PageReport =>
  ({ url: `https://p${n}.example/`, status: "captured", results: [runResult(`https://p${n}.example/`, outcomes)] });
const run = (...pages: Outcome[][]): MultiPageResult => ({ multiPage: true, pages: pages.map((outcomes, i) => page(i + 1, outcomes)) });
const summaryOf = (multi: MultiPageResult) => renderMultiSummary(multi, { failOn: "never" });
const ROLL_UP = /left to a person on/g;

test("positive: 1.4.13 referred on all four pages is said once, with '4 of 4 pages' and its first page's reason", () => {
  const md = summaryOf(run(
    [referred("1.4.13", "first page reason")], [referred("1.4.13", "second page reason")], [referred("1.4.13")], [referred("1.4.13")],
  ));
  assert.equal(md.match(ROLL_UP)?.length, 1, "once for the run, not once a page");
  assert.match(md, /- 1\.4\.13 Content on Hover or Focus: left to a person on 4 of 4 pages\. First page's reason: first page reason/);
  assert.doesNotMatch(md, /second page reason/, "only the first page's reason is carried");
});

test("negative: a criterion referred on one page of four is not rolled up", () => {
  const md = summaryOf(run([referred("1.4.13")], [], [], []));
  assert.doesNotMatch(md, ROLL_UP);
});

test("negative: a failed outcome is never rolled up, even on all four pages", () => {
  const md = summaryOf(run([failed("4.1.2")], [failed("4.1.2")], [failed("4.1.2")], [failed("4.1.2")]));
  assert.doesNotMatch(md, ROLL_UP);
});

/** `renderSummary` at origin/main f4377e7bd for the result below, captured by running the pre-change file beside the new one (both agreed). */
const SINGLE_PAGE_BEFORE = "## a11ign — what a screen reader actually experienced\n\n**Page:** https://p1.example/\n**Task:** Read _a label you gave this run, not a finding_\n**Screen reader:** NVDA\n\n**No blocking findings:** none\n\ns\n\n**No lived-experience findings.** The screen-reader layer found nothing it could evidence.\n\n**Not determined:** 2 criteria we cover were referred — worth a person's eyes, the tool cannot decide these on its own — and 0 are not covered by any assessor of ours. Neither is a pass — see the run artifact for the per-criterion reasons.\n\n**Rule layer (axe-core): not run.** Visual criteria such as contrast are *unchecked*, not clean.\n\n<sub>Two layers, deliberately. The screen-reader layer judges the lived experience; axe-core covers the visual and rule-based criteria a screen reader cannot perceive. Neither replaces the other, and neither replaces a human.</sub>";

test("control: a single-page run's summary is byte-identical to the output before this change", () => {
  const single = runResult("https://p1.example/", [referred("1.4.13"), referred("3.2.1")]);
  assert.equal(renderSummary(single, {}), SINGLE_PAGE_BEFORE);
});

test("bound: at least half AND at least three pages -- two pages of two is a pair, not a recurrence", () => {
  assert.doesNotMatch(summaryOf(run([referred("2.4.6")], [referred("2.4.6")])), ROLL_UP);
  const threeOfSix = summaryOf(run([referred("2.4.6")], [referred("2.4.6")], [referred("2.4.6")], [], [], []));
  assert.match(threeOfSix, /left to a person on 3 of 6 pages/, "exactly half, and three, is on the line");
  assert.doesNotMatch(summaryOf(run([referred("2.4.6")], [referred("2.4.6")], [], [], [], [])), ROLL_UP, "two of six is below both");
});

test("a page nobody measured stays in M and never in N", () => {
  const unmeasured: PageReport = { url: "https://p4.example/", status: "failed", results: [], error: "no worker" };
  const multi = run([referred("3.2.1")], [referred("3.2.1")], [referred("3.2.1")]);
  multi.pages.push(unmeasured);
  assert.match(summaryOf(multi), /3\.2\.1 On Focus: left to a person on 3 of 4 pages/);
});

test("a criterion is counted once per page however many form states reported it", () => {
  const multi = run([referred("3.2.1")], [referred("3.2.1")], [referred("3.2.1")]);
  multi.pages[0].results.push(runResult("https://p1.example/", [referred("3.2.1")]));
  assert.match(summaryOf(multi), /left to a person on 3 of 3 pages/);
});

test("nothing is dropped: every page keeps its own count of referred criteria beside the roll-up", () => {
  const md = summaryOf(run([referred("1.4.13")], [referred("1.4.13")], [referred("1.4.13")]));
  assert.equal(md.match(/\*\*Not determined:\*\* 1 criteria we cover were referred/g)?.length, 3);
});
