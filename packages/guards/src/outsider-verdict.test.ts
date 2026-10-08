/**
 * THE OUTSIDER VERDICT'S WINDOW OUTLASTS THE POLL'S WORST GAP (#4059, found by #3224).
 *
 * `outsiderVerdict` calls a release `absent` ("the rehearsal did not run") once it is older than `WINDOW_MS` with no run. The window
 * was 9 h; the outside repository's scheduled poll was MEASURED with a worst gap of 9.3 h (20 gaps, 2026-10-08), so a publish just after
 * a poll was called `absent` while the next poll was still on its way. Nothing in this repository tested `outsiderVerdict` before.
 *
 * #4163 adds `promotedAt`: the age runs from the later of publish and promotion, tested at the bottom.
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

// #4163 (found by #4160): the clock starts when the poll could first see the release, the later of publish and promotion to `latest`.
// a11ign@0.3.2 was published 2026-10-07T23:59:49Z and promoted 2026-10-08T14:23:14Z; at 15:38Z it read `absent`, 1.2 h after the poll could see it.
const PUBLISHED_032 = "2026-10-07T23:59:49.178Z";
const PROMOTED_032 = "2026-10-08T14:23:14Z";
const TAG_032 = "cde359831fc072b5a1c85bec596cf0423f6ae44a";
const at032 = (now: string, promotedAt?: string | null) =>
  outsiderVerdict({ latest: "0.3.2", tagSha: TAG_032, publishedAt: PUBLISHED_032, promotedAt, now, runs: [] });

test("a release promoted long after its publish is aged from the promotion: the 0.3.2 reading is pending", () => {
  assert.equal(at032("2026-10-08T15:38:00Z", PROMOTED_032).verdict, "pending");
});

test("positive control: the same release more than the window after its PROMOTION is absent", () => {
  assert.equal(at032(hoursAfter(PROMOTED_032, WINDOW_MS / HOUR_MS + 0.1), PROMOTED_032).verdict, "absent");
  assert.equal(at032(hoursAfter(PROMOTED_032, WINDOW_CEILING_H), PROMOTED_032).verdict, "absent");
});

test("a promotion EARLIER than the publish does not move the clock back", () => {
  const early = "2026-10-07T12:00:00Z";
  // 6 h after the publish is 18 h after `early`: aged from the promotion it would be absent, from the later of the two it is pending.
  assert.equal(at032(hoursAfter(PUBLISHED_032, 6), early).verdict, "pending");
  assert.equal(at032(hoursAfter(PUBLISHED_032, WINDOW_MS / HOUR_MS + 0.1), early).verdict, "absent");
});

test("a missing promotedAt behaves as today, and the reason says the promotion time was not found", () => {
  for (const promotedAt of [undefined, null, ""]) {
    const result = at032("2026-10-08T15:38:00Z", promotedAt);
    assert.equal(result.verdict, "absent", "aged from the publish: absence is not 'promoted at publish', and it is not 'just promoted' either");
    assert.match(result.reason, /promotion time was not found/);
  }
  assert.equal(at032(hoursAfter(PUBLISHED_032, 1), undefined).verdict, "pending");
  assert.doesNotMatch(at032("2026-10-08T15:38:00Z", PROMOTED_032).reason, /not found/);
});

test("an unreadable promotedAt throws rather than guessing", () => {
  assert.throws(() => at032("2026-10-08T15:38:00Z", "yesterday-ish"), /promotion time/);
});
