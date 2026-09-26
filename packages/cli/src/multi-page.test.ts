/**
 * A RUN OVER A LIST OF PAGES (#2272, `ceo`'s ruling (b) on #2262).
 *
 * The defect that opened the row: `cli.ts` did `args.url = v` for every non-flag argument, so `witness <a> <b>`
 * captured only <b> and said nothing. These tests pin what replaced it -- two URLs are two captures or a refusal,
 * never one silent capture -- and the two guards that are part of the shape: the count is said BEFORE anything is
 * captured, and a list above the cap is refused BEFORE anything is captured.
 *
 * The ordering claims are driven through `runPageList` with a stubbed lease and a stubbed single-page capture, so
 * they need no Windows worker: an event log records what happened in what order, and the tests read the log.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { stripComments } from "@a11ign/evidence/source-text";

import { captureAndScan, parseArgs } from "./cli.js";
import { AuthError } from "./auth/auth-faults.js";
import type { AuthRequest } from "./auth/refusals.js";
import { resolveAuthentication } from "./auth/resolve.js";
import {
  CEILING_CAP_MINUTES, CEILING_PAGES, COST_DOC, DEFAULT_CAP_MINUTES, DEFAULT_MAX_PAGES, MAX_LOGINS, PageListError,
  captureCount, countLine, loginReport, loginsPerformed, minimumLogins, multiPageJson, newLoginTally, refuseAboveCap,
  refuseAboveLoginCap, resolveMaxPages, resolvePageList, rollUpLines, runPageList, splitUrlList, worstMinutes,
  type PageEntry,
} from "./multi-page.js";
import {
  isMultiPage, multiPageExitCode, multiPageLogLines, pageOutcome, pageTripsFailOn, renderMultiSummary,
  type MultiPageResult, type PageReport, type RunFinding, type RunResult,
} from "./action/summary.js";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const CLI = resolve(REPO, "packages/cli/src/cli.ts");
const pages = (count: number): string[] => Array.from({ length: count }, (_, i) => `https://site.example/page-${i + 1}`);

interface Log { events: string[]; released: number }

/** A run with every collaborator stubbed; `capturePage` may be overridden to throw for a chosen page. */
function stubbedRun(
  urls: string[],
  overrides: { maxPages?: number; surface?: "cli" | "action"; captures?: number;
    capturePage?: (url: string) => Promise<unknown[]> } = {},
): { log: Log; run: () => Promise<PageEntry[]> } {
  const log: Log = { events: [], released: 0 };
  const run = () => runPageList({
    urls,
    captures: overrides.captures ?? urls.length,
    maxPages: overrides.maxPages ?? DEFAULT_MAX_PAGES,
    surface: overrides.surface ?? "cli",
    say: (line) => log.events.push(`say: ${line}`),
    lease: async () => {
      log.events.push("lease");
      return { release: async () => { log.released += 1; } };
    },
    capturePage: async (url) => {
      log.events.push(`capture ${url}`);
      return overrides.capturePage ? overrides.capturePage(url) : [{ url }];
    },
  });
  return { log, run };
}

const captureEvents = (log: Log): string[] => log.events.filter((e) => e.startsWith("capture "));

// ---- Done-when 1: the list, and exactly one of the two forms ---------------------------------------------------

test("two URLs are TWO pages, in the order given -- the open-check's silent drop is gone", () => {
  const args = parseArgs(["https://a.example/one", "https://b.example/two"]);
  assert.deepEqual(args.urls, ["https://a.example/one", "https://b.example/two"]);
  assert.equal(args.url, "", "a list has no single `url`: a reader that wants one must fail loudly, not take the last");
});

test("a list of one behaves as a single URL does", () => {
  for (const args of [parseArgs(["https://a.example/one"]), parseArgs(["--urls", "https://a.example/one"])]) {
    assert.deepEqual(args.urls, ["https://a.example/one"]);
    assert.equal(args.url, "https://a.example/one");
  }
});

test("--urls takes a list separated by whitespace, and a comma inside a URL stays inside it", () => {
  assert.deepEqual(splitUrlList("https://a.example/1\n https://b.example/?ids=1,2  \n\nhttps://c.example/"),
    ["https://a.example/1", "https://b.example/?ids=1,2", "https://c.example/"]);
  assert.deepEqual(parseArgs(["--urls", "https://a.example/1\nhttps://b.example/2"]).urls,
    ["https://a.example/1", "https://b.example/2"]);
});

