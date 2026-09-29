/**
 * A run over a SUPPLIED LIST of pages (#2272, `ceo`'s ruling (b) on #2262): a list the user wrote, counted
 * before anything is captured, refused above a cap the user must raise on purpose, and reported page by page.
 * NOT a crawl -- nothing here follows a link or reads a sitemap, so the count is the number of URLs given.
 *
 * Pure decisions and one orchestration seam (`runPageList`), with no NVDA and no `process.env`: `cli.ts`
 * passes in the lease and the single-page capture, so the ORDER this row exists to guarantee (count, then
 * lease, then capture; a refusal before any of them) is testable without a Windows worker.
 *
 * Every number below comes from `docs/capture-cost.md` (#2271), which says which are MEASURED and which are
 * CHOSEN. They are a reading at a moment: re-derive them there before quoting them.
 */

import { isAuthFault, type AuthFault } from "./auth/auth-faults.js";

export const COST_DOC = "docs/capture-cost.md";

/** The default cap, in captures. CHOSEN (`ceo`'s lower bound; Lighthouse CI's default), not derived. */
export const DEFAULT_MAX_PAGES = 5;
/** The ceiling the override cannot pass. CHOSEN as 25 rather than 50 in `capture-cost.md`'s "Cap basis". */
export const CEILING_PAGES = 25;
/** The same two caps in runner-minutes, as `capture-cost.md` states them (CHOSEN round-ups of 43 and 208). */
export const DEFAULT_CAP_MINUTES = 45;
export const CEILING_CAP_MINUTES = 210;

/**
 * Captures a page may take before its capture is accepted: the first, and up to two re-captures while the transcript
 * does not read the page (`recaptureUntilItReadsThePage`). EVERY one of them logs in again, so it is a login multiplier.
 */
export const MAX_CAPTURE_ATTEMPTS = 3;

/**
 * The most logins one authenticated run may need AT LEAST (its floor, `minimumLogins`), and it is ARITHMETIC, not a
 * taste: the worst case the DEFAULT run can reach, `DEFAULT_MAX_PAGES` pages, each `MAX_CAPTURE_ATTEMPTS` capture
 * attempts plus one rule-layer scan = 5 x (3 + 1) = 20. The default run is the largest one the project has costed
 * and admitted, so a run whose FLOOR already exceeds the default run's CEILING is asking a real account for more
 * logins than anything this tool has vouched for. The default run (floor 10, worst case 20) passes; a run at the page
 * ceiling (25 pages, floor 50) does not. Not a page cap: it counts logins, and a run with form states makes more
 * of them per page.
 */
export const MAX_LOGINS = DEFAULT_MAX_PAGES * (MAX_CAPTURE_ATTEMPTS + 1);

/** Seconds, from `capture-cost.md`: a typical capture is CHOSEN between the measured medians; the worst is the max observed. */
const TYPICAL_CAPTURE_SECONDS = 340;
const WORST_CAPTURE_SECONDS = 460;
/** Minutes one job or run pays once, and seconds each further page pays besides its capture (setup 28 + judging 7). */
const ONCE_MINUTES = 1.5;
const PER_PAGE_OVERHEAD_SECONDS = 35;
const SECONDS_PER_MINUTE = 60;
/** GitHub's price for a Windows 2-core runner minute (docs.github.com, fetched 2026-09-24; see `capture-cost.md`). */
const WINDOWS_DOLLARS_PER_MINUTE = 0.01;

export type Surface = "cli" | "action";

/** The GitHub runner sets `GITHUB_ACTIONS=true`; only the wording of a refusal depends on it, never a limit. */
export function surfaceFromEnv(env: NodeJS.ProcessEnv): Surface {
  return env.GITHUB_ACTIONS === "true" ? "action" : "cli";
}

/** An input the user can fix and retrying will not: `cli.ts` exits 2 for it, as for a forms-config error. */
export class PageListError extends Error {
  override name = "PageListError";
}

