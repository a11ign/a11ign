// "WHAT THIS RUN PRESSED" (ADR 0038, Constraint 7, "how a user is told", place 2), in the printed report and the Action's summary.
//
// The list is the WHOLE list on an authenticated run, by accessible name, and never a value. It must not appear on any other
// run, where the heading would claim a completeness the probes do not have.
import { test } from "node:test";
import assert from "node:assert/strict";

import { pressedSection, reportLines, type Report } from "../report.js";
import { pressedSummaryLines, renderSummary, type RunResult } from "../action/summary.js";

const BASE: Report = { url: "https://app.example.test/orders", task: "read", screenReader: "NVDA", announcements: 3, axe: null };

test("the printed report lists what an authenticated run pressed, headed, by name", () => {
  const lines = reportLines({ ...BASE, pressed: ["Sign in", "Remember me"] }).join("\n");
  assert.match(lines, /What this run pressed \(an authenticated run presses only what its files name\):\n {2}- Sign in\n {2}- Remember me/);
});

test("an authenticated run that names nothing to press says so: the absence is the finding", () => {
  assert.match(reportLines({ ...BASE, pressed: [] }).join("\n"), /What this run pressed.*\n {2}\(nothing: automatic pressing and link-following are off\)/);
  assert.deepEqual(pressedSection([]).length, 2);
});

test("a run that is not authenticated prints no such heading", () => {
  assert.ok(!reportLines(BASE).join("\n").includes("What this run pressed"));
  assert.deepEqual(pressedSection(undefined), []);
  assert.deepEqual(pressedSummaryLines(undefined), []);
});

test("the Action's summary lists them too, in its own markup", () => {
  assert.deepEqual(pressedSummaryLines(["Sign in"]), ["", "**What this run pressed** (an authenticated run presses only what its files name):", "- Sign in"]);
  assert.match(pressedSummaryLines([]).join("\n"), /nothing: automatic pressing and link-following are off/);
});

const RESULT: RunResult = {
  url: "https://app.example.test/orders", task: "read", screenReader: "NVDA", transcript: ["Dashboard"], ruleBased: [],
  verdict: { taskCompletable: true, summary: "A summary.", findings: [], confidence: 0.9 },
};

test("renderSummary carries the list for an authenticated result, and nothing for any other", () => {
  assert.match(renderSummary({ ...RESULT, pressed: ["Sign in"] }), /\*\*What this run pressed\*\* \(an authenticated run presses only what its files name\):\n- Sign in/);
  assert.match(renderSummary({ ...RESULT, pressed: [] }), /- nothing: automatic pressing and link-following are off/);
  assert.ok(!renderSummary(RESULT).includes("What this run pressed"));
});