test("both forms, and neither, are refused with a message that names the rule", () => {
  assert.throws(() => parseArgs(["https://a.example/1", "--urls", "https://b.example/2"]),
    (e: Error) => e instanceof PageListError && /Both positional URL\(s\) and --urls/.test(e.message)
      && /exactly one form/.test(e.message));
  assert.throws(() => parseArgs(["--task", "x"]),
    (e: Error) => e instanceof PageListError && /No page was given/.test(e.message) && /exactly one form/.test(e.message));
  assert.throws(() => resolvePageList({ positional: [], listText: "  \n " }), PageListError,
    "a --urls that holds nothing is the neither case, not an empty run");
});

// ---- Done-when 2: the count comes first --------------------------------------------------------------------------

test("the count line is said before the worker is leased and before the FIRST capture, and names its source", async () => {
  const { log, run } = stubbedRun(pages(3));
  await run();
  const count = log.events.findIndex((e) => /^say: 3 captures, about \d+ minutes/.test(e));
  assert.ok(count >= 0, `no count line in ${JSON.stringify(log.events)}`);
  assert.ok(log.events[count].includes(COST_DOC), "the line names the file its figure comes from");
  assert.ok(count < log.events.indexOf("lease"), "the count precedes the lease");
  assert.ok(count < log.events.findIndex((e) => e.startsWith("capture ")), "the count precedes the first capture");
  assert.deepEqual(captureEvents(log), pages(3).map((u) => `capture ${u}`), "pages are captured in the order supplied");
});

test("the count line's figures follow docs/capture-cost.md's model, and are an upper bound it says so", () => {
  // 3 captures: typical 340 s -> ceil(1.5 + 3 * 375 / 60) = 21; worst 460 s -> ceil(1.5 + 3 * 495 / 60) = 27.
  assert.equal(countLine({ captures: 3, surface: "cli" }),
    "3 captures, about 21 minutes (up to 27 if every page is as slow as the slowest measured). "
    + `Estimate from ${COST_DOC}.`);
  assert.match(countLine({ captures: 3, surface: "action" }), /timeout-minutes to at least 27/,
    "on the Action the line prints the timeout the run needs (capture-cost.md: the documented 20 fits two captures)");
});

test("the constants the estimate rests on are the ones docs/capture-cost.md states", () => {
  const doc = readFileSync(resolve(REPO, COST_DOC), "utf8");
  for (const figure of ["340 s", "460 s", "120 s", "28 s + 7 s", "$0.010", "Default cap: 5 captures, and 45 runner-minutes",
    "Ceiling: 25 captures, and 210 runner-minutes"]) {
    assert.ok(doc.includes(figure), `${COST_DOC} no longer says ${JSON.stringify(figure)}: re-derive the constants`);
  }
  assert.ok(worstMinutes(DEFAULT_MAX_PAGES) <= DEFAULT_CAP_MINUTES, "the default cap's minutes hold the default count");
  assert.ok(worstMinutes(CEILING_PAGES) <= CEILING_CAP_MINUTES, "the ceiling's minutes hold the ceiling count");
});

// ---- Done-when 3 and 4: the cap, the override, and the cost in the user's units ---------------------------------------

test("a list ONE over the cap is refused, and nothing was captured or leased", async () => {
  const { log, run } = stubbedRun(pages(DEFAULT_MAX_PAGES + 1));
  await assert.rejects(run, (e: Error) => {
    assert.ok(e instanceof PageListError);
    assert.match(e.message, /Refusing 6 captures: the cap is 5/, "names the count and the cap");
    assert.match(e.message, /--max-pages 6/, "names the override");
    assert.match(e.message, /Nothing was captured, and no worker was leased/);
    return true;
  });
  assert.deepEqual(log.events, [], "no count line, no lease, no capture: the refusal is the first thing that happens");
});

test("a list AT the cap runs", async () => {
  const { log, run } = stubbedRun(pages(DEFAULT_MAX_PAGES));
  assert.equal((await run()).length, DEFAULT_MAX_PAGES);
  assert.equal(captureEvents(log).length, DEFAULT_MAX_PAGES);
});

