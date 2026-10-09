/**
 * `scripts/stale-dist-diagnosis.ts` (#789): a `dist` older than the source it was built from reports an export or module as MISSING when it exists in the source.
 * The tool only DIAGNOSES: it reads two mtimes and appends a line, and it must stay silent on every case it was not written for, or it becomes a warning that cries wolf.
 *
 * What is pinned:
 *   1. `specifierFromFailure` reads the specifier out of the two real shapes (a SyntaxError naming a missing export; a TS2307 "Cannot find module") and nothing else.
 *   2. `srcPathFor` maps `<pkg>/dist/<name>.{js,d.ts}` to the first of `.ts`, `.mts`, `.mjs` that exists under `src/`, and is null for a path outside a `dist/`.
 *   3. `staleDistNote` speaks ONLY when dist is strictly OLDER than src (equal mtimes are current) and both files exist, and its text names both paths and both times.
 *   4. `diagnoseResolutionFailure` chains them with an injected resolver, and is null for an unmatched text, an unresolvable specifier, a dist with no source, and a current dist.
 *   5. The CLI: exit 2 and usage with no file, a flag refused, and the stale note printed on a real (fixture) stale package. The CLI resolves with its OWN `require`, so that case runs a COPY
 *      of the script inside a fixture directory that holds the stale package in its `node_modules`.
 *
 * THE POSITIVE CONTROLS: every `null` is checked against the same fixture made stale by `utimesSync`, which yields the note.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const TSX = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SCRIPT = join(REPO_ROOT, "scripts/stale-dist-diagnosis.ts");
const { srcPathFor, staleDistNote, specifierFromFailure, diagnoseResolutionFailure } = await import("../../../scripts/stale-dist-diagnosis.ts");

const EXPORT_ERROR = "SyntaxError: The requested module '@a11ign/evidence/conformance' does not provide an export named 'activationBudget'";
const MODULE_ERROR = "error TS2307: Cannot find module '@a11ign/evidence/document-identity' or its corresponding type declarations.";
const SECONDS = 1000;
const OLDER = new Date("2026-01-01T00:00:00Z");
const SECONDS_PER_MINUTE = 60;
const ONE_MINUTE = SECONDS_PER_MINUTE * SECONDS;
const NEWER = new Date(OLDER.getTime() + ONE_MINUTE);

interface Package { root: string, dist: string, src: string }

/** `<tmp>/node_modules/fx-pkg/{dist/foo.js,src/foo.ts}` with dist and src at the given times. */
function withPackage(times: { dist: Date, src: Date }, body: (pkg: Package, tmp: string) => void): void {
  const tmp = mkdtempSync(join(tmpdir(), "stale-dist-test-"));
  try {
    const root = join(tmp, "node_modules/fx-pkg");
    mkdirSync(join(root, "dist"), { recursive: true });
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "fx-pkg", exports: { "./foo": "./dist/foo.js" } }));
    const dist = join(root, "dist/foo.js");
    const src = join(root, "src/foo.ts");
    writeFileSync(dist, "");
    writeFileSync(src, "");
    utimesSync(dist, times.dist, times.dist);
    utimesSync(src, times.src, times.src);
    body({ root, dist, src }, tmp);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

test("specifierFromFailure reads the export-missing and module-missing shapes", () => {
  assert.equal(specifierFromFailure(EXPORT_ERROR), "@a11ign/evidence/conformance");
  assert.equal(specifierFromFailure(MODULE_ERROR), "@a11ign/evidence/document-identity");
  assert.equal(specifierFromFailure(`noise\n${EXPORT_ERROR}\n  at somewhere`), "@a11ign/evidence/conformance");
});

test("specifierFromFailure is null for text matching neither shape", () => {
  assert.equal(specifierFromFailure("TypeError: x is not a function"), null);
  assert.equal(specifierFromFailure(""), null);
  assert.equal(specifierFromFailure("Cannot find module without quotes"), null);
});

test("srcPathFor maps dist .js and .d.ts to the first existing source extension, .ts before .mts before .mjs", () => {
  withPackage({ dist: OLDER, src: OLDER }, ({ root, dist, src }) => {
    assert.equal(srcPathFor(dist), src);
    assert.equal(srcPathFor(join(root, "dist/foo.d.ts")), src);
    writeFileSync(join(root, "src/bar.mjs"), "");
    assert.equal(srcPathFor(join(root, "dist/bar.js")), join(root, "src/bar.mjs"));
    writeFileSync(join(root, "src/bar.mts"), "");
    assert.equal(srcPathFor(join(root, "dist/bar.js")), join(root, "src/bar.mts"), ".mts outranks .mjs");
    writeFileSync(join(root, "src/bar.ts"), "");
    assert.equal(srcPathFor(join(root, "dist/bar.js")), join(root, "src/bar.ts"), ".ts outranks both");
  });
});

test("srcPathFor is null when no source exists or the path is not under a dist/", () => {
  withPackage({ dist: OLDER, src: OLDER }, ({ root, dist, src }) => {
    assert.equal(srcPathFor(join(root, "dist/ghost.js")), null);
    assert.equal(srcPathFor(src), null);
    assert.equal(srcPathFor("/somewhere/else/foo.js"), null);
    assert.equal(srcPathFor(dist), src, "positive control: the same package maps when the path is a dist file");
  });
});

