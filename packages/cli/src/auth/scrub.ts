/**
 * The containment — ADR 0038, Constraint 4's second defence, at the one place bytes leave.
 *
 * Everything the CLI writes or prints passes through here. It replaces every occurrence of every `from-env`
 * value, in the four forms `leak-detector.ts` knows, with `‹credential›`, counts what it replaced, and
 * **rescans with the SAME detector the leak check uses, per-character branch included** (amendment 1). A hit
 * on the rescan is `auth-credential-in-artifact`: the function throws, so the caller has nothing to write and
 * nothing to print. The runtime path therefore cannot pass what the CI check would catch.
 *
 * **What it deliberately does not do: it does not scrub a spelled-out run.** A username NVDA speaks letter by
 * letter is not replaced, it is REFUSED. Replacing four one-character announcements would shift the indexes
 * that `interaction` records hold into the transcript, and would leave the transcript reading as a run of
 * markers; the run is the sign that the first defence (do not type into the transcript) failed, and a run
 * that ends in an error is louder and more honest than one that ends in a quietly altered page.
 *
 * **A value below `MIN_SCRUBBED_LENGTH` refuses the run** (amendment 2; the reasons are in the ADR beside the
 * amendment): replacing `admin` everywhere would turn "Admin panel" into "‹credential› panel", and the scorer
 * reads that text. It is refused BEFORE anything is captured, naming the variable and never the value.
 *
 * PURE apart from the `write` callback `writeScrubbed` is handed. No file reads and no environment.
 */
import { credentialForms, findContiguousLeaks, findLeaks, type Credential, type LeakHit } from "./leak-detector.js";

/** What replaces a value. Not a word a page says, and outside ASCII so it cannot be typed by accident. */
export const MARKER = "‹credential›";

/**
 * The shortest value the scrub will replace, in Unicode code points (ADR 0038, amendment 2). Below it a
 * replacement rewrites the page's own words and the proof of absence cannot tell an echo from a coincidence.
 */
export const MIN_SCRUBBED_LENGTH = 8;

export type ScrubFault = "auth-credential-too-short" | "auth-credential-in-artifact";

/** Thrown with a sentence a person can act on, carrying the fault code recovery and messages are keyed on (ADR 0028). */
export class ScrubError extends Error {
  readonly fault: ScrubFault;
  constructor(fault: ScrubFault, message: string) {
    super(`${message} (fault: ${fault})`);
    this.name = "ScrubError";
    this.fault = fault;
  }
}

/** The values to look for, checked against the floor and deduplicated. Build it once per run. */
export interface ScrubSet {
  readonly credentials: readonly Credential[];
}

const codePoints = (value: string): number => Array.from(value).length;

/**
 * Refuse a value below the floor, then deduplicate.
 *
 * A username and a password may be the same string (a test account nobody named carefully), and it is one
 * thing to look for, reported under both names.
 */
export function buildScrubSet(credentials: readonly Credential[]): ScrubSet {
  for (const { name, value } of credentials) {
    if (codePoints(value) < MIN_SCRUBBED_LENGTH) {
      throw new ScrubError("auth-credential-too-short",
        `${name} holds a value shorter than ${MIN_SCRUBBED_LENGTH} characters. A value that short is an ordinary word `
        + "on most pages, and hiding it would rewrite the page's own text, so the run would read a different page "
        + `than the one you have. Nothing was captured. Use a dedicated test account whose login is at least ${MIN_SCRUBBED_LENGTH} `
        + "characters and not an ordinary word, such as a11y-audit-7f3c.");
    }
  }
  const byValue = new Map<string, string[]>();
  for (const { name, value } of credentials) byValue.set(value, [...(byValue.get(value) ?? []), name]);
  return { credentials: [...byValue].map(([value, names]) => ({ name: names.join("/"), value })) };
}

/** Every form of every value, longest first, so a form that contains another is replaced whole. */
function replacementForms(set: ScrubSet): string[] {
  return set.credentials
    .flatMap(({ value }) => credentialForms(value).map(({ text }) => text))
    .sort((a, b) => b.length - a.length);
}

function redactString(text: string, forms: readonly string[]): string {
  return forms.reduce((current, form) => current.split(form).join(MARKER), text);
}

/** A deep copy with every string leaf redacted, and the number of leaves that changed. */
function redactTree(value: unknown, forms: readonly string[], tally: { changed: number }): unknown {
  if (typeof value === "string") {
    const redacted = redactString(value, forms);
    if (redacted !== value) tally.changed += 1;
    return redacted;
  }
  if (Array.isArray(value)) return value.map((item) => redactTree(item, forms, tally));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactTree(item, forms, tally)]));
  }
  return value;
}

