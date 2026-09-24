# Machine-chosen mutants: the replay that gates shipping (#2415)

`ceo` ruled on #928 (2026-09-24, ruling 1) that **the first deliverable is a replay, not a feature**: run a generator that
chooses its own mutants over the three PRs whose first review was refused for a test that did not test its claim, at
the commits the reviewer refused, and ship it only if it surfaces the path the reviewer named on **at least 2 of the 3**.
Fewer, and the row closes as a recorded null result. `packages/lab/src/packaging/mutant-replay-record.test.ts` holds this
file's verdict line to the count below and to the wiring in `pr-open.mjs`, in both directions.

Verdict: SHIP

Found: 2 of 3, and **read the two caveats before quoting that** (the second replay is half a path; the third was not found).

## What was replayed, and how

- **The generator** is `packages/guards/src/mutant-survivors.mjs`, run as `node packages/guards/src/mutant-survivors.mjs run
  --base=<merge base> --test='<the Acceptance commands the reviewer ran>' --budget=300 --cap=10`, which is exactly what
  `pr:open` runs on a `create` (budget and cap are its defaults). It chooses mutants on the lines the diff **added**, in
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
- **"Found" means:** a survivor sits on a line the reviewer's own mutation (or, where the reviewer named none, the line the
  blocker names) edited, and is the same kind of edit -- a value the named tests never read. It is a judgement about
  a match of file, line and kind, and each row below states the survivor so it can be argued with.

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
- Found: yes
- Operators that found it: arg-empty, cond-false
- Survivor covering it: `packages/lab/src/training/case-matrix.mjs:1409` (`label ? <label>...: ""` -> `false ? ...`, so `statusPageField` always returns `""`: the reviewer's `statusPageField("")` mutant in behaviour), and `:1435` and `:1456`, one in each of the two builders the reviewer edited (`statusPageField(field)` -> `statusPageField([])`, the field discarded).
- **Half a path.** The reviewer discarded `element` AND `field`. The `field` half is found; **the `element` half is not**: `<${element} id="state">` is a template interpolation and no operator here replaces one, so a builder that ignores `element` is not among the mutants. The row's third dimension, heading presence, is not either. If "found" is read as "the whole of the reviewer's mutation", this row is a NO and **the verdict below is NULL RESULT**; it is read here as the file, line and kind the record's own definition gives, and that reading is `ceo`'s to overrule.
- Size: 5 mutants chosen, 5 run, 2 killed, 3 survived, 4.6 minutes at a host load average of 33-46 (each mutant runs the two test files three times).

## What the operators missed on #2368, and why

<!-- TARGETED-PROBE -->

## Threats to this reading

- **It is in-sample.** The operators were written AFTER the three refusals were read, and `arg-empty` (an argument replaced with `[]`) is the reviewer's own #2384 mutant turned into a class. The two hits are therefore evidence that the operators can express what these reviewers did, not that they find what a reviewer will do next. The ruling's threshold is the ruling's; this is why the tool ships advisory-only and does not refuse.
- **Wall-clock budgets are measured on a shared host.** These runs shared the box with other sessions' suites (load average 15-71 while they ran), so "ran 12 of 695" is a count under that load and would read higher on a quiet machine. The direction is not in doubt: `mutation-check.mjs` runs the test three times per mutant (before, mutated, after), so a PR whose named test takes 12s costs 36s a mutant.
- **A big PR is exactly where the budget bites.** #2368 changed 28 files and added `auth-flow.mjs` whole; the budget covers under 2% of its mutants. "DID NOT FINISH", and how many never ran, is printed on the PR body for that reason.
- **Noise.** #2384: 12 survivors of 24. Equivalent mutants are in there (a comparator's tie-breaker, an unread argument); the cap (10) and the count cut are stated on the body, and nobody is refused on the list.
- **A syntax-error mutant reads as killed.** The suite goes red for the wrong reason; that can hide a survivor and cannot invent one.

## What ships

`pr:open create` runs the generator over the branch's added lines against the tests the body's `Acceptance:` names, for
`A11Y_SURVIVORS_BUDGET` seconds (default 300; `0` skips it and says so), and appends a `## Survivors` section to the body it
sends. It refuses nothing; it never runs on `edit`; an author's own `Mutation:` section still runs as #2307 built it.