/** Whole minutes for `captures` captures at `captureSeconds` each, rounded UP: an estimate that undershoots is the wrong one. */
export function estimateMinutes(captures: number, captureSeconds: number): number {
  return Math.ceil(ONCE_MINUTES + (captures * (captureSeconds + PER_PAGE_OVERHEAD_SECONDS)) / SECONDS_PER_MINUTE);
}

export const typicalMinutes = (captures: number): number => estimateMinutes(captures, TYPICAL_CAPTURE_SECONDS);
export const worstMinutes = (captures: number): number => estimateMinutes(captures, WORST_CAPTURE_SECONDS);

/**
 * Whitespace only (a multi-line Action input is newline-separated). NOT commas: a comma is legal inside a URL
 * (`?ids=1,2`), and splitting it would turn one page into two half-URLs and count them as two captures.
 */
export function splitUrlList(text: string): string[] {
  return text.split(/\s+/).filter((piece) => piece.length > 0);
}

const PAGE_FORM_RULE = "Give the page(s) in exactly one form: positional URLs (one or several), or --urls <list> "
  + "(the Action's `urls` input), never both and never neither.";

/**
 * EXACTLY ONE of the two forms, or a refusal that says the rule. Both is refused rather than merged, because
 * merging would quietly turn "I typed one URL and a list" into a run over a set nobody wrote out whole.
 */
export function resolvePageList({ positional, listText }: { positional: string[]; listText: string | null }): string[] {
  const listed = listText === null ? [] : splitUrlList(listText);
  if (positional.length > 0 && listText !== null) {
    throw new PageListError(`Both positional URL(s) and --urls were given. ${PAGE_FORM_RULE}`);
  }
  const urls = listText === null ? positional : listed;
  if (urls.length === 0) throw new PageListError(`No page was given. ${PAGE_FORM_RULE}`);
  return urls;
}

/** Every entry must parse as an http(s) URL, said BEFORE the first capture so a typo in position four costs nothing. */
export function refuseMalformedUrls(urls: readonly string[]): void {
  const bad = urls.filter((url) => {
    try { return !/^https?:$/.test(new URL(url).protocol); } catch { return true; }
  });
  if (bad.length > 0) {
    throw new PageListError(`Not an http(s) URL: ${bad.map((url) => JSON.stringify(url)).join(", ")}. `
      + "Nothing was captured, and no worker was leased.");
  }
}

/**
 * The override: `--max-pages <n>` or the Action's `max-pages`, and NOTHING ELSE. No environment variable and no
 * config file reads into this, so raising the cap is always a thing the person wrote on the command they ran.
 * @returns the cap in captures, `DEFAULT_MAX_PAGES` when none was given
 */
export function resolveMaxPages(text: string | null): number {
  if (text === null) return DEFAULT_MAX_PAGES;
  const cap = /^\d+$/.test(text.trim()) ? Number(text) : NaN;
  if (!Number.isInteger(cap) || cap < 1 || cap > CEILING_PAGES) {
    throw new PageListError(`--max-pages must be a whole number from 1 to ${CEILING_PAGES} (got ${JSON.stringify(text)}). `
      + `${CEILING_PAGES} captures is the ceiling: ${CEILING_CAP_MINUTES} runner-minutes at the slowest page measured. `
      + `Source: ${COST_DOC}.`);
  }
  return cap;
}

function pluralCaptures(captures: number): string {
  return `${captures} capture${captures === 1 ? "" : "s"}`;
}

/**
 * The count, said BEFORE any capture: "N captures, about X minutes", with the file the figure comes from.
 * An UPPER BOUND on purpose: a page whose probes navigate away finishes in a third of the time (`capture-cost.md`),
 * so this overstates such a run and understates none of the pages measured.
 */
export function countLine({ captures, surface }: { captures: number; surface: Surface }): string {
  const timeout = surface === "action" ? `; set the job's timeout-minutes to at least ${worstMinutes(captures)}` : "";
  return `${pluralCaptures(captures)}, about ${typicalMinutes(captures)} minutes `
    + `(up to ${worstMinutes(captures)} if every page is as slow as the slowest measured${timeout}). `
    + `Estimate from ${COST_DOC}.`;
}

