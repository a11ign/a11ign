#!/usr/bin/env node
// @ts-check
// command: read what a dependency pull request owes the changelog from its manifests' diff, and compile it at version time
/**
 * #3159 (sibling of #3137, ADR 0041 decision 4): A DEPENDENCY PULL REQUEST STOPS AT THE `changeset` JOB, WHICH READS FILES.
 * #3155 (`yaml` 2.9.0 -> 2.9.1) failed it; #3137's body fragment cannot clear it, because the job runs
 * `changeset status --since`, which looks at the diff and never at the body.
 *
 * THE ENTRY IS DERIVED FROM THE DIFF, NEVER FROM THE TITLE, AND NO HUMAN TYPES IT (ruling on #3137):
 *   - a bump of a `dependencies`, `peerDependencies` or `optionalDependencies` range of a PUBLISHED package is a
 *     `patch` entry naming the dependency and both ranges: what a consumer installs changed, so an empty entry
 *     ("this cannot affect a consumer") would be false;
 *   - a diff that moves only `devDependencies` (or a private package, which ships nothing) is EMPTY, recorded
 *     explicitly rather than inferred from silence;
 *   - it is REFUSED, and the log names why, for a major bump, a 0.x minor (`.changeset/README.md`: before 1.0,
 *     breaking is a minor), an added or removed dependency, anything in a manifest that is not a dependency
 *     range, any path that is not a manifest or the lockfile, and any path in `docs/owned-path-facts.json`.
 *
 * WHY THE ENTRY IS NOT PUSHED TO THE BRANCH (shape B, not A). Shape A needs a write token and a checkout of the head
 * under `pull_request_target`, which is what #3137 refuses to have. Dependabot also documents that it stops
 * rebasing a branch someone else pushed to, and that a push made with `GITHUB_TOKEN` starts no workflow run (the
 * 2026-10-03 bump-back refusal under #2022 is the same family). NOT MEASURED on a live Dependabot branch, because
 * measuring means pushing to a bot's open pull request; the choice does not depend on it, since B pushes nothing.
 * So the job ACCEPTS from the diff (`check`) and the entry is WRITTEN when the version is made (`compile`).
 *
 * `compile` reads the manifest each published package had at its last release tag, so it needs no memory of which
 * pull requests were dependency ones. Wiring it into the version pull request waits for #3131's `version-pr` job.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { changedFiles } from "../packages/guards/src/changed-files.mjs";
import { sandboxGitEnv } from "../packages/guards/src/git-env.mjs";
import { refuseUnknownFlags, flagValue } from "../packages/worker-fleet/src/cli-flags.mjs";

/** The sections a consumer's install is built from. `devDependencies` is the one that is not. */
export const RUNTIME_SECTIONS = ["dependencies", "peerDependencies", "optionalDependencies"];
const DEPENDENCY_SECTIONS = [...RUNTIME_SECTIONS, "devDependencies"];
/** @type {Record<string, string>} */
const SECTION_LABEL = { dependencies: "dependency", peerDependencies: "peer dependency", optionalDependencies: "optional dependency" };
const MANIFEST_PATH = /^(?:packages\/[^/]+\/)?package\.json$/;
const ENTRY_PATH = /^\.changeset\/[^/]+\.md$/;
/** A range this derivation can compare: an exact version, optionally under `^` or `~`. */
const PLAIN_RANGE = /^[\^~]?(\d+)\.(\d+)\.(\d+)$/;
export const EMPTY_ENTRY = "---\n---\n";

/**
 * @typedef {{ path: string, package: string, private: boolean, section: string, dependency: string, from: string | null, to: string | null }} Change
 * @typedef {{ package: string, bump: "patch", text: string }} Entry
 * @typedef {{ verdict: "entries" | "empty" | "refused", entries: Entry[], privatePackages: string[], reasons: string[] }} Derivation
 */

/** @param {Record<string, any>} manifest */
function withoutDependencies(manifest) {
  return Object.fromEntries(Object.entries(manifest).filter(([key]) => !DEPENDENCY_SECTIONS.includes(key)));
}