test("the override raises the cap on purpose, and the ceiling stops it", async () => {
  const over = stubbedRun(pages(8), { maxPages: resolveMaxPages("8") });
  assert.equal((await over.run()).length, 8);

  assert.equal(resolveMaxPages(null), DEFAULT_MAX_PAGES);
  for (const bad of ["0", "-1", "3.5", "many", "", String(CEILING_PAGES + 1)]) {
    assert.throws(() => resolveMaxPages(bad), PageListError, `--max-pages ${JSON.stringify(bad)} must be refused`);
  }
  assert.equal(resolveMaxPages(String(CEILING_PAGES)), CEILING_PAGES);

  const beyond = stubbedRun(pages(CEILING_PAGES + 1), { maxPages: CEILING_PAGES });
  await assert.rejects(beyond.run, /Even the override stops at 25 captures/);
  assert.deepEqual(beyond.log.events, []);
});

test("NO environment variable or config file raises the cap", () => {
  const saved = { ...process.env };
  try {
    for (const name of ["A11Y_MAX_PAGES", "MAX_PAGES", "A11Y_ALLOW_MANY", "A11Y_URLS"]) process.env[name] = "25";
    assert.equal(resolveMaxPages(parseArgs(["https://a.example/1"]).maxPages), DEFAULT_MAX_PAGES);
    assert.equal(parseArgs(["https://a.example/1"]).maxPages, null);
  } finally {
    for (const name of ["A11Y_MAX_PAGES", "MAX_PAGES", "A11Y_ALLOW_MANY", "A11Y_URLS"]) {
      if (name in saved) process.env[name] = saved[name]; else delete process.env[name];
    }
  }
  const source = stripComments(readFileSync(new URL("./multi-page.ts", import.meta.url), "utf8"));
  const environmentReads = [...source.matchAll(/process\.env|\benv\.[A-Z_]+/g)].map((m) => m[0]);
  assert.deepEqual(environmentReads, ["env.GITHUB_ACTIONS"],
    "the only thing multi-page.ts reads from the environment is which SURFACE's wording to use, never a limit");
});

test("on the Action the refusal is in the user's units: runner minutes and dollars, and the input to set", () => {
  assert.throws(() => refuseAboveCap({ captures: 8, cap: DEFAULT_MAX_PAGES, surface: "action" }), (e: Error) => {
    assert.match(e.message, /about 68 runner-minutes billed to your account/, "ceil(1.5 + 8 * 495 / 60) = 68");
    assert.match(e.message, /\$0\.68 on a private repository/, "68 minutes at $0.010");
    assert.match(e.message, /max-pages: 8/, "names the Action INPUT, not the CLI flag");
    assert.doesNotMatch(e.message, /--max-pages/);
    return true;
  });
  assert.throws(() => refuseAboveCap({ captures: 8, cap: DEFAULT_MAX_PAGES, surface: "cli" }),
    (e: Error) => /--max-pages 8/.test(e.message) && !/runner-minutes/.test(e.message));
});

// ---- Done-when 5: per-page reporting, and a failed page ----------------------------------------------------------------

test("a page whose capture FAILS is reported failed, the pages after it still run, and it is never clean", async () => {
  const urls = pages(3);
  const { log, run } = stubbedRun(urls, {
    capturePage: async (url) => {
      if (url === urls[1]) throw new Error("Could not reach the capture worker");
      return [{ url }];
    },
  });
  const entries = await run();
  assert.deepEqual(entries.map((e) => [e.url, e.status]), [[urls[0], "captured"], [urls[1], "failed"], [urls[2], "captured"]],
    "one entry per URL, in the order supplied");
  assert.match(entries[1].error ?? "", /Could not reach the capture worker/);
  assert.deepEqual(entries[1].results, [], "a failed page carries no results a reader could mistake for a clean one");
  assert.deepEqual(captureEvents(log), urls.map((u) => `capture ${u}`), "the failure did not stop the next page");
  assert.equal(log.released, 1, "the lease is released once, after the last page");
  assert.match(rollUpLines(entries).join("\n"), /Pages: 3 requested; 2 captured, 1 FAILED\.[\s\S]*FAILED: Could not reach/);
});

test("the lease is released even when every page fails", async () => {
  const { log, run } = stubbedRun(pages(2), { capturePage: async () => { throw new Error("no"); } });
  assert.ok((await run()).every((e) => e.status === "failed"));
  assert.equal(log.released, 1);
});

