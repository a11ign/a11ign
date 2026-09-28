#!/usr/bin/env node
// @ts-check
// command: rehearse the history-preserving extraction of agent-org (and its travelling tests) into its own repository
// ADR 0040 decisions 4 and 6 (#2623, child 5 of #69). Mirrors `scripts/history-purge-rehearsal.mjs`'s safety
// idioms (disposable-clone-only, ref cleanup before the rewrite, a post-rewrite verification that is not the
// thing the rewrite was FOR) for a different rewrite: not a text replacement, a PATH filter that keeps only
// `packages/agent-org/` and the travelling `packages/lab/src/packaging/` test files, laid out as the new
// repository's own tree, full history preserved for every kept path.
//
// A FRESH CLONE, NEVER ORIGIN, same refusal as the purge rehearsal and for the same reason: this tool rewrites
// history and must never run against a real checkout.
//
// THIS SCRIPT DOES NOT INVOKE `git filter-repo` UNLESS IT IS ON PATH. Measured 2026-09-28: no interactive
// worker host in this fleet has it installed, apt needs root none of these sessions hold, and `python3 -m pip`
// is disabled on the system interpreter (`error: externally-managed-environment`-style refusal) -- and a
// venv in the shared scratchpad is independently banned (`.agent-org/roles/engineer.md`: "No virtualenvs...
// in the scratchpad"). The REAL rehearsal and the real push both belong in a GitHub Actions job instead
// (`ceo`'s ruling of 2026-09-28 on precondition 3, for the unrelated reason that `A11IGN_BOT_TOKEN` is only
// reachable there too) -- a hosted runner has `pip install git-filter-repo` and root, this fleet's workers
// have neither. `main()` REFUSES up front, naming the gap, rather than failing opaquely mid-rewrite.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, posix } from "node:path";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { refuseUnknownFlags, flagValue } from "../packages/agent-org/src/lib/cli-flags.mjs";
import { sandboxGitEnv } from "../packages/guards/src/git-env.mjs";
import { nonStandardRefs } from "./history-purge-rehearsal.mjs";
import { scanHistory } from "./history-secret-scan.mjs";

/** Exit code: the extracted tree still imports something outside itself -- do not push. */
const EXIT_OUTWARD_IMPORTS_REMAIN = 3;

/** @param {string} target */
function refuseUnlessDisposable(target) {
  const real = resolve(target);
  const disposableRoots = [tmpdir(), "/tmp", "/private/tmp", "/var/folders"];
  if (!disposableRoots.some((root) => real.startsWith(resolve(root)))) {
    console.error(`REFUSING: ${real} is not inside a temp directory (${disposableRoots.join(", ")}).\n`
      + "This tool rewrites history and must run against a disposable rehearsal clone, never against a\n"
      + "real checkout or origin. Pass --clone-into=<a path under one of those roots>, or omit the flag\n"
      + "to have one created automatically.");
    process.exit(2);
  }
}

/** @param {string} repoDir @param {string[]} refs */
function deleteRefs(repoDir, refs) {
  for (const ref of refs) execFileSync("git", ["update-ref", "-d", ref], { cwd: repoDir, env: sandboxGitEnv() });
  execFileSync("git", ["reflog", "expire", "--expire=now", "--all"], { cwd: repoDir, env: sandboxGitEnv() });
  execFileSync("git", ["gc", "--prune=now"], { cwd: repoDir, env: sandboxGitEnv() });
}

/** `git grep -lE`, with "no matches" (exit 1) read as an empty list rather than a failure. @param {string} repoDir @param {string[]} args */
function gitGrepFiles(repoDir, args) {
  try {
    return execFileSync("git", ["grep", "-lE", ...args], { cwd: repoDir, env: sandboxGitEnv(), encoding: "utf8" })
      .trim().split("\n").filter(Boolean);
  } catch (/** @type {any} */ error) {
    if (error.status === 1) return []; // `git grep` exits 1 for "no matches", not a real failure
    throw error;
  }
}

/**
 * ADR 0040 decision 4's own two commands, re-run rather than trusted from a prior reading -- the row's own
 * history: a count taken once and carried forward drifted twice (row #2623 comments, 2026-09-28).
 * @param {string} repoDir @returns {string[]} repo-relative paths of every `packages/lab` file that imports
 *   `agent-org`'s source or host and does NOT also import one of the named product feature packages.
 */
export function travellingLabTestFiles(repoDir) {
  const tImport = gitGrepFiles(repoDir,
    [String.raw`(from|import\().*agent-org/(src|host)`, "--", "packages/lab"]);
  if (tImport.length === 0) return [];
  const tProduct = new Set(gitGrepFiles(repoDir, [
    String.raw`(\.\./)+(evidence|judge|cli|worker-fleet|nvda-worker|nvda-speech|scorer|control|pdf)/|@a11ign/(evidence|judge|cli|worker-fleet|nvda-worker|scorer|control|pdf)`,
    "--", ...tImport,
  ]));
  return tImport.filter((file) => !tProduct.has(file));
}