/**
 * Every dependency range that differs between two manifests, with the section it sits in.
 * @param {string} path
 * @param {Record<string, any>} before
 * @param {Record<string, any>} after
 * @returns {Change[]}
 */
function rangeChanges(path, before, after) {
  return DEPENDENCY_SECTIONS.flatMap((section) => {
    const [was, now] = [before[section] ?? {}, after[section] ?? {}];
    return [...new Set([...Object.keys(was), ...Object.keys(now)])]
      .filter((dependency) => was[dependency] !== now[dependency])
      .map((dependency) => ({
        path, package: after.name, private: after.private === true, section, dependency,
        from: was[dependency] ?? null, to: now[dependency] ?? null,
      }));
  });
}

/** @param {string} range @returns {number[] | null} */
function readVersion(range) {
  const match = PLAIN_RANGE.exec(range);
  return match && match.slice(1).map(Number);
}

/**
 * Why this range move is not one a machine may wave through, or null when it is.
 * @param {Change} change
 * @returns {string | null}
 */
export function refusalFor(change) {
  const { dependency, from, to, path } = change;
  const where = `${dependency} in ${path}`;
  if (from === null || to === null) return `${where} was ${from === null ? "added" : "removed"}, which is not a version bump`;
  const [was, now] = [readVersion(from), readVersion(to)];
  if (!was || !now) return `${where}: ${from} -> ${to} is not a plain version a machine can compare`;
  if (was[0] !== now[0]) return `${where}: ${from} -> ${to} is a MAJOR bump`;
  if (was[0] === 0 && was[1] !== now[1]) {
    return `${where}: ${from} -> ${to} is a 0.x MINOR bump, which before 1.0 is semver's breaking release (.changeset/README.md)`;
  }
  if (was[0] === 0 && was[1] === 0 && was[2] !== now[2]) return `${where}: ${from} -> ${to} is a 0.0.x bump, breaking under a caret range`;
  return isBefore(now, was) ? `${where}: ${from} -> ${to} is a downgrade` : null;
}

/** @param {number[]} a @param {number[]} b whether `a` is an older version than `b` */
function isBefore(a, b) {
  const first = a.findIndex((part, i) => part !== b[i]);
  return first !== -1 && a[first] < b[first];
}

/**
 * @param {string[]} files
 * @param {string[]} owned prefixes from `docs/owned-path-facts.json`
 * @returns {string[]}
 */
function pathReasons(files, owned) {
  const foreign = files.filter((file) => !MANIFEST_PATH.test(file) && file !== "pnpm-lock.yaml" && !ENTRY_PATH.test(file));
  const owning = files.filter((file) => owned.some((prefix) => file.startsWith(prefix)));
  return [
    ...foreign.map((file) => `${file} is not a manifest or the lockfile, so this is not a dependency-only diff`),
    ...owning.map((file) => `${file} is an owned path: a human states the capture-cache facts for it (docs/owned-path-facts.json)`),
  ];
}

/**
 * @param {Record<string, { before: Record<string, any> | null, after: Record<string, any> | null }>} manifests
 * @returns {{ changes: Change[], reasons: string[] }}
 */
function readManifests(manifests) {
  const changes = [];
  const reasons = [];
  for (const [path, { before, after }] of Object.entries(manifests)) {
    if (!before || !after) {
      reasons.push(`${path} was ${before ? "deleted" : "added"}, which is not a dependency bump`);
    } else if (JSON.stringify(withoutDependencies(before)) !== JSON.stringify(withoutDependencies(after))) {
      reasons.push(`${path} changes something other than a dependency range`);
    } else {
      changes.push(...rangeChanges(path, before, after));
    }
  }
  return { changes, reasons };
}

/**
 * One `patch` entry per PUBLISHED package whose runtime ranges moved; the text is the diff restated, nothing else.
 * @param {Change[]} changes
 * @returns {Entry[]}
 */