test("staleDistNote is the note, naming both paths and both times, when dist is older than src", () => {
  withPackage({ dist: OLDER, src: NEWER }, ({ dist, src }) => {
    const note = staleDistNote(dist, src) as string;
    assert.ok(note.startsWith("STALE DIST, possibly the real cause of the error above:\n"));
    assert.ok(note.includes(`    ${dist}\n    built    ${OLDER.toISOString()}\n`));
    assert.ok(note.includes(`    ${src}\n    modified ${NEWER.toISOString()} -- AFTER the build above.\n`));
    assert.match(note, /Run `npm run build` \(or `agent-org primary:update`/);
  });
});

test("staleDistNote is null for a current dist, equal mtimes, and a missing file on either side", () => {
  withPackage({ dist: NEWER, src: OLDER }, ({ root, dist, src }) => {
    assert.equal(staleDistNote(dist, src), null);
    assert.equal(staleDistNote(join(root, "dist/ghost.js"), src), null);
    assert.equal(staleDistNote(dist, join(root, "src/ghost.ts")), null);
  });
  withPackage({ dist: OLDER, src: OLDER }, ({ dist, src }) => {
    assert.equal(staleDistNote(dist, src), null, "built at the same instant as modified is current");
  });
  withPackage({ dist: OLDER, src: new Date(OLDER.getTime() + 1) }, ({ dist, src }) => {
    assert.notEqual(staleDistNote(dist, src), null, "one millisecond older is stale");
  });
});

test("diagnoseResolutionFailure resolves the named specifier and appends the note for a stale dist", () => {
  withPackage({ dist: OLDER, src: NEWER }, ({ dist }) => {
    const asked: string[] = [];
    const resolver = (specifier: string) => { asked.push(specifier); return dist; };
    const note = diagnoseResolutionFailure(EXPORT_ERROR, resolver);
    assert.match(note as string, /^STALE DIST/);
    assert.deepEqual(asked, ["@a11ign/evidence/conformance"]);
  });
});

test("diagnoseResolutionFailure is null for a current build, an unmatched text, an unresolvable specifier and a dist with no source", () => {
  withPackage({ dist: NEWER, src: OLDER }, ({ dist, root }) => {
    assert.equal(diagnoseResolutionFailure(EXPORT_ERROR, () => dist), null, "current dist");
    assert.equal(diagnoseResolutionFailure("TypeError: boom", () => dist), null, "no specifier in the text");
    assert.equal(diagnoseResolutionFailure(MODULE_ERROR, () => { throw new Error("MODULE_NOT_FOUND"); }), null, "unresolvable");
    assert.equal(diagnoseResolutionFailure(MODULE_ERROR, () => join(root, "dist/ghost.js")), null, "no source behind it");
  });
  withPackage({ dist: OLDER, src: NEWER }, ({ dist }) => {
    assert.notEqual(diagnoseResolutionFailure(MODULE_ERROR, () => dist), null, "positive control: the same resolver on a stale package");
  });
});

test("diagnoseResolutionFailure with the default resolver treats a specifier that does not exist as unresolvable", () => {
  assert.equal(diagnoseResolutionFailure("Cannot find module 'no-such-package-3998-xyz'"), null);
});

function runCli(args: string[], cwd = tmpdir(), script = SCRIPT) {
  return spawnSync(process.execPath, ["--import", TSX, script, ...args], { cwd, encoding: "utf8" });
}

function withLog(text: string, body: (logPath: string, dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "stale-dist-cli-"));
  try {
    const logPath = join(dir, "failure.txt");
    writeFileSync(logPath, text);
    body(logPath, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("CLI: no file prints the usage to stderr and exits 2; an unknown flag is refused", () => {
  const none = runCli([]);
  assert.equal(none.status, 2);
  assert.match(none.stderr, /^Usage: node --import tsx scripts\/stale-dist-diagnosis\.ts <file with the failure's stderr>/);
  assert.equal(none.stdout, "");
  const bogus = runCli(["--verbose"]);
  assert.notEqual(bogus.status, 0);
  assert.match(bogus.stderr, /unknown flag --verbose/);
});

test("CLI: text with no stale-dist signature says so; an unreadable file is an error, not a clean bill", () => {
  withLog("TypeError: x is not a function\n", (logPath) => {
    const result = runCli([logPath]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /^No stale-dist signature found in that text -- either the specifier resolved to a current build/);
  });
  const missing = runCli([join(tmpdir(), "no-such-failure-3998.txt")]);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /ENOENT/);
});

test("CLI: a failure naming a stale package prints the note; the same package made current prints the no-signature line", () => {
  withPackage({ dist: OLDER, src: NEWER }, ({ dist, src }, tmp) => {
    mkdirSync(join(tmp, "scripts"));
    copyFileSync(SCRIPT, join(tmp, "scripts/stale-dist-diagnosis.ts"));
    copyFileSync(join(REPO_ROOT, "scripts/cli-flags.mjs"), join(tmp, "scripts/cli-flags.mjs"));
    const copy = join(tmp, "scripts/stale-dist-diagnosis.ts");
    const failure = "SyntaxError: The requested module 'fx-pkg/foo' does not provide an export named 'x'\n";
    withLog(failure, (logPath) => {
      const stale = runCli([logPath], tmp, copy);
      assert.equal(stale.status, 0, stale.stderr);
      assert.match(stale.stdout, /^STALE DIST, possibly the real cause of the error above:\n/);
      assert.ok(stale.stdout.includes(`    ${dist}\n`));
      assert.ok(stale.stdout.endsWith("before trusting it.\n"));
      utimesSync(dist, NEWER, NEWER);
      utimesSync(src, OLDER, OLDER);
      assert.match(runCli([logPath], tmp, copy).stdout, /^No stale-dist signature found/);
    });
  });
});
