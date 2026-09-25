// "WHAT THIS RUN PRESSED" (ADR 0038, Constraint 7, "how a user is told", place 2), in the printed report and the Action's summary.
//
// The list is the WHOLE list on an authenticated run, by accessible name, and never a value. It must not appear on any other
// run, where the heading would claim a completeness the probes do not have.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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

// The report is built in cli.ts, which cannot be run to a report here (the judge needs a Python scorer). So the wiring is
// read where it lives: BOTH report paths (--json and printed) must hand the run's forms state to the list, or an
// authenticated run with a forms config under-states what it pressed (reviewer-2 on #2376). The count is the positive control.
test("cli.ts builds the pressed list from the run's forms state on BOTH report paths", () => {
  const source = readFileSync(new URL("../cli.ts", import.meta.url), "utf8");
  const calls = source.match(/pressedByThisRun\([^)]*\)/g) ?? [];
  assert.equal(calls.length, 2, "the --json path and the printed path");
  assert.deepEqual(calls.filter((call) => !call.includes("formState")), [], "every call passes formState");
});