/** On the Action the user and not the project pays, so the refusal is in THEIR units: runner minutes on their account. */
function costInTheUsersUnits({ captures, surface }: { captures: number; surface: Surface }): string {
  const minutes = worstMinutes(captures);
  if (surface === "cli") return `about ${typicalMinutes(captures)} to ${minutes} minutes of one worker's time`;
  const dollars = (minutes * WINDOWS_DOLLARS_PER_MINUTE).toFixed(2);
  return `about ${minutes} runner-minutes billed to your account (GitHub's Windows rate is $${WINDOWS_DOLLARS_PER_MINUTE.toFixed(2)} a `
    + `minute, so $${dollars} on a private repository; a public one on a standard runner is free)`;
}

function overrideHint({ captures, surface }: { captures: number; surface: Surface }): string {
  const ask = surface === "action" ? `max-pages: ${captures}` : `--max-pages ${captures}`;
  return captures > CEILING_PAGES
    ? `Even the override stops at ${CEILING_PAGES} captures; split the list across runs.`
    : `To run it anyway, say so on purpose: ${ask}.`;
}

/**
 * REFUSE a list above the cap, BEFORE any capture and before any worker is leased, naming the cap, the count and
 * the override. The cap counts CAPTURES (a page with two configured form states is two), since a capture is what costs.
 */
export function refuseAboveCap({ captures, cap, surface }: { captures: number; cap: number; surface: Surface }): void {
  if (captures <= cap) return;
  const capMinutes = cap === DEFAULT_MAX_PAGES ? DEFAULT_CAP_MINUTES : worstMinutes(cap);
  throw new PageListError(
    `Refusing ${pluralCaptures(captures)}: the cap is ${cap} (${capMinutes} minutes at the slowest page measured). `
    + `${captures} would cost ${costInTheUsersUnits({ captures, surface })}. `
    + `${overrideHint({ captures, surface })} Nothing was captured, and no worker was leased. Source: ${COST_DOC}.`);
}

/** Captures a run makes: each page times the form states it runs, at least one per page. */
export const captureCount = ({ pages, states }: { pages: number; states: number }): number => pages * Math.max(1, states);

/**
 * The FEWEST logins a run can make: one per capture for the screen reader, and one per capture for the rule layer,
 * which signs in for itself in its own browser (ADR 0038). It is a floor and never a count -- see `LoginTally`.
 */
export const minimumLogins = ({ captures, axe }: { captures: number; axe: boolean }): number => captures * (axe ? 2 : 1);

/** The most logins a run can make when every capture is repeated as often as it may be. */
export const worstCaseLogins = ({ captures, axe }: { captures: number; axe: boolean }): number =>
  captures * (MAX_CAPTURE_ATTEMPTS + (axe ? 1 : 0));

/**
 * The logins a run PERFORMED, counted at the two places a login is dispatched (`captureViaWorker` and the rule
 * layer's scan) and not derived from the page count, which a repeated capture makes wrong. An ATTEMPT is counted when
 * it is sent: a login that failed was still a real request against a real account.
 */
export interface LoginTally {
  /** One per call that asked the worker to log in, re-captures included. */
  workerAttempts: number;
  /** One per rule-layer scan that signed in. */
  ruleLayerScans: number;
}

export const newLoginTally = (): LoginTally => ({ workerAttempts: 0, ruleLayerScans: 0 });
export const loginsPerformed = (tally: LoginTally): number => tally.workerAttempts + tally.ruleLayerScans;

/**
 * REFUSE an authenticated run whose FLOOR passes `MAX_LOGINS`, BEFORE any lease or capture, naming the constant, the
 * count and what can be done. The shape of `refuseAboveCap`, with one difference it says out loud: there is NO
 * override, because raising a lockout bound on the command line is the failure it exists to stop, and a new flag
 * would reach the Action's inputs. The remedies are fewer captures per run or `--no-axe`, which halves the floor.
 */