test("--json for a list is one document with an entry per page", () => {
  const json = multiPageJson([{ url: "https://a.example/", status: "captured", results: [{ x: 1 }] }]);
  assert.equal(json.multiPage, true);
  assert.ok(isMultiPage(JSON.parse(JSON.stringify(json))));
  assert.equal(isMultiPage({ url: "https://a.example/", verdict: {} }), false, "a single-page result is not a list");
});

// ---- The Action's summary ----------------------------------------------------------------------------------------------

const finding = (over: Partial<RunFinding>): RunFinding => ({
  issue: "Button has no name", wcag: "4.1.2", severity: "serious", evidence: "button", confidence: 0.9,
  mapping: "conformance", ...over,
});

const runResult = (url: string, findings: RunFinding[], over: Partial<RunResult> = {}): RunResult => ({
  url, task: "Read", screenReader: "NVDA", ruleBased: null,
  verdict: { taskCompletable: true, summary: "s", findings, confidence: 0.8 }, ...over,
});

const page = (url: string, findings: RunFinding[], over: Partial<RunResult> = {}): PageReport =>
  ({ url, status: "captured", results: [runResult(url, findings, over)] });

const FAILED_PAGE: PageReport = { url: "https://c.example/", status: "failed", results: [], error: "worker never became ready" };

const LIST: MultiPageResult = {
  multiPage: true,
  pages: [page("https://a.example/", []), page("https://b.example/", [finding({})]), FAILED_PAGE],
};

test("the summary shows every page separately, in order, with a roll-up saying which tripped fail-on", () => {
  const md = renderMultiSummary(LIST, { failOn: "serious", marker: "a11ign" });
  assert.equal(md.match(/<!-- a11ign -->/g)?.length, 1, "the marker is written once, for the PR comment to find");
  assert.match(md, /## a11ign — 3 pages/);
  assert.match(md, /\| 1 \| https:\/\/a\.example\/ \| checked \| none \| no \|/);
  assert.match(md, /\| 2 \| https:\/\/b\.example\/ \| checked \| 1 asserted: 1 serious \| \*\*yes\*\* \|/);
  assert.match(md, /\| 3 \| https:\/\/c\.example\/ \| \*\*capture FAILED\*\* \| — \| not measured \|/);
  assert.match(md, /\*\*Pages that tripped fail-on=serious:\*\* 2\./);
  assert.ok(md.indexOf("**Page:** https://a.example/") < md.indexOf("**Page:** https://b.example/"), "each page's own report");
  assert.match(md, /Button has no name/, "the page's own findings appear");
});

test("a failed page is 'NOT measured' and never a clean page, in the summary and the log", () => {
  const md = renderMultiSummary(LIST, { failOn: "never", marker: "a11ign" });
  assert.match(md, /\*\*Page\(s\) 3 were NOT measured\.\*\*/);
  assert.match(md, /could not capture this page/);
  assert.match(md, /this is not a clean page/);
  assert.match(md, /fail-on is `never`, so no page can fail the check/);
  assert.match(multiPageLogLines(LIST, "never").join("\n"), /page 3\/3 \(https:\/\/c\.example\/\): capture FAILED -- NOT MEASURED/);
});

test("an unreadable capture is reported as such, and its findings are withheld from the roll-up", () => {
  const unreadable = page("https://d.example/", [finding({})], { captureVerified: false, captureUnverifiedReason: "contained" });
  assert.equal(pageOutcome(unreadable), "unreadable");
  assert.equal(pageTripsFailOn(unreadable, "any"), false, "a page nobody measured cannot trip the threshold");
  assert.match(renderMultiSummary({ multiPage: true, pages: [unreadable] }, { failOn: "any" }),
    /\| 1 \| https:\/\/d\.example\/ \| \*\*could not read this page\*\* \| — \| not measured \|/);
});

test("a result with no verdict is a failed page, not a page with no findings", () => {
  const empty: PageReport = { url: "https://e.example/", status: "captured", results: [{ url: "https://e.example/" } as RunResult] };
  assert.equal(pageOutcome(empty), "failed");
  assert.equal(pageOutcome({ url: "https://e.example/", status: "captured", results: [] }), "failed");
});

test("exit code: a tripped page is 1 even beside a failed one; a failed page alone is 2; all clean is 0", () => {
  assert.equal(multiPageExitCode(LIST, "serious"), 1);
  assert.equal(multiPageExitCode(LIST, "never"), 2, "fail-on=never still cannot make a failed capture green");
  assert.equal(multiPageExitCode({ multiPage: true, pages: [page("https://a.example/", []), page("https://b.example/", [])] },
    "any"), 0);
  const referred = page("https://a.example/", [finding({ mapping: undefined })]);
  assert.equal(multiPageExitCode({ multiPage: true, pages: [referred] }, "any"), 0,
    "#1618: a referral never fails the run, on a list as on one page");
});

// ---- Done-when 6: every URL passes the single-URL checks BEFORE the first capture ------------------------------------

/** Runs the real CLI with no worker anywhere: anything that reaches a capture would hang or fail differently. */
function cli(args: string[], env: Record<string, string> = {}): { status: number | null; stderr: string; stdout: string } {
  const out = spawnSync(process.execPath, ["--import", "tsx", CLI, ...args],
    { encoding: "utf8", cwd: REPO, env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env }, timeout: 60_000 });
  return { status: out.status, stderr: out.stderr, stdout: out.stdout };
}

