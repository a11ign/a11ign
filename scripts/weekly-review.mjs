#!/usr/bin/env node
// @ts-check
// command: file this ISO week's "Weekly outsider review" row, built from RELEASE.md and docs/try-it.md and naming the sessions that are ineligible to do it
//
// THE JUDGEMENT HALF OF THE V1 REHEARSAL, AS A SCHEDULE AND NEVER A GATE (chairman's direction, #928, #3183).
// Four of the five defects the first rehearsal found were judgements about what the report SAYS, which no
// automated job reads; one weekly row is how a stranger gets to read it. `docs/weekly-review.md` is how the
// reviewer works; `docs/adr/` carries the trade (findings arrive up to seven days after a release).
//
// EVERYTHING WITH A DECISION IN IT IS A PURE FUNCTION over data its caller reads, so the test needs no network:
// the week, the idempotency, the extraction, the ineligible list, the body's faithfulness to its sources, and
// the next week's re-check. `main` only reads GitHub and the two documents, and hands the result on.
//
// THE BODY CARRIES NO TEXT OF ITS OWN ABOUT WHAT THE REVIEW CHECKS. The requirements and the questions are read
// out of RELEASE.md and docs/try-it.md at the commit the run checked out, so a rewording of either can never
// leave the row asking the old question. `bodyReadFromSources` refuses a body that does not hold what the files
// say now.
//
// IT FILES THROUGH `agent-org row-file`, never `gh issue create`: the body is born valid under the filing
// contract (a reading row declares `Region: none -- its deliverable is not a commit`). A body that cannot
// satisfy that contract is a finding for a11ign/agent-org, not a reason to go round it.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { refuseUnknownFlags } from "@a11ign/screenreader-fleet/cli-flags";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PRODUCT_REPO = "a11ign/a11ign";
const MS_PER_DAY = 86_400_000;
const WINDOW_DAYS = 7;
const THURSDAY = 4;
const DAYS_PER_WEEK = 7;
const SHORT_SHA = 12;
const QUOTE_CHARS = 60;
const MAX_GH_OUTPUT_BYTES = 67_108_864;

export const TITLE_PREFIX = "Weekly outsider review";
/** The session `Filed-by:` names: the schedule, which is nobody's session and may not be mistaken for one. */
export const FILING_SESSION = "weekly-review-schedule";
/** The one row the first review is behind (#3183): the outsider repository it clones. Waited on only while open. */
export const FIRST_REVIEW_WAITS_ON = 3182;

// ---- the week -------------------------------------------------------------------------------------------

/**
 * The ISO 8601 week-year and week of a date, in UTC. The week belongs to the year of ITS THURSDAY, which is
 * what makes 2026-12-31 week 53 of 2026 and 2027-01-01 the same week rather than week 1 of 2027.
 * @param {Date} date
 * @returns {{ year: number, week: number }}
 */
export function isoWeek(date) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = day.getUTCDay() || DAYS_PER_WEEK;
  day.setUTCDate(day.getUTCDate() + THURSDAY - weekday);
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((day.getTime() - yearStart) / MS_PER_DAY + 1) / DAYS_PER_WEEK);
  return { year: day.getUTCFullYear(), week };
}