export function refuseAboveLoginCap({ captures, axe }: { captures: number; axe: boolean }): void {
  const floor = minimumLogins({ captures, axe });
  if (floor <= MAX_LOGINS) return;
  throw new PageListError(
    `Refusing an authenticated run of ${pluralCaptures(captures)}: it needs at least ${floor} logins `
    + `(one per capture${axe ? " and one per capture for the rule layer" : ""}), and MAX_LOGINS is ${MAX_LOGINS}. `
    + `${MAX_LOGINS} is what the default ${DEFAULT_MAX_PAGES}-page run can reach at worst `
    + `(${DEFAULT_MAX_PAGES} x (${MAX_CAPTURE_ATTEMPTS} capture attempts + 1 rule-layer scan)). `
    + `Every login is a real request to a real account and an account locks after too many. There is no override: `
    + `split the list across runs${axe ? ", or pass --no-axe, which halves the floor" : ""}. `
    + "Nothing was captured, and no worker was leased.");
}

/** One entry per URL, in the order supplied: the page's own outcome and, in JSON mode, the page's own results. */
export interface PageEntry {
  url: string;
  status: "captured" | "failed";
  /** One per capture of this page (one per configured form state, else one). Empty outside `--json`. */
  results: unknown[];
  /** Why the capture failed; present only when `status` is `"failed"`. */
  error?: string;
  /** The authentication fault that failed this page, or that stopped the list before it was tried. */
  fault?: AuthFault;
  /**
   * Set on a page the run never tried because an earlier page hit an authentication fault. It is still `"failed"`, so
   * every reader that treats `failed` as "not measured" (the Action's summary) keeps doing so.
   */
  notAttempted?: true;
}

/** The machine-readable result of a run over several pages. A list of ONE never uses it: it prints as a single URL does. */
export function multiPageJson(pages: readonly PageEntry[], logins?: LoginReport): {
  multiPage: true; pages: readonly PageEntry[]; logins?: LoginReport } {
  return { multiPage: true, pages, ...(logins ? { logins } : {}) };
}

/** What an authenticated run reports about its own logins: the count it performed and the floor it stated up front. */
export interface LoginReport { performed: number; workerAttempts: number; ruleLayerScans: number; minimum: number }

export function loginReport({ tally, minimum }: { tally: LoginTally; minimum: number }): LoginReport {
  return { performed: loginsPerformed(tally), ...tally, minimum };
}

export function loginLine(report: LoginReport): string {
  return `Logins: ${report.performed} performed (${report.workerAttempts} capture attempts, `
    + `${report.ruleLayerScans} rule-layer scans); the minimum stated before the run was ${report.minimum}.`;
}

/** One capture of a single URL: one form state (or none), and where its `--json` result goes. */
export interface SingleUrlCapture<State> { formState?: State; index: number; sink: (json: object) => void }

/**
 * A run of ONE URL: one capture per configured form state (else one), and the logins it performed reported afterwards, in the
 * shape a list reports them. The tally is cumulative across the states, so the report is made ONCE, after the last capture:
 * in `--json` it rides the LAST result (each result is held back until the next one or the end, which is why the single-URL
 * path prints no earlier than it did but one result later for a run with several states), and with no JSON result (the human
 * report, a draft run, a run that threw) it is one line through `say`. It is made in `finally` because a run that logged in
 * and then failed is the one whose lockout risk a reader most needs counted. An unauthenticated run has no tally and reports
 * nothing.
 */
export async function runSingleUrl<State>({ states, tally, axe, capture, emit, say }: {
  states: readonly State[]; tally?: LoginTally; axe: boolean;
  capture: (one: SingleUrlCapture<State>) => Promise<void>;
  emit: (json: object) => void; say: (line: string) => void;
}): Promise<void> {
  let held: object | undefined;
  const sink = (json: object): void => { if (held) emit(held); held = json; };
  try {
    if (states.length === 0) await capture({ index: 0, sink });
    for (const [index, formState] of states.entries()) await capture({ formState, index, sink });
  } finally {
    const report = tally && loginReport({ tally, minimum: minimumLogins({ captures: captureCount({ pages: 1, states: states.length }), axe }) });
    if (held) emit(report ? { ...held, logins: report } : held);
    else if (report) say(loginLine(report));
  }
}

