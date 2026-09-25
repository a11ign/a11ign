#!/usr/bin/env node
// @ts-check
// command: prove a guard actually bites: mutate a file, confirm its test fails, restore, confirm it passes
// MUTATION CHECKING, AS A COMMAND RATHER THAN A SEQUENCE PEOPLE TYPE.
//
// This repository relies on mutation checking more than on any other technique: almost every guard here
// is trusted because somebody broke the thing it watches and saw it fail. The sequence is five steps and
// every one of them has been got wrong in this repo, twice on 2026-09-06 alone:
//
//   1. RUN THE TEST FIRST. A mutation check against an already-red test tells you nothing, and a mutation
//      check against a test that passes VACUOUSLY tells you less than nothing.
//   2. COPY THE FILE ASIDE. `git checkout -- <file>` restores it to HEAD, silently discarding every
//      uncommitted change in it and not only the mutation. CLAUDE.md names that command because it once
//      destroyed release-eligible model weights; it destroyed two board-report fixes on 2026-09-06,
//      mid-mutation-check, which is the exact workflow the rule exists for.
//   3. PROVE THE MUTATION LANDED. A shell-quoting slip makes the edit a no-op, the test then passes, and
//      the passing test reads as "the guard does not bite" when it means "nothing was broken". That
//      happened here: a `python3 -c` replacement was mangled by the shell and reported a working guard as
//      broken.
//   4. THE TEST MUST FAIL. If it passes, SUSPECT THE GUARD BEFORE THE CODE. Two guards shipped green
//      against the very defect they were written for on 2026-09-06 -- one read the whole document where
//      it meant to read one section, and its `some()` was satisfied by a correct line sitting beside the
//      broken one.
//   5. RESTORE, AND RUN AGAIN. The re-run proves the restore worked, rather than that `cp` exited zero.
//
// Usage:
//   npm run mutate -- --file=<path> --mutate='<shell that edits the file>' --test='<shell>'
//
// A CALLER TRYING MANY MUTANTS OF ONE FILE AGAINST ONE TEST (#2448) pays for the clean run and the restored
// run once per mutant, and both are the same fact N times. So it may say it has done the first and do the
// second once, at the end:
//   npm run mutate -- --file=<path> --mutate='<shell>' --test='<shell>' --per-mutant --baseline-passed
//       runs the test ONCE (mutated), still copies the file aside and still checks its bytes after EVERY
//       mutant, and keeps the exit codes and sentences below. `--per-mutant` alone is refused: the clean run
//       is what refuses an already-red test, so the caller must state (`--baseline-passed`) that it ran it.
//   npm run mutate -- --file=<path> --test='<shell>' --prove-restored
//       run ONCE after the last mutant: the test, on the file as the batch left it. Exit 0 if it passes,
//       3 if it fails -- "byte-identical but the test now fails" is a build output or cache a mutation
//       command touched, which the per-mutant byte check cannot see. Its exit 0 does NOT mean a guard bit.
// Without those flags nothing changes: three runs, as before.
//
// THE LIMIT OF EXIT 0, AND IT IS THE ONE THING THIS TOOL CANNOT CHECK FOR YOU.
//
// This script observes that the test command exited NONZERO while the file was mutated. It cannot observe
// WHY. A mutation that breaks the build, mistypes an import, or trips an unrelated assertion produces the
// identical red, and the report then says THE GUARD BITES about a guard that was never consulted. That is
// step 4's warning ("suspect the guard before the code") pointed at this tool rather than at the test, and
// it is the #51 lesson -- a forced-1ms mutation that failed for the wrong reason and nearly certified a
// false pass -- reappearing inside the instrument built to prevent it.
//
// So for any mutation whose expected failure is SPECIFIC -- a named assertion, a particular skip, a
// message you predicted -- run it once by hand as well (`cp` aside, mutate, run, READ THE OUTPUT, `cp`
// back, `cmp`) and confirm the red says what you predicted. Measured 2026-09-06 on the corpus-guard
// wiring: the expected result was the test being SKIPPED with `skipped: a capture is writing runs/`, and
// only reading the output distinguished that from a compile error wearing the same exit code.
//
// Exit codes are the contract:
//   0  the guard BITES -- passed clean, failed mutated, passed restored. See the limit above: this means
//      the suite went red, NOT that it went red for the reason you mutated
//   1  the guard DID NOT BITE -- it passed while the code was broken
//   2  refused before mutating -- the test was already failing, or the arguments are unusable
//   3  THE RESTORE FAILED -- the file on disk is not what it was. Loud, and the copy is left in place.
//
// #516: DO NOT NAME THIS SCRIPT ON A `Refutation:` LINE. `Refutation:` (packages/agent-org/src/acceptance-commands.mjs)
// reads success as any NON-ZERO exit (#438) -- the OPPOSITE of exit 0 above meaning the guard bites. That
// parser now refuses (rather than misreads) a `Refutation:` line naming `mutate`; paste this script's real
// output under an unparsed heading instead (#504).
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, mkdtempSync } from "node:fs";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { refuseUnknownFlags } from "@a11ign/worker-fleet/cli-flags";
import { sandboxGitEnv } from "./git-env.mjs";

