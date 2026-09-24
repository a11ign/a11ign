/**
 * The ONE detector for "does this output contain the credential" — ADR 0038, Constraint 4 and amendment 1.
 *
 * **Two callers, one module, and that is the point.** The runtime scrub (`scrub.ts`) rescans its own output
 * with this file after replacing, and the `auth:leak-check` command (PR 6) reads what a real run wrote with
 * this file. As first designed only the command had the per-character branch, so a username NVDA speaks
 * letter by letter passed the scrub and was caught only in CI, after the run had already written it
 * (`ceo`, #2275 amendment 1). Two implementations of "contains the credential" would disagree the first time
 * one of them changed, which is this repository's most repeated defect, so there is no second one.
 *
 * It finds a value two ways:
 *
 * 1. **Contiguously**, in four forms: raw, JSON-escaped, URL-encoded and base64. Exact and case-sensitive:
 *    base64 is case-sensitive, and a page that shows the value in another case has not echoed it.
 * 2. **Spelled out**, as a run of four or more consecutive ONE-CHARACTER announcements that spell a
 *    substring of a credential, case-insensitively. NVDA speaks typed characters one at a time and speaks a
 *    punctuation character by its name, so a credential typed by keystroke reaches a transcript as a run of
 *    one-character announcements, and a contiguous search misses it. Four is the row's number: fewer would
 *    fire on any three letters a page happens to read out singly.
 *
 * Two limits, stated because a detector that certifies more than it examines is the failure this file exists
 * to prevent. **A run broken by a spoken punctuation name is measured as separate runs**: `ada@example.test`
 * yields the run `example` (found) and the run `ada` (below four, not), because what NVDA says for `@` is
 * UNMEASURED and inventing a table of names here would be a guess wearing a test. **A base64 form is found
 * at the alignment of the value alone**: the same value embedded at another offset inside a larger base64
 * string encodes differently and is not found.
 *
 * PURE. No file reads and no environment: the values to look for are handed in, so a test can hand in a fake.
 * A hit NAMES the variable and never carries the value or any part of it, so a hit can be printed.
 */

/** One thing that must not appear: the variable it came from (for messages) and its value (never printed). */
export interface Credential {
  name: string;
  value: string;
}

export type LeakForm = "raw" | "json-escaped" | "url-encoded" | "base64";

export type LeakHit =
  | { kind: "contiguous"; name: string; form: LeakForm }
  | { kind: "spelled-out"; name: string };

/** Four consecutive one-character announcements, the row's number. */
export const SPELLED_RUN_MIN = 4;