/** What is said, on every path, about what was hidden: a count, so the alteration is never silent. */
export function redactionNotice(count: number): string {
  if (count === 0) return "No announcement contained a value from your login.";
  return count === 1
    ? "1 announcement contained a value from your login and was redacted."
    : `${count} announcements contained a value from your login and were redacted.`;
}

/**
 * The rescan, which is where amendment 1 lives. It looks for the same things the leak check looks for, in the
 * output the run is about to emit, and a hit ends the run. It names the variables and how many places, and
 * never a value.
 */
function refuseIfAnyLeakRemains(artifact: unknown, set: ScrubSet): void {
  const hits: LeakHit[] = findLeaks(artifact, set.credentials);
  if (hits.length === 0) return;
  const spelled = hits.filter((hit) => hit.kind === "spelled-out").length;
  const names = [...new Set(hits.map((hit) => hit.name))].join(", ");
  throw new ScrubError("auth-credential-in-artifact",
    `The output still contains a value from your login (${names}) after redaction`
    + (spelled > 0 ? `, including ${spelled} spelled out one character at a time` : "")
    + ". Nothing was written and nothing was printed. This means the login reached the transcript despite "
    + "the login not being recorded, so do not trust a run that got this far: report it, with the variable "
    + "names above and no values.");
}

export interface Scrubbed<T> {
  value: T;
  /** How many announcements (string leaves) contained a value and were changed. */
  redactions: number;
}

/** Redact a parsed artifact, then rescan it. Throws `auth-credential-in-artifact` rather than return a leak. */
export function scrubArtifact<T>(artifact: T, set: ScrubSet): Scrubbed<T> {
  const tally = { changed: 0 };
  const value = redactTree(artifact, replacementForms(set), tally) as T;
  refuseIfAnyLeakRemains(value, set);
  return { value, redactions: tally.changed };
}

/** Redact printed text, line by line (a line is an announcement), then rescan it. */
export function scrubText(text: string, set: ScrubSet): Scrubbed<string> {
  const forms = replacementForms(set);
  let changed = 0;
  const value = text.split("\n").map((line) => {
    const redacted = redactString(line, forms);
    if (redacted !== line) changed += 1;
    return redacted;
  }).join("\n");
  refuseIfAnyLeakRemains(value, set);
  return { value, redactions: changed };
}

/**
 * Serialise the artifact as `writeWitnessArtifact` does, scrub it, and hand the text to `write` ONCE and only
 * if the rescan was clean. "Nothing is written" is therefore a property of this function's shape and not of
 * its callers' care: a refusal throws before `write` is reached. Returns the redaction count for the notice.
 */
export function writeScrubbed(artifact: unknown, set: ScrubSet, write: (text: string) => void): number {
  const { value, redactions } = scrubArtifact(artifact, set);
  write(`${JSON.stringify(value, null, 2)}\n`);
  return redactions;
}

/**
 * The values a run is HANDED before it captures anything — the URLs and the task — must not carry a `from-env` value
 * either. `keepCredentialsOut` scrubs what the capture and the rule layer return, and these two are not returned by
 * either: they are the run's own arguments, echoed by the `captureAndScan` log, `--json`, the plain report, the artifact
 * and the Action summary. Chasing each echo would leave the next one unguarded, so a same-origin URL such as
 * `/orders?token=<value>` (it passes the origin pin) or a task that quotes the password is REFUSED here, before a worker
 * is leased: the value is also sent to the server and its logs in that URL, which is a leak in its own right.
 * Names the variable and the argument, never the value.
 */
export function refuseIfAnArgumentCarriesAValue(
  given: { urls: readonly string[]; task: string }, set: ScrubSet,
): void {
  const places = [...given.urls.map((url, index) => ({ label: `url ${index + 1}`, text: url })), { label: "the task", text: given.task }];
  const found = places.flatMap(({ label, text }) => findContiguousLeaks(text, set.credentials).map(({ name }) => ({ label, name })));
  if (found.length === 0) return;
  const where = [...new Set(found.map(({ label }) => label))].join(", ");
  const names = [...new Set(found.map(({ name }) => name))].join(", ");
  throw new ScrubError("auth-credential-in-artifact",
    `${where} contains a value from your login (${names}). Everything the run prints and writes repeats its URLs and `
    + "its task, and the server would log that URL, so a run given a credential in either is refused before anything is "
    + "captured. Remove the value from the URL or the task; the login flow supplies it.");
}
