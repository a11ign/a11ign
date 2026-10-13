/**
 * Every script this repository runs must do nothing when it is merely IMPORTED.
 *
 * `node -e "import('./x.mjs')"` is the only check that a script still loads: lint and `tsc` cannot see an
 * import-time ReferenceError, and importing a script with work at module scope runs that work. So a script
 * that does work at top level cannot be checked the way the rules tell you to check it.
 *
 * A DISCOVERY test, not a list. The population comes from `package.json`, the workflows, `action.yml` and the
 * git hooks, so a new entry point is covered the day it is added rather than the day somebody remembers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, join } from "node:path";
import { stripComments } from "@a11ign/toolchain/lib/source-text";
import { declareTreeWideGuard, walkTree } from "@a11ign/toolchain/lib/tree-wide-guard";

declareTreeWideGuard();

const REPO = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * Measured on this tree when the test was written (46 entry points, 46 TypeScript, 25 outside package.json,
 * 65 declaring a guard, 2 bins); each floor sits about six below its reading, and a count under it means the
 * discovery broke, not the repo. Bins are exact: two is the whole set.
 */
const ENTRY_POINT_FLOOR = 40;
const TYPESCRIPT_ENTRY_FLOOR = 40;
const WORKFLOW_ONLY_FLOOR = 19;
const FORM_FLOOR = 59;
const BIN_FLOOR = 2;

/**
 * The form a guard should take. `realpathSync` is the part that matters: npm installs a `bin` as a symlink,
 * and `import.meta.url` is resolved through symlinks while `process.argv[1]` is not. Without it the script
 * loads, `main()` never runs, and it exits 0 with no output.
 */
const RECOMMENDED_FORM =
  'import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href';

/** The symlink-blind spelling, kept only as the negative case for the predicates below. */
const SUPERSEDED_FORM = 'import.meta.url === pathToFileURL(process.argv[1] ?? "").href';

/**
 * Files still carrying the symlink-blind form. A ratchet: this list may shrink and may not grow. The last four
 * were found when this test was ported to core (#5348) and are recorded here as the baseline at that moment,
 * not as reviewed exemptions; each is a sweep candidate.
 */
const KNOWN_PLAIN_ENTRY_GUARDS: readonly string[] = Object.freeze([
  "packages/cli/src/action/assert-action-report.ts",
  "packages/cli/src/action/post-comment.ts",
  "packages/cli/src/action/run.ts",
  "packages/cli/src/scan/run-axe.ts",
  "packages/judge/src/fitness/rules-check.ts",
  "scripts/check-retired-heads.ts",
  "scripts/check-schema-migration.ts",
  "scripts/ci-changed.ts",
  "scripts/claude-hooks/refuse-unreadable-command.ts",
  "scripts/known-gaps-index.ts",
  "scripts/public-repo-login-workflow-check.ts",
  "scripts/stale-dist-diagnosis.ts",
]);

/**
 * Entry points that run on import WITHOUT any guard. Two kinds, and the reason is the record:
 *
 * - `scripts/fleet-env.ts` calls `main()` unconditionally at module scope. A real gap, not a reviewed choice:
 *   importing it runs the command. Listed so the gap is visible and so the list cannot silently grow.
 * - `scripts/rstest/rstest.config.ts` is a config module that rstest imports for its export. Its body only
 *   computes values and exports them; nothing runs on import. An exemption by design, not by oversight.
 */
const KNOWN_UNGUARDED_ENTRY_POINTS: readonly string[] = Object.freeze(["scripts/fleet-env.ts"]);
const IMPORT_SAFE_CONFIG_MODULES: readonly string[] = Object.freeze(["scripts/rstest/rstest.config.ts"]);

function readText(path: string): string {
  return readFileSync(join(REPO, path), "utf8");
}

/** Shell hooks with their comment lines removed: a hook that merely MENTIONS a script has not run it. */
function hookTexts(): string[] {
  const dir = join(REPO, "scripts/git-hooks");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => statSync(join(dir, name)).isFile())
    .map((name) => readFileSync(join(dir, name), "utf8").split("\n").filter((l) => !/^\s*#/.test(l)).join("\n"));
}

/** `action.yml` and every workflow: the other places this repository runs a script by path. */
function workflowTexts(): string[] {
  const out: string[] = [];
  if (existsSync(join(REPO, "action.yml"))) out.push(readText("action.yml"));
  const dir = join(REPO, ".github/workflows");
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name.endsWith(".yml") || name.endsWith(".yaml")) out.push(readFileSync(join(dir, name), "utf8"));
  }
  return out;
}

const PATH_INVOCATION = /(?:^|\s)((?:packages|scripts)\/[^\s"'`]+\.(?:mjs|ts))/g;

/**
 * A `.mjs`/`.ts` path that is EXECUTED, not merely named. Globs and `dist/` output are not entry points, and
 * a `.d.ts` is a declaration file. The path must exist, so a deleted script is a different test's question.
 */
function entryPointsFrom(texts: string[], pattern: RegExp): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(pattern)) {
      const path = match[1];
      if (path.endsWith(".test.ts") || path.includes("*") || path.includes("/dist/")) continue;
      if (path.endsWith(".d.ts") || !existsSync(join(REPO, path))) continue;
      found.add(path);
    }
  }
  return [...found].sort();
}

