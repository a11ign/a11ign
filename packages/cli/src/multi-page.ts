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

export const COST_DOC = "docs/capture-cost.md";

/** The default cap, in captures. CHOSEN (`ceo`'s lower bound; Lighthouse CI's default), not derived. */
export const DEFAULT_MAX_PAGES = 5;
/** The ceiling the override cannot pass. CHOSEN as 25 rather than 50 in `capture-cost.md`'s "Cap basis". */
export const CEILING_PAGES = 25;
/** The same two caps in runner-minutes, as `capture-cost.md` states them (CHOSEN round-ups of 43 and 208). */
export const DEFAULT_CAP_MINUTES = 45;
export const CEILING_CAP_MINUTES = 210;

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

/** One entry per URL, in the order supplied: the page's own outcome and, in JSON mode, the page's own results. */
export interface PageEntry {
  url: string;
  status: "captured" | "failed";
  /** One per capture of this page (one per configured form state, else one). Empty outside `--json`. */
  results: unknown[];
  /** Why the capture failed; present only when `status` is `"failed"`. */
  error?: string;
}

/** The machine-readable result of a run over several pages. A list of ONE never uses it: it prints as a single URL does. */
export function multiPageJson(pages: readonly PageEntry[]): { multiPage: true; pages: readonly PageEntry[] } {
  return { multiPage: true, pages };
}

/** The CLI's closing roll-up: which pages were captured and which FAILED, so no failure hides among the reports. */
export function rollUpLines(pages: readonly PageEntry[]): string[] {
  const failed = pages.filter((page) => page.status === "failed");
  return [
    `Pages: ${pages.length} requested; ${pages.length - failed.length} captured, ${failed.length} FAILED.`,
    ...pages.map((page, index) => `  ${index + 1}. ${page.url} -- `
      + (page.status === "failed" ? `FAILED: ${page.error}` : "captured")),
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
      run.say(`\n=== page ${index + 1}/${run.urls.length}: ${url} ===`);
      pages.push(await capturedEntry(run, url, lease));
    }
  } finally {
    await lease.release();
  }
  return pages;
}

async function capturedEntry<Lease extends { release(): Promise<void> }>(
  run: PageListRun<Lease>, url: string, lease: Lease,
): Promise<PageEntry> {
  try {
    return { url, status: "captured", results: await run.capturePage(url, lease) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    run.say(`Page FAILED: ${url}\n${reason}`);
    return { url, status: "failed", results: [], error: reason };
  }
}
