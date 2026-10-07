/**
 * `scripts/check-transfer-urls.mjs` (#524): on transfer day, find every URL naming PRODUCT_REPO in the tree and fetch it, so the interval during which the docs
 * point at a 404 is PROVEN closed rather than assumed.
 *
 * What is pinned, with no network and no read of the real tree (`findTransferUrls` takes the root, `checkTransferUrls` takes the fetch):
 *   1. DISCOVERY IS BY PATTERN, NOT A LIST: any file extension, nested directories, the two hosts (github.com and raw.githubusercontent.com), several URLs on one line
 *      (a badge packs two back to back) stopping at markdown/JSON/YAML delimiters, results sorted by file then line, and the excluded directories never entered.
 *   2. THREE OUTCOMES, NOT TWO: a 2xx answer, a non-2xx answer (BROKEN) and a fetch that threw (UNREACHABLE) are separate results. Collapsing the last two is the
 *      "checker that silently skips on a fetch error" shape, so the report lists them under separate headings.
 *   3. The fetch is called per site, in order, with the given method (HEAD by default) and `redirect: "follow"`.
 *   4. The CLI refuses an unknown flag before it walks or fetches anything. Its main path (walk the real tree, fetch live URLs) needs the network and is NOT run here.
 *
 * THE POSITIVE CONTROLS: each excluded directory holds a URL that WOULD match, beside a file in an included directory that does; the report's NON-200 and
 * UNREACHABLE headings are asserted present for a mixed run and absent for an all-ok one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SCRIPT = join(REPO_ROOT, "scripts/check-transfer-urls.mjs");
const { findTransferUrls, checkTransferUrls, reportTransferUrls } = await import(pathToFileURL(SCRIPT).href);
const { PRODUCT_REPO } = await import(pathToFileURL(join(REPO_ROOT, "scripts/repo-identity.mjs")).href);

const GITHUB = `https://github.com/${PRODUCT_REPO}`;
const RAW = `https://raw.githubusercontent.com/${PRODUCT_REPO}`;
const LATE_LINE = 4;
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const HTTP_SERVER_ERROR = 500;

function withTree(files: Record<string, string>, body: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "transfer-urls-test-"));
  try {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("findTransferUrls finds both hosts in any file type, with 1-based line numbers, sorted by file then line", () => {
  withTree({
    "README.md": `# Title\n\nSee ${GITHUB}/blob/main/docs/x.md for details.\n`,
    "package.json": `{\n  "homepage": "${GITHUB}#readme"\n}\n`,
    "deploy/run.sh": `curl -fsSL ${RAW}/main/install.sh | sh\n`,
    "a/nested/deeper/play.ps1": `iwr "${RAW}/main/x.ps1"\n`,
  }, (root) => {
    assert.deepEqual(findTransferUrls(root), [
      { file: join("a/nested/deeper/play.ps1"), line: 1, url: `${RAW}/main/x.ps1` },
      { file: "deploy/run.sh", line: 1, url: `${RAW}/main/install.sh` },
      { file: "package.json", line: 2, url: `${GITHUB}#readme` },
      { file: "README.md", line: 3, url: `${GITHUB}/blob/main/docs/x.md` },
    ]);
  });
});

test("two URLs packed on one line (a badge) are found separately, each stopping at its markdown delimiter", () => {
  withTree({ "README.md": `[![CI](${GITHUB}/actions/badge.svg)](${GITHUB}/actions) <${RAW}/main/a.txt> "${GITHUB}/issues" '${GITHUB}/pulls'\n` }, (root) => {
    assert.deepEqual(findTransferUrls(root).map((site: { url: string }) => site.url), [
      `${GITHUB}/actions/badge.svg`, `${GITHUB}/actions`, `${RAW}/main/a.txt`, `${GITHUB}/issues`, `${GITHUB}/pulls`,
    ]);
  });
});

test("a URL for another repository, or another host, is not a match", () => {
  withTree({
    "other.md": `https://github.com/someone-else/elsewhere and https://example.com/${PRODUCT_REPO}/x and ${GITHUB.replace("https", "ftp")}\n`,
    "match.md": `${GITHUB}\n`,
  }, (root) => {
    assert.deepEqual(findTransferUrls(root).map((site: { file: string }) => site.file), ["match.md"]);
  });
});

test("an http:// URL is matched as well as https://", () => {
  withTree({ "old.md": `${GITHUB.replace("https", "http")}/wiki\n` }, (root) => {
    assert.equal(findTransferUrls(root)[0].url, `${GITHUB.replace("https", "http")}/wiki`);
  });
});

test("every excluded directory is skipped while an included sibling is read", () => {
  const excluded = ["node_modules", ".git", "dist", "build", "runs", "coverage", ".changeset", ".venv"];
  const files: Record<string, string> = { "docs/kept.md": `${GITHUB}\n` };
  for (const dir of excluded) files[`${dir}/inside.md`] = `${GITHUB}/${dir}\n`;
  files["packages/x/node_modules/deep.md"] = `${GITHUB}/deep\n`;
  withTree(files, (root) => {
    assert.deepEqual(findTransferUrls(root).map((site: { file: string }) => site.file), ["docs/kept.md"]);
  });
});

test("a broken symlink is skipped rather than aborting the walk", () => {
  withTree({ "real.md": `${GITHUB}\n` }, (root) => {
    symlinkSync(join(root, "does-not-exist.md"), join(root, "dangling.md"));
    assert.deepEqual(findTransferUrls(root).map((site: { file: string }) => site.file), ["real.md"]);
  });
});

test("a tree with no such URL gives an empty list, and a file with the URL on a later line reports that line", () => {
  withTree({ "empty.md": "nothing here\n" }, (root) => assert.deepEqual(findTransferUrls(root), []));
  withTree({ "late.md": `a\nb\nc\n${GITHUB}\n` }, (root) => assert.equal(findTransferUrls(root)[0].line, LATE_LINE));
});

test("checkTransferUrls classifies 2xx as ok, a non-2xx answer as reachable-but-not-ok, and a throw as unreachable", async () => {
  const sites = [
    { file: "a.md", line: 1, url: "https://x.invalid/ok" },
    { file: "b.md", line: 2, url: "https://x.invalid/missing" },
    { file: "c.md", line: 3, url: "https://x.invalid/down" },
    { file: "d.md", line: 4, url: "https://x.invalid/odd" },
  ];
  const answers: Record<string, () => Promise<{ status: number, ok: boolean }>> = {
    "https://x.invalid/ok": async () => ({ status: HTTP_OK, ok: true }),
    "https://x.invalid/missing": async () => ({ status: HTTP_NOT_FOUND, ok: false }),
    "https://x.invalid/down": async () => { throw new TypeError("fetch failed: ENOTFOUND"); },
    "https://x.invalid/odd": async () => { throw "a thrown string"; },
  };
  const results = await checkTransferUrls(sites, { fetchImpl: (url: string) => answers[url]() });
  assert.deepEqual(results, [
    { ...sites[0], reachable: true, status: HTTP_OK, ok: true },
    { ...sites[1], reachable: true, status: HTTP_NOT_FOUND, ok: false },
    { ...sites[2], reachable: false, status: null, ok: false, error: "fetch failed: ENOTFOUND" },
    { ...sites[3], reachable: false, status: null, ok: false, error: "a thrown string" },
  ]);
});

test("checkTransferUrls calls the fetch once per site, in order, with HEAD and redirect-follow unless told otherwise", async () => {
  const calls: Array<[string, { method: string, redirect: string }]> = [];
  const fetchImpl = async (url: string, init: { method: string, redirect: "follow" }) => { calls.push([url, init]); return { status: HTTP_OK, ok: true }; };
  const sites = [{ file: "a", line: 1, url: "https://x.invalid/1" }, { file: "b", line: 1, url: "https://x.invalid/2" }];
  await checkTransferUrls(sites, { fetchImpl });
  await checkTransferUrls(sites.slice(0, 1), { fetchImpl, method: "GET" });
  assert.deepEqual(calls, [
    ["https://x.invalid/1", { method: "HEAD", redirect: "follow" }],
    ["https://x.invalid/2", { method: "HEAD", redirect: "follow" }],
    ["https://x.invalid/1", { method: "GET", redirect: "follow" }],
  ]);
  assert.deepEqual(await checkTransferUrls([], { fetchImpl }), []);
});

const reachable = (url: string, status: number) => ({ file: "f.md", line: 1, url, reachable: true, status, ok: status >= HTTP_OK && status < HTTP_OK * 2 });

test("the report for an all-ok run is the count and the ok line, with no failure headings", () => {
  const report = reportTransferUrls([reachable("https://x.invalid/a", HTTP_OK), reachable("https://x.invalid/b", HTTP_OK)]);
  assert.equal(report, `2 ${PRODUCT_REPO} URL(s) found in the tree and checked.\n  2 resolved cleanly (2xx)`);
});

test("the report lists a NON-200 answer and an UNREACHABLE one under separate headings, with file:line and the reason", () => {
  const report = reportTransferUrls([
    reachable("https://x.invalid/a", HTTP_OK),
    { ...reachable("https://x.invalid/gone", HTTP_NOT_FOUND), file: "docs/g.md", line: 7 },
    { ...reachable("https://x.invalid/boom", HTTP_SERVER_ERROR), file: "docs/h.md", line: 9 },
    { file: "docs/i.md", line: 11, url: "https://x.invalid/dns", reachable: false, status: null, ok: false, error: "ENOTFOUND" },
  ]);
  assert.equal(report, [
    `4 ${PRODUCT_REPO} URL(s) found in the tree and checked.`,
    "  1 resolved cleanly (2xx)",
    "  2 resolved and answered NON-200:",
    "    404  docs/g.md:7  https://x.invalid/gone",
    "    500  docs/h.md:9  https://x.invalid/boom",
    "  1 COULD NOT BE REACHED (not the same as broken -- refusing below):",
    "    UNREACHABLE  docs/i.md:11  https://x.invalid/dns  (ENOTFOUND)",
  ].join("\n"));
});

test("the report for no results still counts and does not claim any cleanly", () => {
  assert.equal(reportTransferUrls([]), `0 ${PRODUCT_REPO} URL(s) found in the tree and checked.\n  0 resolved cleanly (2xx)`);
});

test("the CLI refuses an unknown flag before walking or fetching anything", () => {
  // cwd is the repository: `repo-identity.mjs` resolves the project declaration from the working directory and throws outside one.
  const result = spawnSync(process.execPath, [SCRIPT, "--live"], { cwd: REPO_ROOT, encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown flag --live/);
  assert.equal(result.stdout, "");
});