/**
 * `--path`/`--path-rename` pairs for `git filter-repo`, one per kept path. PROVISIONAL layout (row #2623's
 * Region is itself marked provisional): `packages/agent-org/{src,host}/...` loses its `packages/agent-org/`
 * prefix (the new repository IS the package, installed from its own root -- ADR 0040 decision 3), top-level
 * files (`package.json`, `LICENSE`) do the same, and each travelling `packages/lab/src/packaging/X` lands at
 * `src/packaging/X`, alongside the tool's own co-located tests rather than under a separate `test/` the tool
 * does not otherwise use.
 * @param {string[]} labFiles repo-relative `packages/lab/src/packaging/...` paths
 * @returns {{ path: string, rename: string }[]}
 */
export function extractionPathRenames(labFiles) {
  const rules = [
    { path: "packages/agent-org/src/", rename: "src/" },
    { path: "packages/agent-org/host/", rename: "host/" },
    { path: "packages/agent-org/package.json", rename: "package.json" },
    { path: "packages/agent-org/LICENSE", rename: "LICENSE" },
  ];
  for (const file of labFiles) {
    const suffix = file.replace(/^packages\/lab\/src\/packaging\//, "");
    if (suffix === file) throw new Error(`not a packages/lab/src/packaging/ path: ${file}`);
    rules.push({ path: file, rename: `src/packaging/${suffix}` });
  }
  return rules;
}

/**
 * Every `filter-repo` argument pair the rules above become: `--path <p> --path-rename <p>:<r>` per rule, so
 * unlisted paths are dropped and every listed one is both kept and renamed in the one pass filter-repo makes.
 * @param {{ path: string, rename: string }[]} rules
 */
export function filterRepoArgs(rules) {
  return rules.flatMap(({ path, rename }) => ["--path", path, "--path-rename", `${path}:${rename}`]);
}

/**
 * `--replace-text` rules (git filter-repo's literal blob-content substitutions) that repair each travelling
 * file's relative import of agent-org's own source to match ITS OWN new depth -- `--path-rename` moves the
 * FILE, it never rewrites what is WRITTEN inside it, so a test moved from
 * `packages/lab/src/packaging/X.test.ts` to `src/packaging/X.test.ts` still contains the literal string
 * that resolved to `packages/agent-org/src/Y.mjs` from its OLD location, which resolves outside the
 * extracted tree entirely from the NEW one -- caught live by `outwardImportsOf` (run 36422620851,
 * 2026-09-28: 238 of the 281 outward imports it found were exactly this). Grouped by DIRNAME, not assumed
 * flat, so a travelling file that later gains a subdirectory under `packaging/` still gets its own correct
 * depth rather than the one file this repo happens to have today.
 * @param {string[]} labFiles repo-relative `packages/lab/src/packaging/...` paths
 * @returns {{ old: string, replacement: string }[]}
 */
export function travellingImportRewrites(labFiles) {
  const oldRoot = "packages/lab/src/packaging";
  const newRoot = "src/packaging";
  const dirnames = new Set(labFiles.map((file) => posix.dirname(file)));
  return [...dirnames].map((oldDir) => {
    const newDir = posix.join(newRoot, posix.relative(oldRoot, oldDir));
    return {
      old: `${posix.relative(oldDir, "packages/agent-org/src")}/`,
      replacement: `${posix.relative(newDir, "src")}/`,
    };
  });
}

/** Renders `travellingImportRewrites`' pairs as a `git filter-repo --replace-text` file's content: one
 * `old==>replacement` line per pair, LITERAL (never `regex:`), so no regex-metacharacter escaping is
 * needed for the slashes and dots a path is made of.
 * @param {{ old: string, replacement: string }[]} rewrites
 */
export function replaceTextFileContent(rewrites) {
  return rewrites.map(({ old, replacement }) => `${old}==>${replacement}`).join("\n") + "\n";
}

/**
 * Every import in `root` (walked recursively, `.mjs`/`.ts`/`.js`) that resolves outside `root` itself --
 * the same walk `agent-org-outward-edges.test.ts` runs over the UN-renamed tree, re-rooted here to run over
 * what the REHEARSAL clone actually produced, so a rename that forgot to also fix an import is caught by the
 * rehearsal and not discovered live. Node built-ins and bare package specifiers (nothing here should have
 * one but `@a11ign/worker-fleet/cli-flags`'s pre-copy shape, which this refuses like any other) are the only
 * exemption. @param {string} root
 */
export async function outwardImportsOf(root) {
  const { readdirSync, readFileSync } = await import("node:fs");
  const { posix } = await import("node:path");
  const IMPORT = /(?:from|import\s*\()\s*["']([^"']+)["']/g;
  const COMMENT_LINE = /^\s*(\*|\/\/|\/\*)/;
  const SOURCE_FILE = /\.(mjs|ts|js)$/;
  /** @param {string} dir @returns {string[]} */
  const walk = (dir) => readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = posix.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : walk(rel);
    return SOURCE_FILE.test(entry.name) ? [rel] : [];
  });
  /** Resolves outside `root`, or is a `@a11ign/` specifier the extracted repo does not publish itself. @param {string} file @param {string} specifier */
  const isOutward = (file, specifier) => {
    if (specifier.startsWith("@a11ign/")) return true;
    const target = posix.normalize(posix.join(posix.dirname(file), specifier));
    return target.startsWith("..");
  };

  /** @type {{ file: string, specifier: string }[]} */
  const edges = [];
  for (const file of walk(".")) {
    const code = readFileSync(join(root, file), "utf8").split("\n")
      .filter((line) => !COMMENT_LINE.test(line)).join("\n");
    for (const match of code.matchAll(IMPORT)) {
      const specifier = match[1];
      if (specifier.startsWith("node:")) continue;
      if (!specifier.startsWith(".") && !specifier.startsWith("@a11ign/")) continue; // a real npm dependency
      if (isOutward(file, specifier)) edges.push({ file, specifier });
    }
  }
  return edges;
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  refuseUnknownFlags(["--source", "--clone-into"], { entry: import.meta.url,
    command: "node scripts/agent-org-extraction-rehearsal.mjs" });
  try {
    execFileSync("git", ["filter-repo", "--version"], { encoding: "utf8", stdio: "pipe" });
  } catch (cause) {
    console.error("REFUSING: `git filter-repo` is not on PATH here. This fleet's interactive worker hosts "
      + "do not have it (no root for apt, the system python's pip is disabled, and a venv in the shared "
      + "scratchpad is banned -- see this file's header). Run this inside the GitHub Actions job that "
      + "`ceo`'s 2026-09-28 ruling already calls for (it can `pip install git-filter-repo` freely), or on a "
      + "host where it is already installed.", cause);
    process.exit(2);
  }
  const source = flagValue(process.argv, "source");
  if (!source || !existsSync(source)) {
    console.error("Usage: node scripts/agent-org-extraction-rehearsal.mjs --source=<real repo> "
      + "[--clone-into=<path>]\n--source must be a real, existing local repository to mirror-clone from.");
    process.exit(2);
  }
  const cloneInto = flagValue(process.argv, "clone-into")
    ?? mkdtempSync(join(tmpdir(), "agent-org-extraction-rehearsal-"));
  refuseUnlessDisposable(cloneInto);

  console.error(`Mirror-cloning ${source} into ${cloneInto} ...`);
  execFileSync("git", ["clone", "--mirror", source, cloneInto], { env: sandboxGitEnv(), stdio: "inherit" });

  const stale = nonStandardRefs(cloneInto);
  console.error(`\nDeleting ${stale.length} non-standard ref(s) (checkpoint/tmp refs, not real history):`);
  for (const ref of stale) console.error(`  ${ref}`);
  deleteRefs(cloneInto, stale);

  const labFiles = travellingLabTestFiles(source);
  console.error(`\n${labFiles.length} travelling packages/lab/src/packaging/ test file(s) (decision 4's re-run count).`);
  const rules = extractionPathRenames(labFiles);
  const importRewrites = travellingImportRewrites(labFiles);
  const replaceTextFile = join(mkdtempSync(join(tmpdir(), "agent-org-extraction-replace-text-")), "rules.txt");
  writeFileSync(replaceTextFile, replaceTextFileContent(importRewrites));
  console.error(`Running git filter-repo over ${rules.length} kept path(s), rewriting `
    + `${importRewrites.length} travelling-import prefix(es) ...`);
  execFileSync("git", ["filter-repo", "--force", "--replace-text", replaceTextFile, ...filterRepoArgs(rules)],
    { cwd: cloneInto, env: sandboxGitEnv(), stdio: "inherit" });

  const worktree = mkdtempSync(join(tmpdir(), "agent-org-extraction-rehearsal-tree-"));
  execFileSync("git", ["clone", cloneInto, worktree], { env: sandboxGitEnv(), stdio: "inherit" });
  console.error("\nChecking the extracted tree for imports that resolve outside it ...");
  const edges = await outwardImportsOf(worktree);
  if (edges.length > 0) {
    console.error(`\n${edges.length} outward import(s) remain -- DO NOT PUSH THIS REWRITE:\n  `
      + edges.map((e) => `${e.file} imports \`${e.specifier}\``).join("\n  "));
    process.exit(EXIT_OUTWARD_IMPORTS_REMAIN);
  }
  console.error("Verified: no outward imports in the extracted tree.");

  console.error("\nScanning the rewritten history for secrets ...");
  const findings = await scanHistory(cloneInto);
  if (findings.length === 0) {
    console.log(`\nCLEAN: 0 findings in ${cloneInto} after the extraction.`);
    process.exit(0);
  }
  console.error(`\n${findings.length} finding(s) remain in ${cloneInto} -- review before trusting the `
    + "rewrite. Run scripts/history-secret-scan.mjs --all --repo=<path> for the full report.");
  process.exit(1);
}