/** `2026-W40`. @param {Date} date */
export function isoWeekLabel(date) {
  const { year, week } = isoWeek(date);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** @param {Date} date */
export const reviewTitle = (date) => `${TITLE_PREFIX} ${isoWeekLabel(date)}`;

/**
 * THE FILING IS IDEMPOTENT: a list already holding this week's title files nothing, and says so.
 * @param {{ date: Date, existingTitles: string[] }} input
 * @returns {{ file: boolean, title: string, reason: string }}
 */
export function filingPlan({ date, existingTitles }) {
  const title = reviewTitle(date);
  if (existingTitles.includes(title)) {
    return { file: false, title, reason: `"${title}" is already filed; nothing to do.` };
  }
  return { file: true, title, reason: `no row titled "${title}" exists; filing it.` };
}

/**
 * The seven days ending at `date`, as the two calendar dates a search takes.
 * @param {Date} date
 * @returns {{ since: string, until: string }}
 */
export function reviewWindow(date) {
  const until = date.toISOString().slice(0, "YYYY-MM-DD".length);
  const since = new Date(date.getTime() - WINDOW_DAYS * MS_PER_DAY).toISOString().slice(0, until.length);
  return { since, until };
}

// ---- reading the two documents -------------------------------------------------------------------------

/**
 * Every item of the numbered list that starts at `fromLine`, text joined across its wrapped lines. An item
 * ends at the next numbered item, or at the first unindented line that is not blank.
 * @param {string[]} lines @param {number} fromLine
 * @returns {{ n: number, text: string }[]}
 */
function numberedItemsFrom(lines, fromLine) {
  /** @type {{ n: number, text: string }[]} */
  const items = [];
  for (const line of lines.slice(fromLine)) {
    const item = /^(\d+)\.\s+(.*)$/.exec(line);
    if (item) items.push({ n: Number(item[1]), text: item[2].trim() });
    else if (items.length > 0 && /^\s+\S/.test(line)) items[items.length - 1].text += ` ${line.trim()}`;
    else if (items.length > 0 && line.trim() !== "") break;
  }
  return items;
}

/** @param {string} markdown @param {RegExp} anchor @param {string} what */
function itemsAfter(markdown, anchor, what) {
  const lines = markdown.split("\n");
  const at = lines.findIndex((line) => anchor.test(line));
  if (at === -1) throw new Error(`weekly-review: found no "${what}" in the document read (anchor ${anchor}).`);
  const items = numberedItemsFrom(lines, at + 1);
  if (items.length === 0) throw new Error(`weekly-review: "${what}" is present but holds no numbered item.`);
  return items;
}

/**
 * RELEASE.md's requirements, as written there now: the numbered list under the bold line that says "<N>
 * requirements". The number is not pinned here; whatever is listed is what is asked.
 * @param {string} releaseMd
 */
export const extractRequirements = (releaseMd) =>
  itemsAfter(releaseMd, /^\*\*[A-Za-z]+ requirements\b/, "requirements list");

/** docs/try-it.md's questions: the numbered list under "What we would like back". @param {string} tryItMd */
export const extractQuestions = (tryItMd) =>
  itemsAfter(tryItMd, /^##\s+What we would like back\s*$/, "questions list");

// ---- who built the window's work -----------------------------------------------------------------------

/**
 * @typedef {{ number: number, sessionLabels: string[], claimedBy?: string[] }} ClosedRow
 *   `sessionLabels` are the row's `session:<name>` labels with the prefix removed; `claimedBy` are the sessions its
 *   claim-record comments name, which outlive the label (#3166 closed with its label gone).
 */

/** @param {ClosedRow} row */
const buildersOf = (row) => [...new Set([...row.sessionLabels, ...(row.claimedBy ?? [])])];

/**
 * THE INELIGIBLE LIST: the sessions that built the rows closed in the window, from their `session:` labels and,
 * where the label is gone, from the claim record. A window with closed rows and an EMPTY list is REFUSED: it
 * would tell every session it may review, and the cause is the reading having failed, not the work having had
 * no builder.
 * @param {ClosedRow[]} closedRows
 * @returns {{ builders: string[], unattributed: number[] }}
 */
export function ineligibleSessions(closedRows) {
  const builders = [...new Set(closedRows.flatMap(buildersOf))].sort();
  const unattributed = closedRows.filter((row) => buildersOf(row).length === 0).map((row) => row.number);
  if (closedRows.length > 0 && builders.length === 0) {
    throw new Error(`weekly-review: ${closedRows.length} rows closed in the window and not one names a builder; `
      + "refusing to publish an empty ineligible list (it would make every session eligible).");
  }
  return { builders, unattributed };
}

/**
 * @param {string} session @param {string[]} builders
 * @returns {boolean} true when `session` built none of the window's work and may review it
 */
export const eligible = (session, builders) => !builders.includes(session);

// ---- the body ------------------------------------------------------------------------------------------

/** @param {{ n: number, text: string }[]} items */
const numbered = (items) => items.map(({ n, text }) => `${n}. ${text}`).join("\n");

/** @param {string[]} builders */
const sessionList = (builders) => (builders.length > 0 ? builders.map((s) => `\`${s}\``).join(", ") : "none");

/**
 * @typedef {object} BodyInput
 * @property {string} label ISO week, `2026-W40`
 * @property {{ since: string, until: string }} window
 * @property {number} closedCount rows closed in the window
 * @property {string[]} builders
 * @property {number[]} unattributed closed rows whose builder could not be read
 * @property {{ n: number, text: string }[]} requirements read from RELEASE.md
 * @property {{ n: number, text: string }[]} questions read from docs/try-it.md
 * @property {string} commit the commit the two documents were read at
 * @property {boolean} waitsOnOutsiderRepo
 */

/** @param {BodyInput} input */
function windowSection({ window, closedCount, builders, unattributed }) {
  const unknown = unattributed.length > 0
    ? `\n\nClosed with NO builder readable (label gone, no claim record): ${unattributed.map((n) => `#${n}`).join(", ")}. `
      + "Whoever built those is not on the list below and is ineligible all the same; ask before taking the row."
    : "";
  return [
    "## The window", "",
    `${window.since} to ${window.until} (seven days): ${closedCount} rows closed.${unknown}`, "",
    "## Ineligible: the sessions that built the window's work", "",
    `Ineligible: ${sessionList(builders)}`, "",
    "A builder cannot read the output as a stranger: they supply the missing context without noticing. "
      + "**Your reading must state `Reviewer-session: <your session>` and that it is not in the list above.** "
      + "Next week's run checks it and comments here if it was.",
  ].join("\n");
}

/** @param {BodyInput} input */
export function buildBody(input) {
  const wait = input.waitsOnOutsiderRepo ? `\nWaiting-for: closed #${FIRST_REVIEW_WAITS_ON}\n` : "";
  return [
    "## What it is", "",
    `The weekly outsider review for ${input.label}, filed by \`.github/workflows/weekly-review.yml\`. How a reviewer `
      + "works is in `docs/weekly-review.md`. **It is a review and never a gate**: nothing waits on it and releases "
      + "keep flowing; its findings are filed as rows, never fixed in place.", "",
    windowSection(input), "",
    `## The requirements, read from RELEASE.md at \`${input.commit}\``, "",
    numbered(input.requirements), "",
    `## The questions, read from docs/try-it.md at \`${input.commit}\``, "",
    numbered(input.questions), "",
    "## Region", "", "none -- its deliverable is not a commit", "",
    "## Acceptance: none — the deliverable is the written reading on this row, with every finding filed as its own row",
    "",
    "## Open-check", "", "```",
    `$ gh issue list --repo ${PRODUCT_REPO} --state all --search "${TITLE_PREFIX} ${input.label} in:title" --json number --jq length`,
    "0", "```", "",
    `Measured by the filing run at ${input.commit}: no row of this title existed.${wait}`,
  ].join("\n");
}

/**
 * A BODY THAT CARRIES A LITERAL COPY NOT READ FROM THE FILES IS REFUSED: every requirement and question as the
 * files say it NOW must appear in the body, so text typed into a template cannot stand in for the read.
 * @param {string} body
 * @param {{ requirements: { n: number, text: string }[], questions: { n: number, text: string }[] }} sources
 * @returns {string | null}
 */
export function bodyReadFromSources(body, { requirements, questions }) {
  const missing = [...requirements, ...questions].filter(({ text }) => !body.includes(text));
  if (missing.length === 0) return null;
  return `weekly-review: REFUSING -- ${missing.length} item(s) the documents say now are not in the body `
    + `(first: "${missing[0].text.slice(0, QUOTE_CHARS)}..."). The body must be read from the files, never copied.`;
}

// ---- the next week's re-check --------------------------------------------------------------------------

/** The `Ineligible:` line of a row this script filed, read back as session names. @param {string} body */
export function ineligibleFromBody(body) {
  const line = /^Ineligible:\s*(.*)$/m.exec(body);
  if (line === null) return null;
  return [...line[1].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
}

/** The session a reading names for itself, from its last `Reviewer-session:` line. @param {string[]} texts */
export function readerFrom(texts) {
  const stated = texts.flatMap((text) => [...text.matchAll(/^Reviewer-session:\s*`?([\w.-]+)`?/gim)].map((m) => m[1]));
  return stated.at(-1) ?? null;
}

/** Opens every re-check comment, so a re-run of the same week does not say it twice. */
const RECHECK_MARK = "Re-check:";

/**
 * LAST WEEK'S READER AGAINST LAST WEEK'S LIST. It comments when the reader was a listed builder, and stays
 * silent when it was not; it never blocks or reopens, it makes a violation visible. A reading that states no
 * reviewer on a CLOSED row is also said out loud (absence is not proof the reader was eligible); an open row has
 * not been read yet and says nothing.
 * @param {{ body: string, comments: string[], closed: boolean }} lastRow
 * @returns {{ comment: string | null }}
 */
export function recheckLastWeek({ body, comments, closed }) {
  const builders = ineligibleFromBody(body);
  if (builders === null || comments.some((text) => text.startsWith(RECHECK_MARK))) return { comment: null };
  const reader = readerFrom(comments);
  if (reader === null) {
    return { comment: closed ? `${RECHECK_MARK} this row closed without a \`Reviewer-session:\` line, so whether its `
      + "reader was eligible cannot be told. That breaks the contract above until one is stated." : null };
  }
  if (eligible(reader, builders)) return { comment: null };
  return { comment: `${RECHECK_MARK} the reader \`${reader}\` is in this row's own ineligible list `
    + `(${sessionList(builders)}). A builder of the window's work read it. This does not reopen the row; it is `
    + "recorded so the violation is visible." };
}

// ---- reading GitHub and filing -------------------------------------------------------------------------

/** @param {string[]} args @returns {string} */
const gh = (args) => execFileSync("gh", args, { encoding: "utf8", cwd: REPO_ROOT, maxBuffer: MAX_GH_OUTPUT_BYTES });

/** @param {string} jq @param {string[]} args */
const ghJson = (jq, args) => JSON.parse(gh([...args, "--jq", jq]) || "null");

const SESSION_LABEL = /^session:(.+)$/;
const CLAIMED_BY = /claimed by `([^`]+)`/;

/** @param {string} since @param {string} until @returns {ClosedRow[]} */
function readClosedRows(since, until) {
  const rows = JSON.parse(gh(["issue", "list", "--repo", PRODUCT_REPO, "--state", "closed", "--limit", "1000",
    "--search", `closed:${since}..${until}`, "--json", "number,labels,comments"]));
  return rows.map((/** @type {any} */ row) => ({
    number: row.number,
    sessionLabels: row.labels.map((/** @type {any} */ l) => SESSION_LABEL.exec(l.name)?.[1]).filter(Boolean),
    claimedBy: row.comments
      .filter((/** @type {any} */ c) => c.body.includes("row-claim: claim record"))
      .map((/** @type {any} */ c) => CLAIMED_BY.exec(c.body)?.[1]).filter(Boolean),
  }));
}

/** @returns {{ number: number, title: string }[]} */
const readReviewRows = () => ghJson(".", ["issue", "list", "--repo", PRODUCT_REPO, "--state", "all",
  "--search", `"${TITLE_PREFIX}" in:title`, "--limit", "100", "--json", "number,title"])
  .filter((/** @type {{ title: string }} */ row) => row.title.startsWith(TITLE_PREFIX));

/** @param {number} n */
const issueIsOpen = (n) => gh(["issue", "view", String(n), "--repo", PRODUCT_REPO, "--json", "state", "--jq", ".state"]).trim() === "OPEN";

/** Comment on last week's row when its reader was one of its builders. @param {{ number: number, title: string }} last */
function recheck(last) {
  const row = JSON.parse(gh(["issue", "view", String(last.number), "--repo", PRODUCT_REPO, "--json", "body,state,comments"]));
  const verdict = recheckLastWeek({
    body: row.body, closed: row.state === "CLOSED", comments: row.comments.map((/** @type {any} */ c) => c.body),
  });
  if (verdict.comment === null) return;
  gh(["issue", "comment", String(last.number), "--repo", PRODUCT_REPO, "--body", verdict.comment]);
  process.stdout.write(`re-check commented on #${last.number}\n`);
}