export function entriesFor(changes) {
  const byPackage = new Map();
  for (const change of changes.filter((c) => RUNTIME_SECTIONS.includes(c.section) && !c.private)) {
    const line = `Updates the \`${change.dependency}\` ${SECTION_LABEL[change.section]} range from \`${change.from}\` to \`${change.to}\`.`;
    byPackage.set(change.package, [...(byPackage.get(change.package) ?? []), line]);
  }
  return [...byPackage].map(([name, lines]) => ({ package: name, bump: /** @type {const} */ ("patch"), text: lines.join("\n") }));
}

/**
 * What a dependency pull request owes the changelog, from its files and its manifests before and after.
 * @param {{ files: string[], manifests: Parameters<typeof readManifests>[0], owned: string[] }} input
 * @returns {Derivation}
 */
export function deriveDependencyChangeset({ files, manifests, owned }) {
  const { changes, reasons } = readManifests(manifests);
  const refusals = [...pathReasons(files, owned), ...reasons, ...changes.map(refusalFor).filter((r) => r !== null)];
  const entries = refusals.length ? [] : entriesFor(changes);
  const privatePackages = [...new Set(changes.filter((c) => c.private).map((c) => c.package))];
  if (refusals.length) return { verdict: "refused", entries, privatePackages, reasons: /** @type {string[]} */ (refusals) };
  return { verdict: entries.length ? "entries" : "empty", entries, privatePackages, reasons: [] };
}

/** @param {Entry} entry */
export function renderEntry(entry) {
  return `---\n"${entry.package}": ${entry.bump}\n---\n\n${entry.text}\n`;
}

/**
 * Parse the changesets a pull request itself carries. An empty one has no package lines.
 * @param {string} markdown
 * @returns {{ package: string | null, bump: string, text: string }}
 */
export function parseEntry(markdown) {
  const [, front = "", text = ""] = /^---\n([\s\S]*?)---\n?([\s\S]*)$/.exec(markdown) ?? [];
  const line = /^"?([^":]+)"?:\s*(\w+)\s*$/m.exec(front);
  return { package: line ? line[1] : null, bump: line ? line[2] : "", text: text.trim() };
}

/**
 * Hold an entry a pull request carries up against what its diff derives. THE DIFF IS THE AUTHORITY, so an entry
 * built from the title, an `--empty` over a runtime range and a patch for a private package are each refused.
 * @param {{ package: string | null, bump: string, text: string }[]} proposed
 * @param {Derivation} derived
 * @returns {string[]} the problems; empty means the proposal says what the diff says
 */
export function checkEntries(proposed, derived) {
  const problems = [];
  for (const entry of proposed) {
    const wanted = derived.entries.find((candidate) => candidate.package === entry.package);
    if (entry.package === null && derived.entries.length) {
      problems.push("an empty changeset over a diff that moves a runtime range: a consumer's install changed");
    } else if (entry.package !== null && derived.privatePackages.includes(entry.package)) {
      problems.push(`an entry for ${entry.package}, a private package: it ships nothing`);
    } else if (entry.package !== null && !wanted) {
      problems.push(`an entry for ${entry.package}, whose runtime ranges this diff does not move`);
    } else if (wanted && (entry.bump !== wanted.bump || entry.text !== wanted.text)) {
      problems.push(`the entry for ${entry.package} is not the one the diff derives (entries come from the diff, never from the title)`);
    }
  }
  const named = new Set(proposed.map((entry) => entry.package));
  const missing = proposed.length ? derived.entries.filter((entry) => !named.has(entry.package)) : [];
  return [...problems, ...missing.map((entry) => `no entry for ${entry.package}, whose runtime ranges this diff moves`)];
}

const MAX_GIT_OUTPUT_BYTES = 256 * 1024 * 1024;

/** @param {string[]} args */
function git(args) {
  return execFileSync("git", args, { env: sandboxGitEnv(), encoding: "utf8", maxBuffer: MAX_GIT_OUTPUT_BYTES });
}

/** @param {string} ref @param {string} path */
function manifestAt(ref, path) {
  try {
    return JSON.parse(git(["show", `${ref}:${path}`]));
  } catch {
    // A path that does not exist on that side is an ADDED or DELETED manifest, which the derivation refuses by name.
    return null;
  }
}