const toBase64Url = (base64: string): string => base64.replace(/\+/g, "-").replace(/\//g, "_");
const withoutPadding = (base64: string): string => base64.replace(/=+$/, "");

/**
 * Every spelling of a value the detector and the scrub look for, most specific first.
 *
 * A form identical to an earlier one is dropped, so an alphanumeric value (whose raw, JSON-escaped and
 * URL-encoded forms coincide) is reported as `raw` and not three times. **Base64 comes padded, unpadded and
 * URL-safe**, because the three spellings are all in use and a leak in the one nobody listed is a leak.
 */
export function credentialForms(value: string): Array<{ form: LeakForm; text: string }> {
  const base64 = Buffer.from(value, "utf8").toString("base64");
  const candidates: Array<{ form: LeakForm; text: string }> = [
    { form: "raw", text: value },
    { form: "json-escaped", text: JSON.stringify(value).slice(1, -1) },
    { form: "url-encoded", text: encodeURIComponent(value) },
    { form: "base64", text: base64 },
    { form: "base64", text: withoutPadding(base64) },
    { form: "base64", text: withoutPadding(toBase64Url(base64)) },
  ];
  const seen = new Set<string>();
  return candidates.filter(({ text }) => text !== "" && !seen.has(text) && seen.add(text));
}

/** Contiguous hits in a piece of text: one hit per credential per form found. */
export function findContiguousLeaks(text: string, credentials: readonly Credential[]): LeakHit[] {
  return credentials.flatMap(({ name, value }) =>
    credentialForms(value)
      .filter(({ text: form }) => text.includes(form))
      .map(({ form }): LeakHit => ({ kind: "contiguous", name, form })));
}

const isOneCharacter = (announcement: string): boolean => Array.from(announcement.trim()).length === 1;

/** The maximal runs of consecutive one-character announcements, each joined and lower-cased. */
function singleCharacterRuns(announcements: readonly string[]): string[][] {
  const runs: string[][] = [];
  let current: string[] = [];
  for (const announcement of announcements) {
    if (typeof announcement === "string" && isOneCharacter(announcement)) {
      current.push(announcement.trim().toLowerCase());
      continue;
    }
    if (current.length > 0) runs.push(current);
    current = [];
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

/**
 * Does any window of four characters of this run occur inside the credential? A longer shared substring
 * contains a four-character one, so checking the windows of four finds every run that spells four or more.
 */
function runSpellsPartOf(run: readonly string[], credential: string): boolean {
  for (let start = 0; start + SPELLED_RUN_MIN <= run.length; start += 1) {
    if (credential.includes(run.slice(start, start + SPELLED_RUN_MIN).join(""))) return true;
  }
  return false;
}

/** Spelled-out hits in one list of announcements. Runs never join across a longer announcement. */
export function findSpelledOutLeaks(announcements: readonly string[], credentials: readonly Credential[]): LeakHit[] {
  const runs = singleCharacterRuns(announcements).filter((run) => run.length >= SPELLED_RUN_MIN);
  return credentials
    .filter(({ value }) => runs.some((run) => runSpellsPartOf(run, value.toLowerCase())))
    .map(({ name }): LeakHit => ({ kind: "spelled-out", name }));
}

/** Every array of strings anywhere in a value: each is a list of announcements, and a run never spans two. */
export function stringArraysIn(value: unknown): string[][] {
  if (Array.isArray(value)) {
    const own = value.length > 0 && value.every((item) => typeof item === "string") ? [value as string[]] : [];
    return [...own, ...value.flatMap(stringArraysIn)];
  }
  if (typeof value === "object" && value !== null) return Object.values(value).flatMap(stringArraysIn);
  return [];
}

/** Both branches over one artifact: its serialised text, and every list of announcements inside it. */
export function findLeaks(artifact: unknown, credentials: readonly Credential[]): LeakHit[] {
  const text = typeof artifact === "string" ? artifact : JSON.stringify(artifact) ?? "";
  const spelled = typeof artifact === "string"
    ? findSpelledOutLeaks(artifact.split("\n"), credentials)
    : stringArraysIn(artifact).flatMap((list) => findSpelledOutLeaks(list, credentials));
  return [...findContiguousLeaks(text, credentials), ...spelled];
}

/** The exit contract of `auth:leak-check` (PR 6): 0 clean, 1 a leak was found, 2 nothing could be examined. */
export const LEAK_EXIT = { clean: 0, leak: 1, couldNotExamine: 2 } as const;
export type LeakExit = (typeof LEAK_EXIT)[keyof typeof LEAK_EXIT];

export interface LeakCheckReport {
  examinedFiles: number;
  examinedAnnouncements: number;
  hits: readonly LeakHit[];
}

/**
 * A hit is a leak whatever else is true, and examining NOTHING is exit 2 and never 0. The first command in
 * ADR 0038's proof is an emptiness claim ("no leak found"), and it is vacuous when the capture produced
 * nothing or the scan was pointed at an empty directory; the positive control shows the detector can fire,
 * and this is what stops the real run reading as clean when it never looked.
 */
export function leakCheckExit(report: LeakCheckReport): LeakExit {
  if (report.hits.length > 0) return LEAK_EXIT.leak;
  if (report.examinedFiles === 0 || report.examinedAnnouncements === 0) return LEAK_EXIT.couldNotExamine;
  return LEAK_EXIT.clean;
}

/** The line every run prints, so a reader can see how much was looked at before believing "clean". */
export function describeExamined(report: Pick<LeakCheckReport, "examinedFiles" | "examinedAnnouncements">): string {
  const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
  return `examined ${plural(report.examinedFiles, "file")} and ${plural(report.examinedAnnouncements, "announcement")}`;
}