const FORMS_CONFIG = `version: 1
origin: https://a.example
forms:
  - form: "Sign in"
    submit: "Sign in"
    states:
      - state: error
        because: "no password"
        fields:
          - field: "Email"
            value: ""
`;

test("a list crossing origins with a forms config is refused WHOLE, before any worker is asked for", () => {
  const dir = mkdtempSync(join(tmpdir(), "multi-page-forms-"));
  try {
    const config = join(dir, "forms.yml");
    writeFileSync(config, FORMS_CONFIG);
    const out = cli(["https://a.example/1", "https://b.example/2", "--forms", config, "--worker", "http://127.0.0.1:1"]);
    assert.equal(out.status, 2, out.stderr);
    assert.match(out.stderr, /declares origin https:\/\/a\.example, and the run is against https:\/\/b\.example/);
    assert.doesNotMatch(out.stderr, /Using |Scanning |=== page 1/, "page one was never started");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the CLI refuses a list above the cap with exit 2 and no worker contacted", () => {
  const out = cli([...pages(DEFAULT_MAX_PAGES + 1), "--worker", "http://127.0.0.1:1"]);
  assert.equal(out.status, 2, out.stderr);
  assert.match(out.stderr, /Refusing 6 captures: the cap is 5/);
  assert.doesNotMatch(out.stderr, /Using |Scanning |=== page 1/);
});

test("--max-pages set in the environment does nothing, and set on the command it lets the list through the cap", () => {
  const refused = cli([...pages(6), "--worker", "http://127.0.0.1:1"], { A11Y_MAX_PAGES: "25", MAX_PAGES: "25" });
  assert.equal(refused.status, 2);
  const bad = cli([...pages(2), "--max-pages", "lots", "--worker", "http://127.0.0.1:1"]);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /--max-pages must be a whole number from 1 to 25/);
});

test("a malformed URL anywhere in the list is refused before page one, and so are options that need one page", () => {
  const malformed = cli(["https://a.example/1", "not a url", "--worker", "http://127.0.0.1:1"]);
  assert.equal(malformed.status, 2);
  assert.match(malformed.stderr, /Not an http\(s\) URL/);
  const draft = cli(["https://a.example/1", "https://a.example/2", "--emit-form-config", "--worker", "http://127.0.0.1:1"]);
  assert.equal(draft.status, 2);
  assert.match(draft.stderr, /--emit-form-config drafts ONE form config from ONE page/);
});

// ---- Done-when 7: no crawl ----------------------------------------------------------------------------------------------