/** The CLI's closing roll-up: which pages were captured and which FAILED, so no failure hides among the reports. */
export function rollUpLines(pages: readonly PageEntry[], logins?: LoginReport): string[] {
  const skipped = pages.filter((page) => page.notAttempted);
  const failed = pages.filter((page) => page.status === "failed" && !page.notAttempted);
  const notAttempted = skipped.length > 0 ? `, ${skipped.length} NOT ATTEMPTED` : "";
  return [
    `Pages: ${pages.length} requested; ${pages.length - failed.length - skipped.length} captured, `
      + `${failed.length} FAILED${notAttempted}.`,
    ...pages.map((page, index) => `  ${index + 1}. ${page.url} -- `
      + (page.notAttempted ? `NOT ATTEMPTED: ${page.error}` : page.status === "failed" ? `FAILED: ${page.error}` : "captured")),
    ...(logins ? [loginLine(logins)] : []),
  ];
}

export interface PageListRun<Lease extends { release(): Promise<void> }> {
  urls: readonly string[];
  /** Captures the whole list will make: the pages times the form states each runs, at least one per page. */
  captures: number;
  maxPages: number;
  surface: Surface;
  say: (line: string) => void;
  lease: () => Promise<Lease>;
  /** One page, through the ordinary single-page pipeline. Its own results come back; a throw is THIS page's failure. */
  capturePage: (url: string, lease: Lease) => Promise<unknown[]>;
}

/**
 * The order this row guarantees: refuse above the cap, say the count, LEASE, then capture each page in turn.
 *
 * A page that fails is recorded as failed and the next page still runs: one dead page must not cost the other
 * nine their captures, and must never be reported as clean. The lease is released whether or not any page did.
 *
 * ONE KIND OF FAILURE STOPS THE LIST: an authentication fault. Every later page would log in again with the same
 * credentials, and a wrong password retried on each is how an account is locked. Those pages are recorded
 * `notAttempted`, naming the fault, and no login is made for them.
 */
export async function runPageList<Lease extends { release(): Promise<void> }>(
  run: PageListRun<Lease>,
): Promise<PageEntry[]> {
  refuseAboveCap({ captures: run.captures, cap: run.maxPages, surface: run.surface });
  run.say(countLine({ captures: run.captures, surface: run.surface }));
  const lease = await run.lease();
  const pages: PageEntry[] = [];
  try {
    for (const [index, url] of run.urls.entries()) {
      const stop = pages.find((page) => page.fault !== undefined);
      if (stop) { pages.push(notAttempted(url, stop)); continue; }
      run.say(`\n=== page ${index + 1}/${run.urls.length}: ${url} ===`);
      pages.push(await capturedEntry(run, url, lease));
    }
  } finally {
    await lease.release();
  }
  return pages;
}

function notAttempted(url: string, stoppedBy: PageEntry): PageEntry {
  const fault = stoppedBy.fault as AuthFault;
  return { url, status: "failed", results: [], fault, notAttempted: true,
    error: `${stoppedBy.url} failed with ${fault}, so no further login was made` };
}

async function capturedEntry<Lease extends { release(): Promise<void> }>(
  run: PageListRun<Lease>, url: string, lease: Lease,
): Promise<PageEntry> {
  try {
    return { url, status: "captured", results: await run.capturePage(url, lease) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    run.say(`Page FAILED: ${url}\n${reason}`);
    const fault = (error as { fault?: unknown } | null)?.fault;
    return { url, status: "failed", results: [], error: reason, ...(isAuthFault(fault) ? { fault } : {}) };
  }
}
