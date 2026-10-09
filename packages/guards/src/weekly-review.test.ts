/**
 * `scripts/weekly-review.ts` files one "Weekly outsider review" row per ISO week. Every decision in it is a pure function, and four
 * things have to hold or the row says something false:
 *   1. THE WEEK IS THE ISO WEEK OF ITS THURSDAY, so a year boundary neither files two rows for one week nor skips one, and a re-run of
 *      the same week files nothing (idempotence is the only thing stopping a daily schedule from filing seven rows).
 *   2. THE QUESTIONS ARE READ, NEVER TYPED: `extractRequirements` / `extractQuestions` take the numbered list out of the documents as
 *      they say it now, join wrapped lines, stop at the end of the list, and REFUSE a document with no anchor or an empty list.
 *   3. AN EMPTY INELIGIBLE LIST OVER CLOSED ROWS IS REFUSED: published, it would tell every session it may review its own work.
 *   4. LAST WEEK'S READER IS CHECKED AGAINST LAST WEEK'S LIST, once, and silence is not read as eligibility on a closed row.
 *
 * THE POSITIVE CONTROLS are the paired inputs: a Thursday-year case beside an ordinary week, a list that extracts beside the documents
 * that do not, a window with builders beside the empty one, a reader that is listed beside one that is not.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const review = await import(pathToFileURL(join(REPO_ROOT, "scripts/weekly-review.ts")).href);
const {
  TITLE_PREFIX, FILING_SESSION, FIRST_REVIEW_WAITS_ON, isoWeek, isoWeekLabel, reviewTitle, filingPlan, reviewWindow,
  extractRequirements, extractQuestions, ineligibleSessions, eligible, buildBody, bodyReadFromSources,
  ineligibleFromBody, readerFrom, recheckLastWeek, rowFileArgs,
} = review;

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const NUMBERED_REQUIREMENTS = [
  "Intro text.", "", "**Three requirements** hold for every release:", "",
  "1. The package installs from the registry", "   with no extra flags.", "2. The report opens in a browser.",
  "3. Nothing in it names a private host.", "", "Closing paragraph.", "4. never reached",
].join("\n");
const TRY_IT = ["# Try it", "", "## What we would like back", "", "1. Did the install work?", "2. Was the report readable?", "", "## Thanks"].join("\n");

test("isoWeek: a date belongs to the year of its Thursday, so the year boundary is one week not two", () => {
  assert.deepEqual(isoWeek(utc("2026-12-31")), { year: 2026, week: 53 });
  assert.deepEqual(isoWeek(utc("2027-01-01")), { year: 2026, week: 53 });
  assert.deepEqual(isoWeek(utc("2027-01-03")), { year: 2026, week: 53 }); // the Sunday still closes week 53
  assert.deepEqual(isoWeek(utc("2027-01-04")), { year: 2027, week: 1 }); // the next Monday opens week 1
  assert.deepEqual(isoWeek(utc("2024-12-30")), { year: 2025, week: 1 }); // a December date in the NEXT year's week
});

test("isoWeek: Monday and Sunday of one ordinary week agree, and the next Monday moves on", () => {
  assert.deepEqual(isoWeek(utc("2026-09-28")), { year: 2026, week: 40 });
  assert.deepEqual(isoWeek(utc("2026-10-04")), { year: 2026, week: 40 });
  assert.deepEqual(isoWeek(utc("2026-10-05")), { year: 2026, week: 41 });
});

test("isoWeek: the UTC calendar date decides, not the time of day", () => {
  assert.deepEqual(isoWeek(new Date("2026-10-04T23:59:59Z")), { year: 2026, week: 40 });
  assert.deepEqual(isoWeek(new Date("2026-10-05T00:00:00Z")), { year: 2026, week: 41 });
});

test("isoWeekLabel pads the week to two digits and reviewTitle prefixes it", () => {
  assert.equal(isoWeekLabel(utc("2026-01-05")), "2026-W02");
  assert.equal(isoWeekLabel(utc("2026-09-28")), "2026-W40");
  assert.equal(reviewTitle(utc("2026-09-28")), `${TITLE_PREFIX} 2026-W40`);
  assert.equal(reviewTitle(utc("2026-09-28")), "Weekly outsider review 2026-W40");
});

test("filingPlan files when this week's title is absent and refuses a second filing when it is present", () => {
  const date = utc("2026-09-30");
  const absent = filingPlan({ date, existingTitles: ["Weekly outsider review 2026-W39", "Unrelated row"] });
  assert.equal(absent.file, true);
  assert.equal(absent.title, "Weekly outsider review 2026-W40");
  assert.match(absent.reason, /no row titled "Weekly outsider review 2026-W40" exists; filing it/);

  const present = filingPlan({ date, existingTitles: ["Weekly outsider review 2026-W40"] });
  assert.equal(present.file, false);
  assert.match(present.reason, /already filed; nothing to do/);

  assert.equal(filingPlan({ date, existingTitles: [] }).file, true);
});

test("reviewWindow is the seven days ending at the date, as calendar dates", () => {
  assert.deepEqual(reviewWindow(new Date("2026-10-07T13:45:00Z")), { since: "2026-09-30", until: "2026-10-07" });
  assert.deepEqual(reviewWindow(new Date("2027-01-03T00:00:00Z")), { since: "2026-12-27", until: "2027-01-03" });
});

test("extractRequirements reads the list under the bold line, joins wrapped lines, and stops where the list ends", () => {
  assert.deepEqual(extractRequirements(NUMBERED_REQUIREMENTS), [
    { n: 1, text: "The package installs from the registry with no extra flags." },
    { n: 2, text: "The report opens in a browser." },
    { n: 3, text: "Nothing in it names a private host." },
  ]);
});

test("extractRequirements does not pin the count: whatever is listed is what is asked", () => {
  const two = "**Two requirements** apply:\n1. one thing\n2. another thing\n";
  assert.deepEqual(extractRequirements(two).map((item: { n: number }) => item.n), [1, 2]);
});

test("extractRequirements refuses a document without the anchor, naming the anchor", () => {
  assert.throws(() => extractRequirements("# RELEASE\n\n1. a list with no bold anchor\n"), /found no "requirements list"/);
});

test("extractRequirements refuses an anchor over a list with no numbered item", () => {
  assert.throws(() => extractRequirements("**Four requirements** follow:\n\nProse only.\n"), /"requirements list" is present but holds no numbered item/);
});

test("extractQuestions reads the list under 'What we would like back' and ignores the sections around it", () => {
  assert.deepEqual(extractQuestions(TRY_IT), [
    { n: 1, text: "Did the install work?" },
    { n: 2, text: "Was the report readable?" },
  ]);
});

test("extractQuestions refuses a document whose heading was renamed", () => {
  assert.throws(() => extractQuestions(TRY_IT.replace("What we would like back", "Feedback")), /found no "questions list"/);
});

test("ineligibleSessions unions labels and claim records, sorts, and lists rows with no builder", () => {
  const rows = [
    { number: 1, sessionLabels: ["worker-b"], claimedBy: ["worker-a"] },
    { number: 2, sessionLabels: ["worker-a"] },
    { number: 3, sessionLabels: [], claimedBy: [] },
    { number: 4, sessionLabels: [] },
  ];
  assert.deepEqual(ineligibleSessions(rows), { builders: ["worker-a", "worker-b"], unattributed: [3, 4] });
});

test("ineligibleSessions: a window with no closed rows is an honest empty list, not a refusal", () => {
  assert.deepEqual(ineligibleSessions([]), { builders: [], unattributed: [] });
});

test("ineligibleSessions refuses closed rows that name no builder at all", () => {
  assert.throws(
    () => ineligibleSessions([{ number: 7, sessionLabels: [] }, { number: 8, sessionLabels: [], claimedBy: [] }]),
    /2 rows closed in the window and not one names a builder/,
  );
});

test("eligible is false for a builder and true for anyone else", () => {
  assert.equal(eligible("worker-a", ["worker-a", "worker-b"]), false);
  assert.equal(eligible("worker-c", ["worker-a", "worker-b"]), true);
  assert.equal(eligible("worker-c", []), true);
});

const SOURCES = { requirements: extractRequirements(NUMBERED_REQUIREMENTS), questions: extractQuestions(TRY_IT) };
const bodyInput = (overrides: Record<string, unknown> = {}) => ({
  label: "2026-W40", window: { since: "2026-09-30", until: "2026-10-07" }, closedCount: 12,
  builders: ["worker-a", "worker-b"], unattributed: [] as number[], ...SOURCES,
  commit: "0123456789ab", waitsOnOutsiderRepo: false, ...overrides,
});

test("buildBody carries the week, the window, the builders and both lists read from the sources", () => {
  const body = buildBody(bodyInput());
  assert.match(body, /The weekly outsider review for 2026-W40/);
  assert.match(body, /2026-09-30 to 2026-10-07 \(seven days\): 12 rows closed\./);
  assert.match(body, /^Ineligible: `worker-a`, `worker-b`$/m);
  assert.match(body, /## The requirements, read from RELEASE\.md at `0123456789ab`/);
  assert.match(body, /^1\. The package installs from the registry with no extra flags\.$/m);
  assert.match(body, /^2\. Was the report readable\?$/m);
  assert.match(body, /^none -- its deliverable is not a commit$/m);
  assert.match(body, /--search "Weekly outsider review 2026-W40 in:title"/);
});

test("buildBody adds the Waiting-for line only while the outsider repository row is open", () => {
  assert.doesNotMatch(buildBody(bodyInput()), /Waiting-for:/);
  assert.match(buildBody(bodyInput({ waitsOnOutsiderRepo: true })), new RegExp(`^Waiting-for: closed #${FIRST_REVIEW_WAITS_ON}$`, "m"));
});

test("buildBody says 'none' for an empty builder list and names unattributed rows", () => {
  assert.match(buildBody(bodyInput({ builders: [] })), /^Ineligible: none$/m);
  const body = buildBody(bodyInput({ unattributed: [3166, 4001] }));
  assert.match(body, /NO builder readable.*#3166, #4001/);
  assert.doesNotMatch(buildBody(bodyInput()), /NO builder readable/);
});

test("bodyReadFromSources accepts a body built from the sources and refuses one that drifted", () => {
  assert.equal(bodyReadFromSources(buildBody(bodyInput()), SOURCES), null);

  const reworded = { ...SOURCES, questions: [{ n: 1, text: "Did the install work on your machine?" }, SOURCES.questions[1]] };
  const refusal = bodyReadFromSources(buildBody(bodyInput()), reworded);
  assert.match(refusal, /REFUSING -- 1 item\(s\)/);
  assert.match(refusal, /first: "Did the install work on your machine\?\.\.\."/);
});

test("bodyReadFromSources truncates the quoted item and counts every missing one", () => {
  const long = "x".repeat(100);
  const refusal = bodyReadFromSources("a body with nothing", { requirements: [{ n: 1, text: long }], questions: [{ n: 1, text: "q" }] });
  assert.match(refusal, /REFUSING -- 2 item\(s\)/);
  assert.ok(refusal.includes(`"${"x".repeat(60)}..."`));
  assert.ok(!refusal.includes("x".repeat(61)));
});

test("ineligibleFromBody reads the Ineligible line back, and answers null for a body that has none", () => {
  assert.deepEqual(ineligibleFromBody(buildBody(bodyInput())), ["worker-a", "worker-b"]);
  assert.deepEqual(ineligibleFromBody(buildBody(bodyInput({ builders: [] }))), []);
  assert.equal(ineligibleFromBody("A row somebody wrote by hand."), null);
});

test("readerFrom takes the LAST stated Reviewer-session across comments, with or without backticks", () => {
  assert.equal(readerFrom(["Reviewer-session: worker-a", "noise", "reviewer-session: `worker-c.1`"]), "worker-c.1");
  assert.equal(readerFrom(["first line\nReviewer-session: worker-a\nsecond"]), "worker-a");
  assert.equal(readerFrom(["no statement here", "Reviewed-by: worker-a"]), null);
  assert.equal(readerFrom([]), null);
});

const lastRow = (overrides: Record<string, unknown> = {}) => ({
  body: buildBody(bodyInput()), comments: [] as string[], closed: true, ...overrides,
});

test("recheckLastWeek comments when the reader was one of the row's own builders", () => {
  const { comment } = recheckLastWeek(lastRow({ comments: ["Reviewer-session: worker-a"] }));
  assert.match(comment, /^Re-check: the reader `worker-a` is in this row's own ineligible list/);
  assert.match(comment, /\(`worker-a`, `worker-b`\)/);
  assert.match(comment, /does not reopen the row/);
});

test("recheckLastWeek stays silent for an eligible reader, and for a comment it has already made", () => {
  assert.deepEqual(recheckLastWeek(lastRow({ comments: ["Reviewer-session: worker-z"] })), { comment: null });
  assert.deepEqual(recheckLastWeek(lastRow({ comments: ["Reviewer-session: worker-a", "Re-check: already said"] })), { comment: null });
});

test("recheckLastWeek says out loud that a CLOSED row stated no reader, and says nothing on an open one", () => {
  const closed = recheckLastWeek(lastRow({ comments: ["findings filed"] }));
  assert.match(closed.comment, /closed without a `Reviewer-session:` line/);
  assert.deepEqual(recheckLastWeek(lastRow({ comments: ["findings filed"], closed: false })), { comment: null });
});

test("recheckLastWeek ignores a row this script did not file (no Ineligible line)", () => {
  assert.deepEqual(recheckLastWeek({ body: "hand-written", comments: ["Reviewer-session: worker-a"], closed: true }), { comment: null });
});

test("rowFileArgs files through agent-org row-file as the schedule, ready, out of release, from a body file", () => {
  assert.deepEqual(rowFileArgs("Weekly outsider review 2026-W40", "/tmp/body.md"), [
    "exec", "agent-org", "row-file", `--session=${FILING_SESSION}`, "--ready",
    "--label", "out-of-release", "--title", "Weekly outsider review 2026-W40", "--body-file", "/tmp/body.md",
  ]);
  assert.equal(FILING_SESSION, "weekly-review-schedule");
});