/** Every entry point, discovered from the npm scripts, the workflows and the hooks. */
function entryPoints(): string[] {
  const pkg = JSON.parse(readText("package.json"));
  const npmCommands = Object.values(pkg.scripts as Record<string, string>).map(String);
  const fromNpm = entryPointsFrom(npmCommands, PATH_INVOCATION);
  const fromWorkflows = entryPointsFrom(workflowTexts(), PATH_INVOCATION);
  // A hook builds its path at runtime (`"$(dirname "$0")/.."` plus a basename), so the repo-relative path
  // never appears and a path pattern cannot see it. Resolve the bare basename against the tracked sources.
  const hookBasenames = new Set(hookTexts().flatMap((text) => [...text.matchAll(/([a-z][a-z0-9-]*\.(?:mjs|ts))\b/g)].map((m) => m[1])));
  const fromHooks = trackedSources().filter((p) => hookBasenames.has(basename(p)) && !p.endsWith(".test.ts"));
  return [...new Set([...fromNpm, ...fromWorkflows, ...fromHooks])].sort();
}

/** Tracked source files, excluding built output and tests. */
function trackedSources(): string[] {
  return walkTree({ kind: "both", roots: [] }).map((f) => f.path)
    .filter((f) => !f.includes("/dist/") && !f.endsWith(".test.ts") && !f.endsWith(".d.ts"));
}

/** A file's source with its comments removed, so a guard form QUOTED in a comment is not a use. */
function executableSource(path: string, read: (p: string) => string = readText): string {
  return stripComments(read(path));
}