test("no crawl: the count is the number of URLs supplied, and nothing reads a sitemap or follows a link", async () => {
  const supplied = pages(4);
  const { log, run } = stubbedRun(supplied);
  await run();
  assert.equal(captureEvents(log).length, supplied.length, "exactly the URLs supplied were captured");
  assert.match(log.events[0], /^say: 4 captures,/, "the count IS the number of URLs");

  const source = stripComments(readFileSync(new URL("./multi-page.ts", import.meta.url), "utf8"));
  for (const crawler of [/sitemap/i, /\bcrawl/i, /<a\b|href/i, /fetch\(/, /--follow/]) {
    assert.doesNotMatch(source, crawler, `multi-page.ts must not ${crawler}: a crawl is LATER, and only as a proposal`);
  }
});

// ---- #2562: a list behind a login states its cost, REPORTS it, is bounded, and stops on a failed login -----------------------

const FLOWS_YML = `
version: 1
origin: https://app.example.test
flows:
  login:
    steps:
      - goto: /login
      - fill: { field: "Email address", from-env: APP_USER }
      - fill: { field: "Password", from-env: APP_PASSWORD }
      - press: "Sign in"
      - expect: { heading: "Dashboard" }
`;
const APP_PAGES = ["orders", "invoices", "settings"].map((name) => `https://app.example.test/${name}`);
const LOGIN_ENV = { APP_USER: "canaryuser6d3f2a", APP_PASSWORD: "canarysecretb81c94" };

test("COMPOSITION: a 3-URL list and a login flow resolve through parseArgs and resolveAuthentication, and the notice is for THREE pages", async () => {
  const args = parseArgs(["--urls", APP_PAGES.join(" "), "--flows", "flows.yml", "--login-flow", "login"]);
  assert.deepEqual(args.urls, APP_PAGES);
  const before = process.env.JUDGE_BACKEND;
  process.env.JUDGE_BACKEND = "local";
  try {
    const resolved = await resolveAuthentication({
      args, urls: args.urls, task: args.task, axe: true, env: LOGIN_ENV, isPdf: () => false,
      readText: async () => FLOWS_YML, countCaptures: async () => captureCount({ pages: args.urls.length, states: 0 }),
    });
    assert.match(resolved?.notices[1] ?? "", /will perform at least 6 logins \(a minimum: one per capture, and one per capture for the rule layer\)/);
  } finally { if (before === undefined) delete process.env.JUDGE_BACKEND; else process.env.JUDGE_BACKEND = before; }
});

const AUTH_PLAN: AuthRequest = { login: [{ goto: "/login" }, { expect: { kind: "heading", name: "Dashboard", timeoutSeconds: 10 } }] };
const CAPTURE_OPTIONS = { task: "read", probeForms: false, probeFocus: false, probeNavigation: false,
  probeFocusContext: false, probeFocusReveal: false, wantAxe: true, axeResults: null, auth: AUTH_PLAN };

/** A loopback worker whose answer for each request is chosen by the request's index for that url (0 = the first ask). */
async function workerAnswering(answer: (url: string, nth: number) => string[]) {
  const asked = new Map<string, number>();
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      const { url } = JSON.parse(raw || "{}") as { url?: string };
      if (!url) { res.writeHead(200); return void res.end(JSON.stringify({ ok: true, ready: true })); }
      const nth = asked.get(url) ?? 0;
      asked.set(url, nth + 1);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ url, transcript: answer(url, nth), authApplied: true }));
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise<void>((done) => { server.close(() => done()); server.closeAllConnections(); }) };
}

test("THE RUN REPORTS THE LOGINS IT PERFORMED: 3 pages, axe on, one page re-captured once = 7 (4 worker attempts + 3 rule-layer scans), against a stated floor of 6", async () => {
  // The rule layer says the page is titled "Orders"; the second page's FIRST capture never reads it, so it is repeated once.
  const worker = await workerAnswering((url, nth) => (url.endsWith("/invoices") && nth === 0 ? ["Sign in"] : ["Orders, heading level 1"]));
  const tally = newLoginTally();
  const scan = async () => ({ findings: [], title: "Orders", coverage: {}, browserChannel: "chromium" as const });
  const realWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (() => true) as never;
  try {
    const entries = await runPageList({
      urls: APP_PAGES, captures: captureCount({ pages: 3, states: 0 }), maxPages: DEFAULT_MAX_PAGES, surface: "cli", say: () => undefined,
      lease: async () => ({ release: async () => undefined }),
      capturePage: async (url) => [await captureAndScan({ ...CAPTURE_OPTIONS, url, worker: worker.url, logins: tally },
        { scan: scan as never, isAvailable: async () => true })],
    });
    process.stderr.write = realWrite;
    assert.deepEqual(entries.map((entry) => entry.status), ["captured", "captured", "captured"]);
    assert.deepEqual(tally, { workerAttempts: 4, ruleLayerScans: 3 });
    assert.equal(loginsPerformed(tally), 7);
    const minimum = minimumLogins({ captures: 3, axe: true });
    assert.equal(minimum, 6, "the floor is the pages-x-2 sentence, stated as a minimum");
    const report = loginReport({ tally, minimum });
    assert.deepEqual(report, { performed: 7, workerAttempts: 4, ruleLayerScans: 3, minimum: 6 });
    assert.deepEqual(multiPageJson(entries, report).logins, report, "in --json");
    assert.ok(rollUpLines(entries, report).some((line) => line === "Logins: 7 performed (4 capture attempts, 3 rule-layer scans); the minimum stated before the run was 6."), "in the roll-up");
  } finally { process.stderr.write = realWrite; await worker.close(); }
});