/** @param {string} title @param {string} body */
function fileThroughRowFile(title, body) {
  const dir = mkdtempSync(join(tmpdir(), "weekly-review-"));
  try {
    const file = join(dir, "body.md");
    writeFileSync(file, body);
    execFileSync("pnpm", ["exec", "agent-org", "row-file", `--session=${FILING_SESSION}`, "--ready", "--title", title,
      "--body-file", file], { cwd: REPO_ROOT, stdio: "inherit" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The commit the documents were read at: the run's own, refused when absent rather than guessed. */
function checkedOutCommit() {
  const sha = process.env.GITHUB_SHA;
  if (!sha) throw new Error("weekly-review: GITHUB_SHA is unset, so the commit the documents were read at is unknown.");
  return sha.slice(0, SHORT_SHA);
}

/** @param {Date} date @param {{ number: number, title: string }[]} reviewRows */
function bodyFor(date, reviewRows) {
  const window = reviewWindow(date);
  const closedRows = readClosedRows(window.since, window.until);
  const { builders, unattributed } = ineligibleSessions(closedRows);
  const requirements = extractRequirements(readFileSync(join(REPO_ROOT, "RELEASE.md"), "utf8"));
  const questions = extractQuestions(readFileSync(join(REPO_ROOT, "docs/try-it.md"), "utf8"));
  const commit = checkedOutCommit();
  const body = buildBody({
    label: isoWeekLabel(date), window, closedCount: closedRows.length, builders, unattributed, requirements, questions,
    commit, waitsOnOutsiderRepo: reviewRows.length === 0 && issueIsOpen(FIRST_REVIEW_WAITS_ON),
  });
  const refusal = bodyReadFromSources(body, { requirements, questions });
  if (refusal !== null) throw new Error(refusal);
  return body;
}

function main() {
  refuseUnknownFlags([], { entry: import.meta.url, command: "weekly-review" });
  const date = new Date();
  const reviewRows = readReviewRows();
  const previous = reviewRows
    .filter(({ title }) => title !== reviewTitle(date)).sort((a, b) => b.number - a.number)[0];
  if (previous) recheck(previous);
  const plan = filingPlan({ date, existingTitles: reviewRows.map((r) => r.title) });
  process.stdout.write(`${plan.reason}\n`);
  if (plan.file) fileThroughRowFile(plan.title, bodyFor(date, reviewRows));
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  main();
}