/** Does this source realpath the argv path before comparing? */
function guardIsRealpathd(source: string): boolean {
  return /import\.meta\.url === pathToFileURL\(\s*process\.argv\[1\]/.test(source)
    && /realpathSync\(\s*process\.argv\[1\]/.test(source);
}

/** Declares the guard in the symlink-blind form. */
function guardIsPlain(source: string): boolean {
  return /import\.meta\.url === pathToFileURL\(\s*process\.argv\[1\]/.test(source)
    && !/realpathSync\(\s*process\.argv\[1\]/.test(source);
}

function declaresAnEntryGuard(): string[] {
  return trackedSources().filter((path) => executableSource(path).includes("import.meta.url ==="));
}

test("every entry point refuses to run when imported", () => {
  const points = entryPoints();

  // A discovery that finds nothing passes in silence, so the floor is what makes it a test.
  assert.ok(points.length >= ENTRY_POINT_FLOOR,
    `only found ${points.length} entry points; the discovery is broken, not the repo clean`);

  const typescript = points.filter((p) => p.endsWith(".ts"));
  assert.ok(typescript.length >= TYPESCRIPT_ENTRY_FLOOR,
    `found ${typescript.length} .ts entry points; the pattern has stopped matching TypeScript`);

  // Pinned separately: a total cannot tell npm-only discovery from the workflow and hook half, which is the
  // half that finds the scripts nothing in package.json names.
  const npmOnly = new Set(entryPointsFrom([readText("package.json")], PATH_INVOCATION));
  const workflowOnly = points.filter((p) => !npmOnly.has(p));
  assert.ok(workflowOnly.length >= WORKFLOW_ONLY_FLOOR,
    "no entry point was found outside package.json, so the workflow and hook discovery has stopped matching");

  const unguarded = points.filter((path) => !readText(path).includes("import.meta.url ==="));
  const exempt = new Set([...KNOWN_UNGUARDED_ENTRY_POINTS, ...IMPORT_SAFE_CONFIG_MODULES]);

  // POSITIVE CONTROL: the known gap must be detected as unguarded. Without this, the emptiness assertion
  // below passes for as long as the detection is broken.
  assert.ok(unguarded.includes("scripts/fleet-env.ts"),
    "control: the known unguarded entry point must be detected, or the detection is broken");

  assert.ok(unguarded.length > 0, "control: the unguarded population must be non-empty, or the check below proves nothing");
  const newlyUnguarded = unguarded.filter((p) => !exempt.has(p));
  assert.deepEqual(newlyUnguarded, [],
    "these run on import, so `node -e \"import(...)\"` cannot check they still load. Wrap the executable part "
    + `in a function and call it only under \`if (${RECOMMENDED_FORM})\`.`);

  assert.ok(KNOWN_UNGUARDED_ENTRY_POINTS.length > 0, "control: the known-gap list must be non-empty, or the staleness check proves nothing");
  const staleUnguarded = KNOWN_UNGUARDED_ENTRY_POINTS.filter((p) => !unguarded.includes(p));
  assert.deepEqual(staleUnguarded, [],
    "these are listed as unguarded but now carry a guard or no longer exist; remove them from "
    + "KNOWN_UNGUARDED_ENTRY_POINTS");
});

test("the recommended guard form passes the predicate and the superseded one does not", () => {
  assert.ok(guardIsRealpathd(RECOMMENDED_FORM), `the form this test recommends fails its own check: ${RECOMMENDED_FORM}`);
  assert.ok(guardIsPlain(SUPERSEDED_FORM), "the superseded form must read as plain, or the predicate has stopped distinguishing them");
  assert.ok(!guardIsRealpathd(SUPERSEDED_FORM), "and it must not read as realpath'd");
});

test("a guard form quoted in a comment is a mention, not a use", () => {
  const quotedInJsDoc = [
    "/**", ` * Do NOT use ${SUPERSEDED_FORM} here.`, " */", "export function noGuardAtAll() { return 1; }",
  ].join("\n");

  // The control: unstripped, the fixture declares the plain form. If it does not, the rest proves nothing.
  assert.ok(guardIsPlain(quotedInJsDoc), "control: unstripped, this fixture must read as declaring the plain form");
  assert.ok(!guardIsPlain(executableSource("/fake.mjs", () => quotedInJsDoc)),
    "through executableSource a form quoted in a block comment declares nothing");

  const inCode = `if (${SUPERSEDED_FORM}) main();`;
  assert.ok(guardIsPlain(executableSource("/fake.mjs", () => inCode)),
    "the same form in code still reads as a use, or the stripping has eaten the subject");
});

test("the symlink-blind population may shrink and may not grow", () => {
  const plain = trackedSources().filter((p) => guardIsPlain(executableSource(p))).sort();
  const known = new Set(KNOWN_PLAIN_ENTRY_GUARDS);

  // POSITIVE CONTROL: a file known to carry the plain form must be found, or the emptiness of `added` below
  // proves nothing.
  assert.ok(plain.includes("scripts/ci-changed.ts"),
    "control: a known plain-form guard must be in the population, or the derivation is what broke");

  assert.ok(plain.length > 0, "control: the symlink-blind population must be non-empty, or the growth check proves nothing");
  const added = plain.filter((p) => !known.has(p));
  assert.deepEqual(added, [],
    `these declare the symlink-blind guard and are not in the baseline:\n  ${added.join("\n  ")}\n`
    + `Use ${RECOMMENDED_FORM}`);

  const stale = [...known].filter((p) => !plain.includes(p)).sort();
  assert.deepEqual(stale, [],
    `these baseline entries no longer carry the plain form; remove them from KNOWN_PLAIN_ENTRY_GUARDS:\n  ${stale.join("\n  ")}`);
});

test("every declared entry guard uses the exact comparison", () => {
  const declared = declaresAnEntryGuard();
  assert.ok(declared.length >= FORM_FLOOR,
    `only ${declared.length} files declare an entry guard; the scan is broken, not the repo clean`);

  const suffixForm = declared.filter((p) => /process\.argv\[1\]\?\.endsWith\(/.test(executableSource(p)));
  const concatenated = declared.filter((p) => /import\.meta\.url === `file:\/\//.test(executableSource(p)));

  // Collected, not asserted inside the walk: an assertion in the loop stops at the first offender.
  assert.deepEqual(suffixForm, [], `these guard on a path suffix; use ${RECOMMENDED_FORM}`);
  assert.deepEqual(concatenated, [],
    "these build the guard by string concatenation, which does not percent-encode, so a path with a space "
    + `never runs. Use ${RECOMMENDED_FORM}`);
});

/** A bin's source: `dist/cli.mjs` is built from `src/cli.ts`; anything else is its own source. */
function sourceFor(targetPath: string): string {
  if (basename(dirname(targetPath)) !== "dist") return targetPath;
  const dir = join(dirname(targetPath), "..", "src");
  const stem = basename(targetPath).replace(/\.m?js$/, "");
  for (const ext of [".ts", ".mjs"]) {
    if (existsSync(join(dir, stem + ext))) return join(dir, stem + ext);
  }
  return targetPath;
}

function declaredBinSources(): string[] {
  const packagesDir = join(REPO, "packages");
  const found = new Set<string>();
  for (const pkgName of readdirSync(packagesDir)) {
    const manifestPath = join(packagesDir, pkgName, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    for (const target of Object.values(manifest.bin ?? {}) as string[]) {
      found.add(sourceFor(join(packagesDir, pkgName, target)).replace(REPO, ""));
    }
  }
  return [...found].sort();
}

test("every declared bin's guard survives being reached through a symlink", () => {
  const sources = declaredBinSources();
  assert.ok(sources.length >= BIN_FLOOR,
    `only found ${sources.length} declared bin sources; the discovery is broken, not the repo clean`);

  const jsSources = sources.filter((s) => /\.(mjs|ts)$/.test(s));
  assert.ok(jsSources.length > 0, "no bin sources were found, so the vulnerability check below compared nothing");

  const vulnerable = jsSources.filter((path) => guardIsPlain(executableSource(path)));
  assert.deepEqual(vulnerable, [],
    "these bins compare import.meta.url against a non-realpath'd process.argv[1], so reaching them through the "
    + `.bin symlink npm creates silently skips main(): ${vulnerable.join(", ")}`);
});
