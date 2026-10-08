/**
 * THE OUTSIDER VERDICT'S WINDOW OUTLASTS THE POLL'S WORST GAP (#4059, found by #3224).
 *
 * `outsiderVerdict` calls a release `absent` ("the rehearsal did not run") once it is older than `WINDOW_MS` with no run. The window
 * was 9 h; the outside repository's scheduled poll was MEASURED with a worst gap of 9.3 h (20 gaps, 2026-10-08), so a publish just after
 * a poll was called `absent` while the next poll was still on its way. Nothing in this repository tested `outsiderVerdict` before.
 *
 * Positive controls: every `pending` case below is paired with an `absent` one past the same window, so a window that grew without
 * bound (always `pending`) or a reader that threw away its runs would break a test of its own.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const { outsiderVerdict, outsiderRunTitle, WINDOW_MS } = await import(pathToFileURL(`${REPO}scripts/outsider/verdict.mjs`).href);

const HOUR_MS = 3_600_000;
const SHA = "a".repeat(40);
const PUBLISHED = "2026-10-08T00:00:00Z";
/** The worst gap between two scheduled polls on the outside repository, 2026-10-08 (verdict.mjs). */
const WORST_POLL_GAP_H = 9.3;
/** Two days with no run is absent however the window is tuned: the ceiling that stops "widen it" becoming "never say absent". */
const WINDOW_CEILING_H = 48;

const hoursAfter = (start: string, hours: number) => new Date(Date.parse(start) + hours * HOUR_MS).toISOString();
const verdictAt = (hours: number, runs: unknown[] = [], latest = "0.3.1") =>
  outsiderVerdict({ latest, tagSha: SHA, publishedAt: PUBLISHED, now: hoursAfter(PUBLISHED, hours), runs });

test("a version published just after a poll is pending, not absent, when the next poll comes 9.3 h later", () => {
  assert.equal(verdictAt(WORST_POLL_GAP_H).verdict, "pending");
});

test("the window leaves room for the run itself after the worst gap (the green job took 6:07 at most)", () => {
  const worstRunH = 7 / 60;
  assert.equal(verdictAt(WORST_POLL_GAP_H + worstRunH).verdict, "pending");
  assert.ok(WINDOW_MS >= 10 * HOUR_MS, "the row's floor: 9.3 h + 0.1 h, rounded up to 10 h");
});

test("positive control: past the window with no run is still absent", () => {
  assert.equal(verdictAt(WINDOW_MS / HOUR_MS + 0.1).verdict, "absent");
  // A fixed age too: the line above follows the constant, so a window that grew without bound would move with it.
  assert.equal(verdictAt(WINDOW_CEILING_H).verdict, "absent");
});

test("a run dispatched by the poll that came 9.3 h later is read, not discarded for the lateness", () => {
  const run = { displayTitle: outsiderRunTitle({ version: "0.3.1", sha: SHA }), status: "completed", conclusion: "success", createdAt: hoursAfter(PUBLISHED, WORST_POLL_GAP_H) };
  assert.equal(verdictAt(WORST_POLL_GAP_H + 0.1, [run]).verdict, "green");
});

test("a release superseded as latest before any poll is never asked about, so it is never absent", () => {
  // a11ign@0.3.0 was promoted 51 s after a poll and superseded by 0.3.1 before the next: no run is named for it, and the reader is
  // asked about `latest` = 0.3.1, whose own run decides. Asked while 0.3.1 is still inside the window it is pending, never absent.
  const runForNewest = { displayTitle: outsiderRunTitle({ version: "0.3.1", sha: SHA }), status: "completed", conclusion: "success", createdAt: hoursAfter(PUBLISHED, 2) };
  assert.equal(verdictAt(3, [runForNewest], "0.3.1").verdict, "green");
  assert.equal(verdictAt(3, [], "0.3.1").verdict, "pending");
  // The other half: a run named for the superseded version answers nothing about the newest one.
  const runForSuperseded = { ...runForNewest, displayTitle: outsiderRunTitle({ version: "0.3.0", sha: SHA }) };
  assert.equal(verdictAt(3, [runForSuperseded], "0.3.1").verdict, "pending");
});
