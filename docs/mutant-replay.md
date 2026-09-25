# Machine-chosen mutants: the replay that gates shipping (#2415)

`ceo` ruled on #928 (2026-09-24, ruling 1) that **the first deliverable is a replay, not a feature**: run a generator that
chooses its own mutants over the three PRs whose first review was refused for a test that did not test its claim, at
the commits the reviewer refused, and ship it only if it surfaces the path the reviewer named on **at least 2 of the 3**.
Fewer, and the row closes as a recorded null result. `packages/lab/src/packaging/mutant-replay-record.test.ts` holds this
file's verdict line to the count below and to the wiring in `pr-open.mjs`, in both directions.

Verdict: NULL RESULT

Found: 1 of 3 (one exact, one half, one miss), **and that one is in-sample.** `ceo` ruled NULL RESULT on #2415 (2026-09-25):
nothing ships into `pr-open.mjs`, the row closes on this record, and the generator stays as a script run by hand.

**How each was read.** #2384 is found exactly, but `arg-empty` is the #2384 mutant turned into an operator class, so finding
it shows the operators were written from the answer, not that they find a path they have not been shown. #2392 is HALF a
path: the reviewer's mutant discarded `element` AND `field`, the tool covers `field`, and **no operator replaces the
`<${element}>` interpolation, so a builder that ignores `element` passes, which is the path the reviewer named.** An earlier
draft of this record counted that as found on "the same file, line and kind"; `ceo` refused that reading, because it lets the
author of the operators decide what counts as found. #2368 is not found: 12 of 695 mutants ran at the default budget. A half
is counted as not found, in the `Found:` line of each section (`yes`, `half`, `no`) and in the count above.

## What was replayed, and how

- **The generator** is `packages/guards/src/mutant-survivors.mjs`, run as `node packages/guards/src/mutant-survivors.mjs run
  --base=<merge base> --test='<the Acceptance commands the reviewer ran>' --budget=300 --cap=10`, which is the
  budget and cap this row proposed for `pr:open` (its defaults), run by hand. It chooses mutants on the lines the diff **added**, in
  source files (never tests, comments or docs), with six line-local operators; it applies each through
  `mutation-check.mjs` (`npm run mutate`), so the copy-aside, the byte-for-byte restore and the exit codes are that tool's.
- **Each PR at the commit the reviewer refused**, in a detached worktree (`git worktree add --detach <dir> <commit>`),
  `node_modules` symlinked to the primary's, `--base` the merge base with `main` at the time.
- **The tests are the reviewer's own recorded Acceptance commands** for that head, because those are what the row's
  "only the tests the row names" means at `pr:open`. #2392 needed `A11Y_ALLOW_FOREIGN_RESOLUTION=1`, as the reviewer's run did:
  the symlinked `node_modules` resolves package imports into the primary.
- **Every mutant's exit was believed only with `mutation-check.mjs`'s own sentence beside it** (`THE GUARD BITES.` /
  `THE GUARD DID NOT BITE.`): a crash also exits 1, which is the code for "survived". In these three replays, 0 mutants were
  refused or unreadable, so no result below rests on a crash.
- **"Found" means:** a survivor reproduces the WHOLE of what the reviewer's own mutation did (or, where the reviewer named
  none, of what the blocker names). A survivor on the same line that covers only part of it is `half`, and `half` does not
  count. This is `ceo`'s reading; the first draft's looser one (file, line and kind) is withdrawn. Each row below states
  the survivor so it can be argued with.

## The replays

### #2384 at `9eee4fdb`
- Refused: 2026-09-24T17:14:37Z, reviewer-2, "not convinced": *the acceptance test does not exercise the build's provenance integration, so a mutation that replaces `rejected` with `[]` still passes all six tests.*
- Reviewer's path:
> The test calls `rejectedAsTruncated` directly and never invokes `build-realism-tier.mjs`/`writeProvenance` with a non-empty rejected set. I changed the subject at `writeProvenance` from `rejectedAsTruncated(rejected)` to `rejectedAsTruncated([])` (confirmed by printing the changed line), and the required acceptance still passed 6/6.
- Tests run: `npx tsx --test packages/lab/src/training/rejected-as-truncated.test.ts`
- Found: yes
- Operators that found it: arg-empty
- Survivor covering it: `packages/lab/scripts/build-realism-tier.mjs:331` (`rejectedAsTruncated(rejected)` -> `rejectedAsTruncated([])`), **byte-identical to the reviewer's mutant**, first in the list. `:415` (`writeProvenance(..., rejected)` -> `writeProvenance(..., [])`) survives too: the same gap seen from the caller.
- Size: 24 mutants chosen, 24 run, 12 killed, 12 survived (10 listed at the default cap, 2 cut), 3.8 minutes at a host load average of 15-33. The other 11 survivors were not classified as equivalent or real.

