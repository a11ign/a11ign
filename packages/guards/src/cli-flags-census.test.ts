/**
 * Every command that reads argv either calls `refuseUnknownFlags` or is named, with a reason, in UNGUARDED.
 *
 * The census is DISCOVERED by walking the tree, never a hand-typed list of CLIs. A file is classified by
 * whether its own source calls the guard, so a new command satisfies the rule by calling it, with nothing
 * here to edit. Only a deliberate exemption still needs a line.
 *
 * Core's population includes `.ts` as well as `.mjs`: the product CLI and most package sources are
 * TypeScript, and a census that read only `.mjs` would be blind to them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "@a11ign/toolchain/lib/source-text";
import { filesUnder } from "./files-under.ts";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));

/** Measured 67 argv readers on 2026-10-13. Six below that, so a moved layout fails here rather than shrinking the census quietly. */
const CENSUS_FLOOR = 61;
/** Measured 50 guarded files on the same date. Six below, for the same reason as CENSUS_FLOOR. */
const GUARDED_FLOOR = 44;
const REASON_MIN_LENGTH = 40;

/**
 * Not yet guarded. THIS LIST MAY ONLY SHRINK.
 *
 * It is not an exemption: every one of these reads argv and does not call `refuseUnknownFlags`. It exists so
 * that a NEW command cannot join them without a test failing, which is the difference between a known gap and
 * an unknown one. Guarding one means deleting its line.
 */
const UNGUARDED: Record<string, string> = {
  "scripts/run.ts":
    "the command DISPATCHER. Everything after the command name belongs to the child, so a guard here would refuse "
    + "a flag the child owns. It refuses an unrecognised command NAME itself (scripts/run.ts:16), which is the same "
    + "guarantee by the only route open to it: a dispatcher that ran nothing and exited 0 would make \"no such "
    + "command\" and \"the command found nothing\" the same observation",
  "scripts/pnpm.ts":
    "a PASSTHROUGH (#3141): `node scripts/pnpm.ts run X --silent -- --flag` is `pnpm run X --silent -- --flag` on a "
    + "box with no `pnpm` on PATH. Every argument belongs to pnpm, so a guard here would refuse `--silent`. Nothing "
    + "is dropped: pnpm refuses a script or flag it does not know, and its exit status is returned",
  "scripts/check-schema-migration.ts":
    "its one flag, `--evaluating`, is read at line 51. A mistyped one is discarded and the command answers the "
    + "stricter question instead, so it fails CLOSED rather than open. That is what makes this exemption affordable",
  "scripts/claude-hooks/refuse-unreadable-command.ts":
    "reads no flags: its only argv use is `process.argv[1]`, the path of its own entry-point guard (line 78)",
  "scripts/public-repo-login-workflow-check.ts":
    "reads no flags: `argv[0]` is an optional positional root (line 96), and nothing else is read from argv",
  "scripts/auth0-e2e-env.ts":
    "parses its own flags in `parseArgs` and refuses an unrecognised one itself (`unknown argument`, line 152). "
    + "That is the same guarantee by a second implementation, which a follow-up may move onto `refuseUnknownFlags`",
  "packages/guards/src/piped-exit-status-guard.ts":
    "runs from the pre-commit hook in every fresh worktree, including one with no `node_modules` yet, so a "
    + "workspace import of `cli-flags.ts` would fail there and be misread as a finding on every staged line (#535). "
    + "Its extra-argument check is a bare argv length check that fails CLOSED",
  "packages/cli/src/cli.ts":
    "REAL GAP. The product CLI reads its flags in its own `parseArgs` (line 305), which does not call "
    + "`refuseUnknownFlags`. Moving it onto the guard is a behaviour change outside this row, recorded here so it "
    + "cannot be forgotten",
  "packages/cli/src/action/run.ts":
    "REAL GAP. Reads named flags through `flagValue` (line 86), which takes only the flags it asks for, so an "
    + "unrecognised flag is ignored and the default runs. A behaviour change outside this row",
  "packages/cli/src/action/post-comment.ts":
    "REAL GAP. Reads named flags through `flagValue` (line 71), which takes only the flags it asks for, so a typo "
    + "is ignored. Same shape as its sibling `action/run.ts`",
  "packages/cli/src/action/auth-masks.ts":
    "REAL GAP. Finds each named flag with `argv.indexOf` (line 45), so an unrecognised flag is never looked at and "
    + "never refused",
  "packages/cli/src/auth/attach-spike.ts":
    "reads no flags: `process.argv[2]` is a question key, looked up in `QUESTIONS` (line 215)",
  "packages/cli/src/auth/fixtures/auth0-spa/serve.ts":
    "a test fixture server whose flags go through `node:util` `parseArgs` with `strict: true` (line 95), which "
    + "refuses an unknown option itself",
  "packages/cli/src/auth/fixtures/serve-cross-origin-idp.ts":
    "a test fixture server whose flags go through `node:util` `parseArgs` with `strict: true` (line 51), which "
    + "refuses an unknown option itself",
  "packages/cli/src/scan/run-axe.ts":
    "reads no flags: one positional target at `process.argv[2]` (line 11)",
  "packages/judge/src/fitness/rules-check.ts":
    "reads no flags: its only `process.argv` use is the entry-point guard (lines 88-89)",
  "packages/scorer/src/fetch-encoder.ts":
    "a PASSTHROUGH: every argument is handed to the Python fetch encoder verbatim (line 13), so there is no flag "
    + "set here for a guard to read",
};

