# How to prove a gate

A **gate** is any check whose refusal stops work: a release, a corpus run, a deploy. This repo has 16.
This is the recipe for taking one from *believed* to *watched failing*, and the evidence for why the
recipe is shaped the way it is.

`gates-are-proven.test.ts` holds the register and the count. It may only rise.

## Why gates need proving at all

Nine defects on 2026-08-27 were one class, and **not one was a product defect**. Each was a check that
could not report itself: the pipeline captured 39 of 89 pages by default, a 403 read as "same page, fine",
`--update` rewrote a baseline from partial coverage, `lab:reset` discarded a file and said "Nothing was
deleted", a report that found a dirty tree exited 0.

Every one was found by something *else* failing. The property they shared is that **none had ever been
observed to fire**. *The Site Reliability Workbook* (ch4, "Testing Alerting Logic") names this about
alerting rules, and a gate is an alerting rule:

> It's very likely that your alerting rules will not fire for months or years after you configure them,
> and you need to have confidence that when the metric passes a certain threshold, the correct engineers
> will be alerted with notifications that make sense.

Its prescription is a tiered test — does the signal move, does the rule fire, does the notification arrive
— and its fallback, when synthetic testing is impossible, is "a running system that exports well-known
metrics". Both halves are used below.

## The recipe

### 1. Disbelieve "it needs a fleet / a corpus / a venv"

This premise is usually **false**, and it has been false **seven times in a row** here:

| the claim | what was true |
|---|---|
| §3 "checking all `.mjs` needs `noImplicitAny` off" | every package build already compiles `.mjs` strictly, so the setting changes nothing |
| §7 "2.4.4 needs a real page that exhibits it" | one was already in the corpus; the *count* was bounded to one directory |
| `scorer:verify` "needs a real model directory" | its decision is a pure function, and the end-to-end case is a temp dir and two empty files |
| `scorer:migration` "needs a synthetic migration" | `migrationVerdict()` was already exported and pure; the command runs against a copied script in a temp tree |
| `corpus:applicability-audit` "needs the exported corpus" | `sweep()` says PURE in its own docstring; three hand-built records reach every branch |
| `gate:isolation` "needs a train/test split" | it does not check splits at all — it packs and installs each package outside the repo. The register's own description was wrong, and writing the proof is what found it |
| `check-signals` "needs runs/" | `signalMatches` is a boolean over plain fields; four one-line predicates cover the 811 highest-risk cases |

What a gate needs is almost never its whole production input. It needs the **subject of its claim**.

### 2. Separate the DECISION from the DATA

Most gates read a corpus and decide in one function, which is what makes them look untestable. Split them
and the decision becomes a pure function over a value you can hand-build:

```js
// before — reads the world, so a test needs the world
function pagesTheUpdateWouldDrop(current) { const baseline = readBaseline(); ... }

// after — the caller reads the world, the decision is a value in and a value out
export function pagesTheUpdateWouldDrop(current, baseline) { ... }
```

**This is not tidiness, and it is the step most likely to be skipped.** The first proof written for that
guard read the live baseline and *hoped* a stale key was still in it. One had been corrected that morning,
so the branch could never fire and a mutation deleting the guard **passed clean** — a canary that cannot
express the fault, inside the proof written to prevent exactly that.

### 3. Prove it at TWO tiers, because they fail independently

| tier | what it catches | cost |
|---|---|---|
| **the predicate** — call the pure decision with the fault present | the rule is wrong | milliseconds |
| **the command** — run the real entry point against a planted input | the rule is right and *nothing reaches it* | one temp directory |

Measured on `scorer:verify`, and this is the argument in one line:

```
break the predicate  (stop reporting unsafe files)   -> tier 1 fails, tier 2 fails
break the wiring     (still prints, exits 0)         -> tier 1 PASSES, tier 2 fails
```

The second is the `lab:reset` defect — a check that reports and does not block. **Tier 1 cannot see it.**
And tier 2 is the tier this repo keeps needing, because its signature defect is a correct remedy some path
never reaches: `refreshBrowseBuffer` guarded on a flag nothing set, `ensureSpeechChannel` fixed at one call
site of two, the census computed and never delivered to the classifier.

### 3a. One trap tier 2 will spring on you

A script that resolves its own root from `import.meta.url` and guards on `process.argv[1]` **will not run
at all** from a macOS temp directory: `tmpdir()` lives under `/var`, which is a symlink to `/private/var`,
so the two disagree and `main()` is skipped. The command then exits **0 having printed nothing**, which
reads exactly like a passing gate.

`realpathSync(mkdtempSync(...))` fixes it. Recorded because it cost twenty minutes and, next time, a
silent exit 0 from a copied script will look like the gate working rather than the gate never starting.

### 3b. The other trap tier 2 will spring on you: the report is not the verdict, the exit code is