### #2368 at `011da083`
- Refused: 2026-09-24T15:34:57Z, reviewer-2, "not convinced": *the interpreter parity test does not exercise its twelfth scenario through both implementations, leaving the claimed parity lock incomplete.*
- Reviewer's path:
> `packages/cli/src/auth/interpreter.test.ts:213-225` is the twelfth test and only calls the CLI's `controlsNamed`, `expectationMet`, and `requiredEnvNames`; it never calls the worker counterparts or compares results. The first 11 tests call `both(...)`, so the 12-test count is real but the “each through BOTH” claim is not.
- Tests run: `npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/cli/src/auth/interpreter.test.ts && npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/cli/src/auth/rule-layer.test.ts`
- Found: no
- Operators that found it: none
- Survivor covering it: none
- Size: **695 mutants chosen; the 300s budget ran 12 (host load about 20) and, on a second run, 4 (load 46-55)** -- "DID NOT FINISH" both times, and 683 or 691 were never run. The mutants that ran sit at the first line of each of ten files, and none is in `auth-flow.mjs`'s three helpers. `packages/nvda-worker/src/auth-flow.mjs` alone is 405 of the 695: a file the PR ADDED whole is every line "changed".
- Why not found is in the section below.

### #2392 at `0c929352`
- Refused: 2026-09-24T17:40:58Z, reviewer-2, "not convinced": *the required page-shape variation is not pinned by the acceptance tests.*
- Reviewer's path:
> The new test checks the population floor, announced strings, status roles, and well-formedness, but never checks those shape distributions. I changed both builders to discard `element` and `field`, making every new page a `<p>` with no named field; the acceptance suite remained green.
- Tests run: `A11Y_ALLOW_FOREIGN_RESOLUTION=1 node packages/guards/src/assert-glob-not-empty.mjs "packages/lab/src/training/case-matrix.test.ts" --min=1 --run` and the same for `held-out-is-disjoint-from-training.test.ts`
- Found: half
- Operators that found it: arg-empty, cond-false
- Survivor covering it: the `field` half only, `packages/lab/src/training/case-matrix.mjs:1409` (`label ? <label>...: ""` -> `false ? ...`, so `statusPageField` always returns `""`: the reviewer's `statusPageField("")` mutant in behaviour), and `:1435` and `:1456`, one in each of the two builders the reviewer edited (`statusPageField(field)` -> `statusPageField([])`, the field discarded).
- **Half a path.** The reviewer discarded `element` AND `field`. The `field` half is found; **the `element` half is not**: `<${element} id="state">` is a template interpolation and no operator here replaces one, so a builder that ignores `element` is not among the mutants. The row's third dimension, heading presence, is not either. If "found" is read as "the whole of the reviewer's mutation", this row is a NO, and that is the reading `ceo` ruled: **it is `half`, it does not count, and the verdict is NULL RESULT.** What the operators missed is the `element` half (no operator replaces a template interpolation) and the row's third dimension, heading presence.
- Size: 5 mutants chosen, 5 run, 2 killed, 3 survived, 4.6 minutes at a host load average of 33-46 (each mutant runs the two test files three times).

## What the operators missed on #2368, and why

**The operators can express it; the budget does not reach it.** To separate the two, a side run (NOT the default configuration,
and chosen with the answer in hand) restricted the mutants to the lines of the three helpers the reviewer named in
`packages/nvda-worker/src/auth-flow.mjs` -- `requiredEnvNames` (:232-236), `controlsNamed` (:344-356), `expectationMet`
(:358-366) -- and ran them against the same two test files with no time limit. **47 mutants, 47 run, 22 killed, 25 survived, 0 refused,
about 33 minutes** (load average 82 falling to 2 while it ran). Survivors in each of the three: `requiredEnvNames` (:233 both spreads
emptied, :234 a condition forced false and both flips, :235 `return null` and the `new Set` argument emptied), `controlsNamed` (:349 the
walk-up loop's condition and its `byId.get` argument, :350 the name comparison flipped, :352 `return false` -> `null`), and
`expectationMet` (:361 and :362 forced false and flipped, :363 all three role lists emptied, :364 and :366 the return and the
arguments). That is the reviewer's finding, read off by a machine: **no test the row names reads what the worker's helpers return.**

So the miss on this PR is a miss of REACH, and there are three reasons, none of them an operator:

1. **695 mutants against a budget for about ten.** `auth-flow.mjs` was added whole, so all 405 of its lines are "changed", and the
   round-robin across ten files takes each file's first mutant before any file's second. The three helpers sit at :232-366 of a
   file whose priority-ordered list reaches them long after the budget ends.
2. **Three test runs a mutant.** `mutation-check.mjs` runs the test clean, mutated and restored, so a 12-second test costs 36
   seconds a mutant, of which 24 are the clean run and the post-restore run. A one-run-per-mutant mode is the
   obvious lever and lives in `mutation-check.mjs`, outside this row's Region, so it is a follow-up and not in this diff.
3. **No notion of which changed line a test could reach.** A mutant on a line no named test executes cannot be killed by it, and
   that is not the same finding as a line it executes and never asserts on; this generator does not tell them apart.

## Threats to this reading

- **It is in-sample.** The operators were written AFTER the three refusals were read, and `arg-empty` (an argument replaced with `[]`) is the reviewer's own #2384 mutant turned into a class. The hit is therefore evidence that the operators can express what one reviewer did, not that they find what a reviewer will do next; it is one of the reasons the verdict is NULL RESULT.
- **Wall-clock budgets are measured on a shared host.** These runs shared the box with other sessions' suites (load average 15-71 while they ran), so "ran 12 of 695" is a count under that load and would read higher on a quiet machine. The direction is not in doubt: `mutation-check.mjs` runs the test three times per mutant (before, mutated, after), so a PR whose named test takes 12s costs 36s a mutant.
- **A big PR is exactly where the budget bites.** #2368 changed 28 files and added `auth-flow.mjs` whole; the budget covers under 2% of its mutants. "DID NOT FINISH", and how many never ran, is printed for that reason.
- **Noise.** #2384: 12 survivors of 24. Equivalent mutants are in there (a comparator's tie-breaker, an unread argument); the cap (10) and the count cut are stated in the output, and nobody is refused on the list. (A wired `pr:open` would have printed this on every PR.)
- **A syntax-error mutant reads as killed.** The suite goes red for the wrong reason; that can hide a survivor and cannot invent one.

## The generator run on its own diff

Before the wiring was removed, the generator was run on this branch's own diff (`A11Y_SURVIVORS_BUDGET=150`): **16 of 247 mutants ran,
4 survived**, and "DID NOT FINISH" was printed. All four were real gaps in the first draft of this row's own tests
(`matchAll(CALLEE)` -> `matchAll([])` and `slice(0, m.index)` -> `slice(0, [])` in the generator, and two in the `pr-open.mjs`
wiring that has since been removed). One PR is not a rate: it is the tool finding something on the first diff it saw that its
author had not, and the author had written the operators.

## What ships

**Nothing into `pr-open.mjs`**, and no `## Survivors` section, `A11Y_SURVIVORS_BUDGET` or `survivors` dependency there. The
generator and its test stay as a script run by hand (`node packages/guards/src/mutant-survivors.mjs run ...`, the command in
the first section) so this record can be reproduced; it is not an npm script and nothing calls it. **The row closes on this
record, and a null result is a finished row.**

**Not closed for good.** A one-run-per-mutant mode in `mutation-check.mjs` (#2448) would triple the reach, and bears on the
#2368 miss. If it lands, a re-replay is a NEW row with its own gate, and its operators must be fixed BEFORE the three refusals
are re-read, or run on refusals not yet seen. This record does not pre-decide it.