/** Every package directory, as `packages/<name>`, so a new package joins the census without an edit here. */
const packageDirs = readdirSync(join(REPO, "packages"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `packages/${entry.name}`);

const SOURCE_ROOTS = ["scripts", ...packageDirs.flatMap((pkg) => [`${pkg}/src`, `${pkg}/scripts`])]
  .filter((dir) => existsSync(join(REPO, dir)));

const isSource = (path: string) => /\.(ts|mjs)$/.test(path) && !/\.test\.(ts|mjs)$/.test(path)
  && !/\.d\.ts$/.test(path);

/** Every source file under the repo-relative `dir`, as repo-relative paths. */
function sourcesIn(dir: string): string[] {
  return filesUnder(join(REPO, dir), {
    skipDirectory: (name) => name === "node_modules" || name === "dist",
    keepFile: isSource,
  }).map((full) => full.slice(REPO.length)).sort();
}

const readSource = (rel: string): string => stripComments(readFileSync(join(REPO, rel), "utf8"));

/**
 * Does this file read argv? Comments are stripped first: matching raw source would classify a module as a CLI
 * because a COMMENT mentioned `process.argv`, which is a check deriving its expectations from prose about the
 * code rather than the code. Excludes the guard's own definition, which mentions `process.argv` in its
 * implementation without being a command line for anything to classify.
 */
function readsArgv(rel: string): boolean {
  const source = readSource(rel);
  return source.includes("process.argv") && !source.includes("export function refuseUnknownFlags");
}

/** Does this file's own source call the guard? Comments are stripped, so a prose mention does not count. */
const callsTheGuard = (rel: string): boolean => /refuseUnknownFlags\s*\(/.test(readSource(rel));

const commandLineSources = (): string[] => SOURCE_ROOTS.flatMap(sourcesIn).filter(readsArgv);

test("the census walks the real tree, so this cannot pass having read nothing", () => {
  const found = commandLineSources();
  assert.ok(found.length >= CENSUS_FLOOR, `only ${found.length} argv readers found; the layout moved`);
  // Positive control: a command that reads argv and is NOT guarded must be discovered as one. Without this, a
  // walk that finds nothing would leave the emptiness assertion below passing for no reason.
  assert.ok(found.includes("scripts/run.ts") && !callsTheGuard("scripts/run.ts"),
    "scripts/run.ts reads argv and does not call the guard, so the census must find it");
});

test("the unguarded list names files that exist, still read argv, and are not already guarded", () => {
  // A stale entry is a list that lies two ways: it claims an exemption for a file that no longer exists or no
  // longer reads argv, or for a file that has since started calling the guard. The last is the direction that
  // matters most, because nothing else would notice a stale line once its file was fixed.
  const readers = new Set(commandLineSources());
  for (const path of Object.keys(UNGUARDED)) {
    assert.ok(existsSync(join(REPO, path)), `${path} is on the unguarded list and does not exist`);
    assert.ok(readers.has(path), `${path} is on the unguarded list but no longer reads argv -- delete its line`);
    assert.ok(!callsTheGuard(path),
      `${path} now calls refuseUnknownFlags -- delete its UNGUARDED line, the file is guarded`);
  }
});

test("a new CLI cannot quietly join the unguarded ones", () => {
  // No list to edit for the guarded case: a file is classified by calling the guard, not by being added here.
  const surprises = commandLineSources().filter((path) => !callsTheGuard(path) && !(path in UNGUARDED));
  assert.deepEqual(surprises, [],
    "these read argv and neither call refuseUnknownFlags nor appear in UNGUARDED. Call the guard in the file "
    + "itself (preferred: an ignored flag runs the default and reports success), or add an entry to UNGUARDED "
    + "with a reason.");
});

test("every exemption declares a real reason, not a placeholder", () => {
  // The count of exemptions is deliberately not asserted: it goes stale on every merge that guards a file. The
  // invariant is recomputed from the tree by the test above. What remains is that an exemption is a decision with
  // a reason attached, not a line added to make a test pass.
  for (const [path, why] of Object.entries(UNGUARDED)) {
    assert.ok(why.length > REASON_MIN_LENGTH,
      `${path} is exempt from the flag guard with no real reason given. An exemption without one is `
      + "indistinguishable from an oversight, which is the whole thing this list exists to prevent.");
  }
});

test("every call site passes its own import.meta.url", () => {
  // The guard refuses a call without `entry` at runtime, but only where that call happens to run. This test covers
  // the call sites that no test executes. It iterates the DISCOVERED guarded set, so a new guarded file is covered
  // the moment it calls the guard.
  const guarded = commandLineSources().filter(callsTheGuard);
  assert.ok(guarded.length >= GUARDED_FLOOR, `only ${guarded.length} guarded files found; the census is not reading them`);
  const offenders = guarded.filter((path) => {
    const source = readSource(path);
    const call = source.slice(source.search(/refuseUnknownFlags\s*\(/));
    const args = call.slice(0, call.indexOf(");") + 2);
    return !/entry:\s*import\.meta\.url/.test(args);
  });
  assert.deepEqual(offenders, [],
    "these pass no `entry`, so if anything imports them their guard inspects the importer's flags");
});