**An rstest run that executed NOTHING prints `"status": "pass"` with every failure field at zero** — and
whether it does so depends on the ARGUMENT FORM, not on whether anything ran. Measured 2026-09-23 on
`@rstest/core@0.11.12` through this repo's own config:

| invocation | `status` | `testFiles` | exit |
|---|---|---|---|
| a glob `--include` narrowed past its last match | **`pass`** | 0 | 1 |
| ONE positional filter holding two paths (zsh does not word-split an unquoted `$ACC`) | **`pass`** | 0 | 1 |
| a LITERAL path that does not exist | `fail` | 1 | 1 |
| a pattern that matches (**the control**) | `pass` | 1 | 0 |

The two forms that say `pass` are the two a session types by hand; the one form reported as a failure is the
one nobody types when naming several files. And a zero-file run is identical to the control on `status`,
`failedFiles`, `failedTests` and the report's own closing `## Failures` / `No test failures reported.` —
**the only fields that separate them are counts of work DONE**, and a count is wrong only to a reader who
already knows what it should have been.

So it reads exactly like a surviving mutant: you broke the code, you ran the test, and nothing failed.
That is §6's sentence, drawn from a run that never happened.

**Read the exit code, and do not pipe it away.** rstest prints `error No test files found, exiting with
code 1` **above** the report, where `| tail -20` never reaches it, and a pipe discards the exit code —
`$?` is the tail's, and zsh needs `${pipestatus[1]}`. CI is not exposed (the exit code is 1, so the `ts`
and `acceptance` jobs go red); the hand-run that produces your claim is.

**And the report you get depends on WHO IS READING, which is why the exit code is the only reading worth
trusting.** rstest picks its reporter from `determineAgent()` — `AI_AGENT`, then `CLAUDECODE`/`CLAUDE_CODE`,
`CURSOR_AGENT` and the rest, switched off by `RSTEST_NO_AGENT=1`. **An agent session, which is every session
in this org, gets the markdown report above.** A GitHub runner has none of those variables and gets the
default reporter, which says `Test Files no tests` and no verdict word at all — the same defect in a
different costume: the empty run names no failure, so a reader greping for one finds nothing either way.
**The exit codes are 1, 1, 1, 0 under both.** This was found by the test below going red in CI while green
locally, and it is the reason that test DECLARES the mode rather than inheriting it.

`packages/lab/src/packaging/rstest-report-is-not-the-verdict.test.ts` pins the table above with real runs,
so the day rstest fixes the report this section is retired deliberately rather than left standing.

### 4. Assert the MESSAGE, not only the exit code

A refusal that does not name the offending thing sends the reader to search for it, which is the
difference between a gate and an obstacle. `weights.pkl` in the output is part of the contract.

### 4a. Assert WHERE the refusal comes from, not just that one happened

A mutation can be caught by accident. Deleting `gate:isolation`'s smoke-test precondition does not make it
pass — it fails later trying to copy the missing file, with a raw `ENOENT ... isolation-smoke.mjs`. A test
matching `/smoke/i` against the failure detail was satisfied by that ENOENT, so it caught the mutation for
the wrong reason and would have stopped working the day the error text changed.

Assert the STAGE. A gate that diagnoses its own precondition tells you to add a smoke test; one that trips
over a missing file tells you a path does not exist and leaves you to work out why. That distinction is
this repo's entire diagnostics model.

### 5. Include the control

Every proof needs a case that must NOT refuse. Without it, all the assertions above are satisfied by a
gate that refuses everything — safe, useless, and switched off the first time it blocks a release. That is
not hypothetical: `A11Y_SKIP_VERIFY=1` was used six times in one evening for a refusal that turned out to
be a stale local export.

### 6. Mutation-check, and record what each mutation caught

Break the guard; the proof must fail. Then restore and confirm it passes. **A guard not shown to fail is
not a proven guard**, and this step has caught a weak proof more than once — including one written during
this very exercise.

## What NOT to do

- **Do not make the proof run the real gate against production inputs.** Most need a fleet, a corpus or a
  venv, so it would skip in CI — and a test that skips vouches for nothing, which is the failure being
  fixed.
- **Do not derive the expected value from source TEXT.** A regex over the module under test can match
  nothing and pass. Measured twice here: the signal-type scrape and an earlier `sweepLog` guard. Read an
  exported value, or assert against a fixture.
- **Do not register a proof that only exercises the happy path.** That is `refreshBrowseBuffer`, which
  three green `capture:check` runs vouched for while it was inert.

## The honest state

Gates whose refusal has been watched: **8 of 16.** Each of the other 13 carries a reason, and reasons
decay — "needs a fleet" was true of `rules:coverage` until the eval fixtures turned out to be real
captures already on disk. Re-read them before believing them.