/**
 * The check a pull request's `changeset` job runs: accept from the diff or refuse, naming why.
 * @param {string} base
 */
function check(base) {
  const files = changedFiles([`${base}...HEAD`]);
  // THE MERGE-BASE, NOT THE BASE'S TIP: `base...HEAD` lists what the branch changed since it left `main`, so the "before"
  // side must be where it left. Reading the tip blamed the pull request for everything `main` had moved since (measured on
  // #3157's head against today's `main`: the root manifest read as "changes something other than a dependency range").
  const forkPoint = git(["merge-base", base, "HEAD"]).trim();
  const manifests = Object.fromEntries(files.filter((f) => MANIFEST_PATH.test(f)).map((f) => [f, { before: manifestAt(forkPoint, f), after: manifestAt("HEAD", f) }]));
  const owned = JSON.parse(readFileSync("docs/owned-path-facts.json", "utf8")).owned;
  const derived = deriveDependencyChangeset({ files, manifests, owned });
  const carried = files.filter((f) => ENTRY_PATH.test(f) && f !== ".changeset/README.md" && existsSync(f)).map((f) => parseEntry(readFileSync(f, "utf8")));
  const problems = derived.verdict === "refused" ? derived.reasons : checkEntries(carried, derived);
  report(derived, problems);
  return problems.length === 0;
}

/** @param {Derivation} derived @param {string[]} problems */
function report(derived, problems) {
  const lines = problems.length
    ? ["REFUSED: this dependency pull request waits for a human who looks.", ...problems.map((p) => `  - ${p}`)]
    : [`ACCEPTED (${derived.verdict}): the entry is compiled when the version is made, from the manifests at the last release.`,
       ...derived.entries.map((e) => `  - ${e.package}: ${e.bump} -- ${e.text.replaceAll("\n", " ")}`)];
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
}

/** The published packages in this checkout, with the tag their last release carries. */
function releasedPackages() {
  return readdirSync("packages")
    .map((dir) => join("packages", dir, "package.json"))
    .filter((path) => existsSync(path))
    .map((path) => ({ path, manifest: JSON.parse(readFileSync(path, "utf8")) }))
    .filter(({ manifest }) => manifest.private !== true && manifest.name)
    .map(({ path, manifest }) => ({ path, manifest, tag: `${manifest.name}@${manifest.version}` }))
    .filter(({ tag }) => git(["tag", "--list", tag]).trim() === tag);
}

/**
 * Version time: one entry per published package whose THIRD-PARTY runtime ranges moved since its last release tag.
 * @param {{ dryRun: boolean }} options
 */
export function compile({ dryRun }) {
  const workspace = new Set(readdirSync("packages").map((dir) => join("packages", dir, "package.json")).filter(existsSync)
    .map((path) => JSON.parse(readFileSync(path, "utf8")).name));
  const written = [];
  for (const { path, manifest, tag } of releasedPackages()) {
    const moved = rangeChanges(path, manifestAt(tag, path) ?? manifest, manifest)
      .filter((c) => c.from !== null && c.to !== null && !workspace.has(c.dependency));
    for (const entry of entriesFor(moved)) {
      const file = `.changeset/dependency-ranges-${entry.package.replace(/^@/, "").replace("/", "-")}.md`;
      if (!dryRun) writeFileSync(file, renderEntry(entry));
      written.push(`${file}\n${renderEntry(entry)}`);
    }
  }
  console.log(written.length ? written.join("\n") : "no published package's third-party runtime ranges moved since its last release tag");
}

/** @param {string[]} argv */
function main(argv) {
  const [command, ...rest] = argv;
  refuseUnknownFlags(["--base", "--dry-run"], { entry: import.meta.url, command: "dependency-changeset" });
  const base = flagValue(rest, "base");
  if (command === "check" && base) process.exit(check(base) ? 0 : 1);
  if (command === "compile") return compile({ dryRun: rest.includes("--dry-run") });
  console.error("usage: dependency-changeset.mjs check --base=<ref> | compile [--dry-run]");
  process.exit(2);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main(process.argv.slice(2));