test("a run with no authentication reports no logins: the JSON and the roll-up are byte-identical to before", () => {
  const entries: PageEntry[] = [{ url: "https://a.example/", status: "captured", results: [] }];
  assert.deepEqual(multiPageJson(entries), { multiPage: true, pages: entries });
  assert.ok(!("logins" in multiPageJson(entries)));
  assert.deepEqual(rollUpLines(entries), ["Pages: 1 requested; 1 captured, 0 FAILED.", "  1. https://a.example/ -- captured"]);
});

test("the lockout guard, in the shape of refuseAboveCap: names the constant, the count and the remedy; the default run is admitted and the ceiling run is not", () => {
  refuseAboveLoginCap({ captures: DEFAULT_MAX_PAGES, axe: true });
  assert.throws(() => refuseAboveLoginCap({ captures: CEILING_PAGES, axe: true }), (error: Error) => {
    assert.ok(error instanceof PageListError);
    assert.match(error.message, /at least 50 logins/);
    assert.match(error.message, new RegExp(`MAX_LOGINS is ${MAX_LOGINS}`));
    assert.match(error.message, /5 x \(3 capture attempts \+ 1 rule-layer scan\)/);
    assert.match(error.message, /Nothing was captured, and no worker was leased\./);
    return true;
  });
});

/** A stubbed run whose capture of `failing` throws `error`, recording every login a capture makes on a shared tally. */
function loginRun(urls: string[], failing: { url: string; error: Error }) {
  const loginsMade: string[] = [];
  const run = () => runPageList({
    urls, captures: urls.length, maxPages: DEFAULT_MAX_PAGES, surface: "cli", say: () => undefined,
    lease: async () => ({ release: async () => undefined }),
    capturePage: async (url) => {
      loginsMade.push(url);
      if (url === failing.url) throw failing.error;
      return [{ url }];
    },
  });
  return { loginsMade, run };
}

test("A FAILED LOGIN STOPS THE LIST: the failing page makes its logins, pages 2 and 3 make NONE and are recorded not attempted, naming the fault", async () => {
  const { loginsMade, run } = loginRun(pages(3), { url: pages(3)[0], error: new AuthError("auth-login-failed", "the login did not complete (expect-not-met)") });
  const entries = await run();
  assert.deepEqual(loginsMade, [pages(3)[0]], "the capture (and so the login) was called for page 1 only");
  assert.deepEqual(entries.map((entry) => [entry.status, entry.fault, entry.notAttempted]),
    [["failed", "auth-login-failed", undefined], ["failed", "auth-login-failed", true], ["failed", "auth-login-failed", true]]);
  const lines = rollUpLines(entries);
  assert.equal(lines[0], "Pages: 3 requested; 0 captured, 1 FAILED, 2 NOT ATTEMPTED.");
  assert.match(lines[2], /NOT ATTEMPTED: .*page-1 failed with auth-login-failed, so no further login was made/);
});

test("the stop is for a fault on a LATER page too: page 2 fails auth, page 3 is not attempted, page 1 keeps its capture", async () => {
  const { loginsMade, run } = loginRun(pages(3), { url: pages(3)[1], error: new AuthError("auth-credential-in-artifact", "a value survived redaction") });
  const entries = await run();
  assert.deepEqual(loginsMade, [pages(3)[0], pages(3)[1]]);
  assert.deepEqual(entries.map((entry) => entry.status), ["captured", "failed", "failed"]);
  assert.deepEqual(entries.map((entry) => entry.notAttempted), [undefined, undefined, true]);
});

test("POSITIVE CONTROL: a capture timeout, a plain Error with no auth fault, STILL continues to the next page", async () => {
  const { loginsMade, run } = loginRun(pages(3), { url: pages(3)[0], error: new Error("the capture ran out of time (fault: hard-timeout)") });
  const entries = await run();
  assert.deepEqual(loginsMade, pages(3), "all three pages were tried");
  assert.deepEqual(entries.map((entry) => entry.status), ["failed", "captured", "captured"]);
  assert.ok(entries.every((entry) => entry.notAttempted === undefined && entry.fault === undefined));
});