const EXIT = { BITES: 0, DID_NOT_BITE: 1, REFUSED: 2, RESTORE_FAILED: 3 };

/** @type {(file: string) => string} */
const digest = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

/**
 * Run a shell command, returning whether it succeeded and its combined output.
 *
 * `GIT_*` is scrubbed: a mutation check is most often run from a hook or a test harness, and a leaked
 * `GIT_DIR` makes any git the command reaches operate on a different repository.
 * @param {string} command
 */
function run(command) {
  try {
    const out = execSync(command, { encoding: "utf8", stdio: "pipe", env: sandboxGitEnv() });
    return { ok: true, out };
  } catch (error) {
    const e = /** @type {{ stdout?: string, stderr?: string }} */ (error);
    return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

/** @param {string} message @returns {never} */
function refuse(message) {
  console.error(`REFUSING: ${message}`);
  process.exit(EXIT.REFUSED);
}

const KNOWN_FLAGS = ["--file", "--mutate", "--test", "--keep", "--per-mutant", "--baseline-passed",
  "--prove-restored"];

/** @returns {{ file?: string, mutate?: string, test?: string, perMutant: boolean, baselinePassed: boolean, proveRestored: boolean }} */
function readArgs() {
  const argv = process.argv.slice(2);
  /** @type {(name: string) => string | undefined} */
  const flag = (name) => argv.find((a) => a.startsWith(`${name}=`))?.split("=").slice(1).join("=");
  return { file: flag("--file"), mutate: flag("--mutate"), test: flag("--test"),
    perMutant: argv.includes("--per-mutant"), baselinePassed: argv.includes("--baseline-passed"),
    proveRestored: argv.includes("--prove-restored") };
}

const USAGE = "this needs --file=<path> --mutate='<shell that edits it>' --test='<shell>'.\n"
  + "  Example:\n"
  + "    npm run mutate -- --file=src/rules.ts \\\n"
  // perl -pi -e, not sed -i '' -- BSD sed (macOS) needs the empty backup-suffix argument GNU sed
  // (Linux/CI) does not, and GNU sed then reads that empty string as the SCRIPT and the real script
  // as a FILENAME to edit -- "sed: can't read s/.../.../: No such file or directory". perl's -i has
  // no such split between platforms.
  + "      --mutate=\"perl -pi -e 's/>= 3/>= 99/' src/rules.ts\" \\\n"
  + "      --test='npx tsx --test src/rules.test.ts'";

/**
 * The two batch flags are a pair, and either alone is refused rather than ignored: `--per-mutant` without
 * the statement would let a caller skip the "already failing" check by typing less, and the statement
 * without the mode would read as having asked for something it did not get (#2448).
 * @param {ReturnType<typeof readArgs>} args
 */
function refuseBadBatchFlags({ perMutant, baselinePassed, proveRestored, mutate }) {
  if (proveRestored && (perMutant || baselinePassed || mutate)) {
    refuse("--prove-restored runs the test once, on a file nobody is mutating: it takes --file and --test "
      + "only, not --mutate, --per-mutant or --baseline-passed.");
  }
  if (perMutant && !baselinePassed) {
    refuse("--per-mutant skips the clean run that refuses 'the test is ALREADY FAILING', so it needs "
      + "--baseline-passed: your statement that you ran the test clean and it passed. A mutation check "
      + "against an already-red test proves nothing, and this tool can no longer see that for itself.");
  }
  if (baselinePassed && !perMutant) {
    refuse("--baseline-passed only means something with --per-mutant; without it the clean run happens "
      + "anyway, and a flag that changes nothing reads as if it did.");
  }
}

/**
 * The batch's closing proof, run once after the last mutant: the per-mutant path checks the file's bytes
 * every time but no longer runs the test on the restored file, so "byte-identical yet the test now fails"
 * (a build output or a cache the mutation command touched) is reachable only here.
 * @param {string} file @param {string} test
 */
function proveRestored(file, test) {
  const after = run(test);
  if (!after.ok) {
    console.error(`\nTHE TEST FAILS ON ${file} AFTER THE BATCH. Every mutant restored the file byte for byte, `
      + "so something a mutation command touched is outside --file: a build output, a second source file, "
      + `a cache.\n\n${after.out.trim().slice(-2000)}`);
    process.exit(EXIT.RESTORE_FAILED);
  }
  console.log(`restored: the test PASSES on ${file} after the batch.`);
  process.exit(EXIT.BITES);
}

/**
 * 1. THE TEST MUST PASS FIRST. In per-mutant mode the caller has said it already did, and that is taken
 * on its word: this tool cannot see a run that happened in another process.
 * @param {string} test @param {boolean} baselinePassed
 */
function requireCleanBaseline(test, baselinePassed) {
  if (baselinePassed) return;
  const before = run(test);
  if (!before.ok) {
    refuse(`the test is ALREADY FAILING before anything was mutated, so this check would prove nothing.\n`
      + `Fix or identify that first. Nothing was touched.\n\n${before.out.trim().slice(-2000)}`);
  }
}

/**
 * 3 and 4: the mutation must have landed, and then the test must fail.
 * @param {{ file: string, test: string, applied: { ok: boolean, out: string }, changed: boolean }} mutation
 */
function judgeMutation({ file, test, applied, changed }) {
  if (!changed) {
    console.error(`\nREFUSING: the mutation command changed nothing -- ${file} is byte-identical.\n`
      + "A no-op edit makes the test pass for the wrong reason, and that passing test reads as "
      + "'the guard does not bite'.\n"
      + "Check the quoting; a shell-mangled replacement is the usual cause.\n"
      + (applied.ok ? "" : `\nThe mutation command itself failed:\n${applied.out.trim().slice(-1000)}`));
    return EXIT.REFUSED;
  }
  const during = run(test);
  if (during.ok) {
    console.error("\nTHE GUARD DID NOT BITE. The code is broken and the test still passes.\n"
      + "SUSPECT THE GUARD BEFORE THE CODE: is it asserting on the half you changed, is its "
      + "`some()` satisfied by a neighbour, is it reading a built copy rather than the source?");
    return EXIT.DID_NOT_BITE;
  }
  console.log("mutated:  test FAILS, as it must. First lines of why:\n"
    + during.out.trim().split("\n").slice(0, 6).map((l) => `  ${l}`).join("\n"));
  return EXIT.BITES;
}

/**
 * 5. RESTORE, AND PROVE IT -- by bytes always, and by running the test again unless per-mutant mode moved
 * that proof to the end of the batch (`--prove-restored`).
 * @param {{ file: string, stash: string, original: string, test: string, perMutant: boolean }} restore
 */
function restoreAndProve({ file, stash, original, test, perMutant }) {
  copyFileSync(stash, file);
  if (digest(file) !== original) {
    console.error(`\nTHE RESTORE FAILED. ${file} is not what it was. The copy is at ${stash} and has `
      + "NOT been deleted. Restore it by hand before doing anything else.");
    process.exit(EXIT.RESTORE_FAILED);
  }
  if (perMutant) {
    console.log(`restored: ${file} is byte-identical. The test was NOT re-run (--per-mutant): run `
      + "--prove-restored once after the last mutant.");
    return;
  }
  const after = run(test);
  if (!after.ok) {
    console.error(`\nTHE FILE IS RESTORED BYTE FOR BYTE AND THE TEST NOW FAILS ANYWAY. Something the `
      + "mutation command touched is outside --file: a build output, a second source file, a cache.\n"
      + `The copy is at ${stash}.\n\n${after.out.trim().slice(-2000)}`);
    process.exit(EXIT.RESTORE_FAILED);
  }
  console.log(`restored: ${file} is byte-identical and the test PASSES again.`);
}

function main() {
  refuseUnknownFlags(KNOWN_FLAGS, { entry: import.meta.url, command: "npm run mutate" });
  const args = readArgs();
  const { file, mutate, test, perMutant, baselinePassed } = args;
  if (args.proveRestored) {
    if (!file || !test) refuse("--prove-restored needs --file=<path> --test='<shell>'.");
    refuseBadBatchFlags(args);
    if (!existsSync(file)) refuse(`${file} does not exist.`);
    return proveRestored(file, test);
  }
  if (!file || !mutate || !test) refuse(USAGE);
  refuseBadBatchFlags(args);
  if (!existsSync(file)) refuse(`${file} does not exist.`);

  requireCleanBaseline(test, baselinePassed);

  // 2. COPY ASIDE, never `git checkout --`.
  const stash = path.join(mkdtempSync(path.join(tmpdir(), "mutate-")), path.basename(file));
  copyFileSync(file, stash);
  const original = digest(file);
  console.log(baselinePassed
    ? `clean:    test assumed to PASS (--baseline-passed). ${file} copied to ${stash}`
    : `clean:    test PASSES. ${file} copied to ${stash}`);

  const applied = run(mutate);
  let verdict;
  try {
    verdict = judgeMutation({ file, test, applied, changed: digest(file) !== original });
  } finally {
    restoreAndProve({ file, stash, original, test, perMutant });
  }

  if (verdict === EXIT.BITES) console.log("\nTHE GUARD BITES.");
  process.exit(verdict);
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
