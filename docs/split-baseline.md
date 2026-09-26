# The split, child 0 (#69): the baseline, taken before anything moves

**What these readings cannot show.** They are a BASELINE, not an attribution, and none of them predicts what the
split will do. The context reading is a per-call count over sessions that also changed their loaded rules,
their model mix and their kind of work during the window (below), so a difference between two windows cannot be
credited to the move; the reading says what a call READ, never why. The selection reading counts test FILES the
`ts` job would run, not seconds, and is a reading of the selector at one commit. The CI reading has two layer-only
pull requests to stand on. **Every figure below is a reading at a moment, taken at the commit and time stated;
re-derive it before quoting it.**

Row #2610, child 0 of #69. The instrument is `scripts/split-baseline.mjs` (`node scripts/split-baseline.mjs
--self-check` runs it over shipped fixtures, no network and no transcripts). It CALLS the selector
(`selectionFor`, `alwaysRunTests`, `narrowByDeclaredScope`, `testFilesToRun`, `packageIndex`, `sourceClosure`,
`discoverTestFiles` from `scripts/select-changed-tests.mjs`), the transcript parser (`claudeTurns` from
`packages/agent-org/src/token-audit.mjs`) and the Region parser (`extractRegionSection` from
`packages/agent-org/src/region-paths.mjs`); it restates none of them.

## The finding, one line each (posted on #69)

- **Guards are the larger half of a `nvda-worker`-only run, and it is not close.** At the median source file, **215
  of the 217 test files** the `ts` job runs are always-run guards (**99%**); for **31 of the 32** `nvda-worker`
  source files the guards are more than half of the run, and the one exception (`isolation-smoke.mjs`, 33%) is
  the file the selector cannot place, so it falls back to four whole packages. The guards are **231 of 730** test
  files in the tree and **182 of the 231 live in `lab`**, which does not move with the layer. (Counts of test
  FILES, not seconds: how the time divides was not measured.)
- **What would have to change for the split to shrink it:** a layer pull request must stop selecting guards that
  live outside the layer, and a copy of them into the layer repository wins nothing. Only 16 of the 231 guards
  declare a `WALK_SCOPE` and so can be narrowed by a diff today (`narrowByDeclaredScope`); **that is inferred, not
  measured:** declaring the scope of the guards a layer diff cannot reach would deliver most of the CI win inside
  the monorepo, and the split's CI claim then rests on what the split adds beyond that.
- **Context per call: the layer group is EMPTY.** In the 14 days ending 2026-09-26, **0 per-row `worker-<n>`
  sessions had a Region wholly under `packages/nvda-worker/` or `packages/nvda-speech/`** (51 had none of it, 4
  had some), so the median for the layer group is not printed: N = 0. The 4 layer-touching sessions (N = 4, all
  cli/auth rows that also edit `nvda-worker`) read a median of **115,982** tokens per call against **109,480**
  for the 51 that touch none of it; the cache read is 114,808 against 107,616, so nearly all of it is cache.
  That is a comparison of 4 sessions with 51 and is not the layer group the row asked for.
- **The `ts` job on layer-only pull requests: there are two.** Of the newest 1,300 merged pull requests, 65
  touch the layer and 2 lie wholly in it (#2198, 169 s; #1210, 149 s). **57 of the 65 carry a `.changeset`**, which
  is why layer-only pull requests are rare here; the ten most recent layer-TOUCHING ones ran a median 319 s.

## Reading 1: selection

Command (repository root, dependencies installed and `npm run build` done):

```
node scripts/split-baseline.mjs selection
```

Taken at commit `469b612eb` (the merge of `origin/main` at `e8306455f` into this row's branch, which adds only
`scripts/split-baseline.mjs`, its test and one line in `docs/commands.md`), 2026-09-26T07:26Z.
38 source file(s) of nvda-worker + nvda-speech (97 tracked non-module file(s) left out).
The source-file set is every tracked non-test `.mjs .cjs .js .mts .cts .ts .py` file under the two packages; the
97 tracked files left out are Markdown, JSON, licences and similar. `nvda-speech` is Python, so no import edge
reaches it and every one of its files is answered by the selector's package fallback: its rows say what that
package actually gets, not an import closure.

For a diff of ONE file, "total" is what `ts` runs: the precisely-selected tests UNIONED with the always-run guards
that survive their declared walk scope, UNIONED with every file a package-fallback glob brings in
(`testFilesToRun`'s own dedup, then the glob expanded over the selector's own test list).

| package | files | column | min | median | max |
|---|---:|---|---:|---:|---:|
| nvda-worker | 32 | selected tests | 0 | 3 | 79 |
| nvda-worker | 32 | always-run guards | 215 | 215 | 215 |
| nvda-worker | 32 | total test files | 215 | 217 | 649 |
| nvda-worker | 32 | of which only via package fallback | 0 | 0 | 434 |
| nvda-worker | 32 | guards as % of run | 33 | 99 | 100 |
| nvda-speech | 6 | selected tests | 0 | 0 | 1 |
| nvda-speech | 6 | always-run guards | 215 | 215 | 215 |
| nvda-speech | 6 | total test files | 215 | 358 | 358 |
| nvda-speech | 6 | of which only via package fallback | 0 | 143 | 143 |
| nvda-speech | 6 | guards as % of run | 60 | 60 | 100 |

guard population: 231 always-run guards of 730 test files; 16 of them declare a walk scope (can be narrowed by a diff); they live in lab 182, worker-fleet 15, control 11, agent-org 9, judge 8, nvda-worker 3, cli 2, scorer 1

**A correction to the row's hand reading.** The row quotes `selected=9 alwaysRun=214` for `server.mjs`. Both are
reproduced (at `c77c1ba0f`), but the run is not 223 files: `server.mjs` also has `fallbackPackages: nvda-worker`,
because no TEST imports it directly, so the `ts` job adds the whole `nvda-worker` suite. Measured total for
`server.mjs`: 298 at `c77c1ba0f` (299 in the table below), of which 76 arrive only through the fallback. `capture.mjs`
(selected 0) is 295 here. The 214 guards and 729 test files in that reading are 215 and 730 here because this row's own
test, `split-baseline.test.ts`, imports a helper that lists tracked files and so is itself an always-run guard: the
instrument is in its own count, and stays in it after the move.

### Per file

| file | selected | always-run | total | added only by fallback | package fallback |
|---|---:|---:|---:|---:|---|
| packages/nvda-speech/nvda_speech/labels.py | 1 | 215 | 215 | 0 | - |
| packages/nvda-speech/nvda_speech/symbols.py | 0 | 215 | 358 | 143 | nvda-speech |
| packages/nvda-speech/scripts/fetch_reference.py | 0 | 215 | 358 | 143 | nvda-speech |
| packages/nvda-speech/scripts/generate_labels.py | 0 | 215 | 358 | 143 | nvda-speech |
| packages/nvda-speech/scripts/measure_announcement_shapes.py | 0 | 215 | 358 | 143 | nvda-speech |
| packages/nvda-speech/scripts/measure_heading_accuracy.py | 0 | 215 | 358 | 143 | nvda-speech |
| packages/nvda-worker/isolation-smoke.mjs | 0 | 215 | 649 | 434 | cli, lab, nvda-worker, worker-fleet |
| packages/nvda-worker/src/auth-flow.mjs | 5 | 215 | 217 | 0 | - |
| packages/nvda-worker/src/browser-profile.mjs | 3 | 215 | 218 | 0 | - |
| packages/nvda-worker/src/browser-session.mjs | 20 | 215 | 231 | 0 | - |
| packages/nvda-worker/src/browsers.mjs | 9 | 215 | 223 | 0 | - |
| packages/nvda-worker/src/capture-auth.mjs | 1 | 215 | 215 | 0 | - |
| packages/nvda-worker/src/capture-core.mjs | 5 | 215 | 299 | 80 | nvda-worker |
| packages/nvda-worker/src/capture-faults.mjs | 79 | 215 | 290 | 0 | - |
| packages/nvda-worker/src/capture-probes.mjs | 17 | 215 | 229 | 0 | - |
| packages/nvda-worker/src/capture-pure.mjs | 55 | 215 | 266 | 0 | - |
| packages/nvda-worker/src/capture-results.mjs | 1 | 215 | 216 | 0 | - |
| packages/nvda-worker/src/capture-setup.mjs | 3 | 215 | 217 | 0 | - |
| packages/nvda-worker/src/capture.mjs | 0 | 215 | 295 | 80 | nvda-worker |
| packages/nvda-worker/src/code-version.mjs | 7 | 215 | 219 | 0 | - |
| packages/nvda-worker/src/desktop-dialogs.mjs | 4 | 215 | 219 | 0 | - |
| packages/nvda-worker/src/desktop-prepare.mjs | 2 | 215 | 217 | 0 | - |
| packages/nvda-worker/src/diagnostics.mjs | 2 | 215 | 217 | 0 | - |
| packages/nvda-worker/src/error-text.mjs | 19 | 215 | 233 | 0 | - |
| packages/nvda-worker/src/field-match.mjs | 2 | 215 | 217 | 0 | - |
| packages/nvda-worker/src/file-version.mjs | 1 | 215 | 216 | 0 | - |
| packages/nvda-worker/src/index.mjs | 2 | 215 | 216 | 0 | - |
| packages/nvda-worker/src/nvda-logging.mjs | 2 | 215 | 217 | 0 | - |
| packages/nvda-worker/src/pointer.mjs | 1 | 215 | 216 | 0 | - |
| packages/nvda-worker/src/powershell.mjs | 7 | 215 | 221 | 0 | - |
| packages/nvda-worker/src/protocol-version.mjs | 2 | 215 | 216 | 0 | - |
| packages/nvda-worker/src/server-log.mjs | 1 | 215 | 216 | 0 | - |
| packages/nvda-worker/src/server.mjs | 10 | 215 | 299 | 76 | nvda-worker |
| packages/nvda-worker/src/speech-channel.mjs | 3 | 215 | 217 | 0 | - |
| packages/nvda-worker/src/window-focus.mjs | 3 | 215 | 217 | 0 | - |
| packages/nvda-worker/src/windows-trim.mjs | 2 | 215 | 217 | 0 | - |
| packages/nvda-worker/src/worker-files.mjs | 9 | 215 | 220 | 0 | - |
| packages/nvda-worker/src/worker-recovery.mjs | 1 | 215 | 216 | 0 | - |

## Reading 2: context per call

Command (the AFTER reading is **the same command over a window of the same length, `--days=14`**, ending on the
day it is taken):

```
node scripts/split-baseline.mjs context --until=2026-09-26 --days=14
```

context reading: window 2026-09-13..2026-09-26 (14 days, UTC), 2061 transcript(s) with a call in it, of 2176 under the harness transcript root, which is the `--claude-root` default. Taken 2026-09-26T07:27Z
at `469b612eb`. **Rerun this, same window length, after the move.**

Per model call, `fresh + cacheRead + cacheWrite` input tokens, from `claudeTurns`, unchanged (it deduplicates on
`message.id`). Window: UTC dates, inclusive; a transcript with no call in it counts in no N. The join is a
transcript's wake-prompt session (`worker-<n>`) AND the directory it sits in (`wt-<n>`), which must agree; `<n>`'s
row body is read with `gh api` and its Region with `extractRegionSection`. **Layer** means every Region path is
under one of the two packages; **mixed** means some are; **rest** none; **noRegion** the row names no path.

| group | sessions | transcripts | calls | median tokens/call | p90 tokens/call | median cache read | median fresh | median cache write | p90 cache read |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| unattributed | 0 | 233 | 12309 | 194466 | 813659 | 191376 | 2 | 1925 | 809241 |
| notPerRow | 23 | 1770 | 72001 | 116813 | 272711 | 115282 | 2 | 1069 | 271417 |
| layer | 0 | 0 | 0 | NO MEDIAN (N = 0) | - | - | - | - | - |
| rest | 51 | 51 | 2500 | 109480 | 194256 | 107616 | 2 | 1217 | 192710 |
| mixed | 4 | 4 | 218 | 115982 | 155730 | 114808 | 2 | 1337 | 155109 |
| noRegion | 3 | 3 | 97 | 81530 | 190987 | 77055 | 2 | 1190 | 189276 |

`unattributed`: the wake prompt names no session (never guessed into a group). `notPerRow`: a named session that
is not a per-row `worker-<n>` in `wt-<n>` (a standing seat, a reviewer, `ceo`, the leads). `sessions` counts
distinct session names; a restarted instance is the same session in a second transcript.

Models (calls): `{"unattributed":{"claude-haiku-4-5-20251001":213,"claude-opus-5":9327,"claude-opus-5-5":2,"claude-sonnet-5":2767},"notPerRow":{"claude-fable-5-1":1563,"claude-opus-5":26547,"claude-sonnet-5":43891},"layer":{},"rest":{"claude-sonnet-5":2500},"mixed":{"claude-sonnet-5":218},"noRegion":{"claude-sonnet-5":97}}`

### Deviations from the row's wording, and why

- **The join is stricter than the row's.** `worker-<n>` alone is ambiguous: the roster has standing seats
  `worker-4` onward, and a seat that claims row #2391 is still `worker-17`, so its `<n>` would join it to row
  #17's Region. Requiring the transcript's `wt-<n>` directory to agree removes that; the price is that a per-row
  instance not run in its own worktree is `notPerRow`.
- **`<synthetic>` messages are dropped.** The harness's own interrupt and error messages carry all-zero usage and
  are not model calls; counted, they pull every median towards 0 (1,686 of 88,414 calls in the first window).
- **This session is in the `rest` group** (row #2610, its calls up to the moment of the run), and the window's last
  day is partial. Each rerun changes the last digits.

### What changed in the window (so the reading is a baseline, not an attribution)

- **The loaded prefix fell by more than half.** `CLAUDE.md` plus `.claude/rules/*.md` was **43,390 B** at
  `bafe4653f` (the last commit before 2026-09-13) and is **19,978 B** at `c77c1ba0f`, measured with `git show`
  and `wc -c`; **50 non-merge commits** touched `.claude/`, `CLAUDE.md` or a nested `CLAUDE.md` in the window
  (`git log origin/main --no-merges --since=2026-09-13 --until=2026-09-27 -- .claude CLAUDE.md
  'packages/*/CLAUDE.md' .github/CLAUDE.md`), among them the 20,000-byte budget (#2217) and the rules split
  (#2092). That alone can move tokens per call by tens of thousands.
- **Per-row engineers exist only in the second half.** The same command over `--until=2026-09-19 --days=7` finds
  **0** per-row sessions; over `--until=2026-09-26 --days=7` it finds 51 (`rest`, median 109,792) and 4
  (`mixed`). The `notPerRow` median fell from 174,930 (7 days ending 09-19) to 108,038 (ending 09-26), while the
  prefix shrank, so the layer/rest comparison is a second-half-only comparison.
- **Model routing added profiles and changed none.** `git diff bafe4653f c77c1ba0f -- packages/agent-org/src/worker-profile.mjs
  packages/agent-org/docs/roles/sessions.json` adds `model:`/`effort:` lines (29 new `model:` lines) and
  changes or removes none; per-cause routing itself dates from 2026-09-17 (`284a81fac`), before the window. The
  per-row sessions all ran `claude-sonnet-5`; `notPerRow` mixes `claude-opus-5`, `claude-sonnet-5` and
  `claude-fable-5-1`. **The harness's effort setting is not in a transcript, so a change in it is not visible here.**
- **Only the transcripts on this host, and only what it still holds.** Transcripts older than 2026-09-13 are gone,
  so the 14-day window is all there is to read; sessions on another host are not in it.

### Per-row sessions in the window (any group membership can be rechecked by hand)

| row | group | calls | Region paths |
|---:|---|---:|---|
| #2075 | rest | 86 | packages/agent-org/src/work-gate.mjs, packages/agent-org/src/worker-profile.mjs, packages/lab/src/packaging/work-gate.test.ts, ... (5) |
| #2256 | rest | 57 | packages/agent-org/src/wake.mjs, packages/lab/src/packaging/wake-limited-session.test.ts |
| #2268 | rest | 59 | packages/cli/src/report.ts, packages/cli/src/action/summary.ts, packages/cli/src/action/summary-report-agreement.test.ts, ... (5) |
| #2275 | rest | 26 | docs/known-gaps.md |
| #2283 | rest | 39 | packages/agent-org/src/work-gate.mjs, packages/agent-org/src/work-gate/pr-orders.mjs, packages/lab/src/packaging/work-gate.test.ts |
| #2400 | rest | 39 | packages/agent-org/src/work-gate.mjs, packages/agent-org/src/wake.mjs, packages/lab/src/packaging/work-gate.test.ts, ... (4) |
| #2443 | rest | 43 | packages/agent-org/src/work-gate.mjs, packages/agent-org/src/fleet-gated-nightly.mjs, packages/lab/src/packaging/work-gate.test.ts, ... (4) |
| #2489 | rest | 35 | packages/lab/src/training/case-matrix.mjs, packages/lab/src/training/case-matrix.test.ts |
| #2492 | rest | 38 | packages/agent-org/src/work-gate.mjs, packages/lab/src/packaging/work-gate.test.ts |
| #2493 | rest | 55 | packages/agent-org/src/row-claim/file-overlap-rule.mjs, packages/lab/src/packaging/row-claim-file-overlap-rule.test.ts, packages/agent-org/src/work-gate.mjs, ... (5) |
| #2494 | noRegion | 52 | none named |
| #2498 | rest | 74 | packages/agent-org/src/wake.mjs, packages/agent-org/src/wake-reviewer-instance.test.ts, packages/agent-org/docs/roles/reviewer.md |
| #2500 | rest | 27 | packages/agent-org/src/prompt-session.mjs, packages/lab/src/packaging/prompt-session-direct-record.test.ts |
| #2505 | rest | 88 | packages/agent-org/docs/roles/sessions.json, packages/agent-org/docs/roles/worker-capture.md, packages/agent-org/docs/roles/worker-judge.md, ... (9) |
| #2506 | rest | 24 | packages/agent-org/src/work-gate.mjs, packages/lab/src/packaging/row-claim-runner-rule.test.ts, packages/lab/src/packaging/work-gate.test.ts |
| #2507 | rest | 57 | packages/guards/src/assert-glob-not-empty.mjs, packages/guards/src/test-memory-cap.mjs, packages/lab/src/packaging/test-memory-cap.test.ts, ... (4) |
| #2508 | rest | 71 | packages/agent-org/src/wake.mjs, packages/agent-org/src/spawn-memory-floor.mjs, packages/agent-org/src/spawn-memory-floor.test.ts |
| #2519 | rest | 83 | scripts/registry-consumer-gate.mjs, packages/lab/src/packaging/registry-consumer-gate.test.ts, .github/workflows/registry-consumer-gate.yml, ... (4) |
| #2520 | rest | 47 | packages/guards/src/mutation-check.mjs, packages/lab/src/packaging/mutation-check.test.ts |
| #2527 | rest | 55 | docs/known-gaps.md, packages/lab/src/packaging/known-gaps-file-facts.test.ts |
| #2528 | rest | 24 | packages/agent-org/src/reviewer/pr-review-verdict.sh, packages/lab/src/packaging/review-attribution.test.ts |
| #2532 | rest | 49 | packages/lab/scripts/evaluate-screenreader-acceptance.py, packages/lab/src/training/accepted-acceptance-cases.json, packages/lab/tests/test_accepted_acceptance_cases.py, ... (4) |
| #2534 | rest | 31 | packages/agent-org/src/wake.mjs, packages/agent-org/src/wake-reviewer-dead.test.ts |
| #2535 | rest | 21 | packages/agent-org/src/worker-profile.mjs, packages/lab/src/packaging/worker-profile.test.ts, packages/agent-org/src/host-units.mjs |
| #2536 | rest | 41 | packages/lab/src/packaging/releasability.mjs, packages/lab/scripts/promote-model.mjs, packages/lab/scripts/scorer-shortcuts.baseline.json |
| #2538 | rest | 65 | packages/agent-org/src/wake.mjs, packages/agent-org/src/work-gate.mjs, packages/agent-org/src/token-audit.mjs, ... (7) |
| #2540 | rest | 28 | packages/agent-org/docs/roles/engineer.md, packages/lab/src/packaging/engineer-brief-context-habits.test.ts |
| #2541 | rest | 62 | scripts/rstest/rstest.config.mjs, scripts/rstest/verdict-reporter.mjs, packages/guards/src/mutation-check.mjs, ... (4) |
| #2542 | rest | 106 | packages/agent-org/src/work-gate.mjs, packages/agent-org/src/work-gate/pr-orders.mjs, packages/lab/src/packaging/work-gate.test.ts, ... (4) |
| #2546 | rest | 157 | packages/agent-org/src/wake.mjs, packages/agent-org/src/prompt-session.mjs, packages/agent-org/src/fleet-gated-nightly.mjs, ... (18) |
| #2547 | noRegion | 29 | none named |
| #2550 | rest | 52 | packages/lab/scripts/audit-focus-log-first-event.mjs, packages/lab/src/training/focus-log-first-event.mjs, packages/lab/src/training/focus-log-first-event.test.ts |
| #2551 | rest | 50 | docs/known-gaps.md |
| #2552 | rest | 37 | packages/agent-org/src/host-units.mjs, packages/lab/src/packaging/host-units.test.ts |
| #2555 | rest | 26 | packages/agent-org/src/work-gate.mjs, packages/agent-org/src/reviewer-auth-detector.test.ts |
| #2556 | rest | 28 | packages/lab/baselines/real-page-findings.json |
| #2557 | rest | 40 | docs/outsider-runs.md, packages/lab/src/packaging/outsider-runs.test.ts, docs/README.md, ... (4) |
| #2560 | rest | 43 | scripts/auth-artifact-scan.mjs, packages/cli/src/auth/artifact-scan.ts, packages/cli/src/auth/artifact-scan.test.ts, ... (4) |
| #2561 | rest | 62 | docs/known-gaps.md, docs/github-action.md, docs/lane-ownership.json |
| #2562 | rest | 53 | packages/cli/src/cli.ts, packages/cli/src/multi-page.ts, packages/cli/src/multi-page.test.ts, ... (8) |
| #2563 | mixed | 50 | packages/cli/src/auth/interpreter.ts, packages/cli/src/auth/interpreter.test.ts, packages/cli/src/auth/auth-faults.ts, ... (10) |
| #2564 | mixed | 58 | packages/cli/src/auth/interpreter.ts, packages/cli/src/auth/interpreter.test.ts, packages/cli/src/auth/playwright-driver.ts, ... (13) |
| #2565 | mixed | 57 | packages/cli/src/auth/interpreter.test.ts, packages/nvda-worker/src/auth-flow.test.ts, docs/known-gaps.md |
| #2569 | noRegion | 16 | none named |
| #2573 | rest | 41 | docs/known-gaps.md, packages/lab/src/packaging/known-gaps-file-facts.test.ts |
| #2576 | rest | 32 | .github/workflows/nightly.yml, packages/lab/src/packaging/nightly-only-path.test.ts |
| #2580 | rest | 34 | packages/control/ansible/lab-job.yml, packages/control/src/lab-job.test.ts |
| #2583 | rest | 39 | packages/agent-org/src/work-gate.mjs, packages/lab/src/packaging/work-gate.test.ts |
| #2587 | mixed | 53 | packages/nvda-worker/src/browser-session.mjs, packages/nvda-worker/src/protocol-version.mjs, packages/nvda-worker/src/focus-event-log-initial-focus.test.ts, ... (6) |
| #2590 | rest | 34 | packages/agent-org/src/wake.mjs |
| #2593 | rest | 28 | packages/lab/src/training/signal-predicates.mjs, packages/lab/src/training/focus-removed-initial-focus.test.ts |
| #2594 | rest | 26 | packages/lab/src/training/focus-log-first-event.mjs, packages/lab/src/training/focus-log-first-event.test.ts, packages/lab/scripts/audit-focus-log-first-event.mjs |
| #2598 | rest | 40 | packages/worker-fleet/src/lab-job-lock-two-rows.test.ts |
| #2602 | rest | 36 | packages/judge/src/rules.ts, packages/judge/src/rules.test.ts, .changeset/judge-index-0-exception-2602.md, ... (5) |
| #2604 | rest | 35 | packages/agent-org/src/work-gate.mjs, packages/lab/src/packaging/work-gate.test.ts, .changeset/promotable-skips-needs-chairman.md |
| #2606 | rest | 37 | packages/lab/src/packaging/row-claim-one-row.test.ts, packages/lab/src/packaging/wake-drain.test.ts |
| #2610 | rest | 80 | scripts/split-baseline.mjs, packages/lab/src/packaging/split-baseline.test.ts, docs/split-baseline.md, ... (4) |
| #2614 | rest | 60 | docs/adr/0039-the-split-is-mostly-org-machinery.md, docs/adr/README.md, packages/lab/src/packaging/split-machinery-adr.test.ts |

## Reading 3: the `ts` job on merged layer-only pull requests

Command:

```
node scripts/split-baseline.mjs ci-jobs --scan=1500
node scripts/split-baseline.mjs ci-jobs --scan=1500 --population=touching
```

Taken 2026-09-26T07:28Z. Each pull request's own `pull_request` `ci` run at its head commit, the job GitHub names
`ts / run` (the reusable-workflow name; matching `ts` alone finds no job), green runs only: a cancelled or failed
job stops early and its 0 s or 3 s is how long it lived. "Test step" is the `Unit tests of the changed test
files` step; the rest of the job is build, lint and typecheck, which a split also moves.

**Layer-only (the row's population), n = 2 of the 10 asked for**, fewer than ten because there are only two:

| PR | head | ts job seconds | of which test step |
|---:|---|---:|---:|
| #2198 | 22f81d011 | 169 | 125 |
| #1210 | 026e29fb8 | 149 | 102 |

median 149 s, min 149 s, max 169 s (n = 2)

what else the 65 layer-touching PRs changed (PRs per location): .changeset 57, packages/lab 24, packages/evidence 20, docs 19, packages/cli 13, packages/worker-fleet 12, packages/judge 9, packages/control 8, scripts 4, .github 3, packages/scorer 3, CLAUDE.md 2

**Layer-TOUCHING, the last ten**, added because the strict population is two; it is not what the row asked for and
is not a layer-only baseline (these diffs also change `.changeset`, `lab`, `evidence`, `cli`...):

| PR | head | ts job seconds | of which test step |
|---:|---|---:|---:|
| #2589 | 40aec86f8 | 319 | 264 |
| #2588 | 42ea26cc6 | 402 | 332 |
| #2586 | eccf30c05 | 240 | 191 |
| #2574 | 4dd7dccb6 | 360 | 315 |
| #2479 | 9593810cc | 344 | 297 |
| #2437 | ecc7b600a | 419 | 362 |
| #2408 | 16f21156c | 298 | 251 |
| #2372 | 84b8ef949 | 325 | 277 |
| #2368 | 011da0838 | 302 | 255 |
| #2366 | 02954c583 | 289 | 241 |

median 319 s, min 240 s, max 419 s (n = 10)

what else the 65 layer-touching PRs changed (PRs per location): .changeset 57, packages/lab 24, packages/evidence 20, docs 19, packages/cli 13, packages/worker-fleet 12, packages/judge 9, packages/control 8, scripts 4, .github 3, packages/scorer 3, CLAUDE.md 2

## What is NOT measured

- **Seconds spent in guards** against seconds spent in selected tests: the selection reading counts files.
- **The `python` job**, which runs `nvda-speech`'s own pytest suite; only the `ts` selection is read here.
- **A layer-only baseline in time**, with n = 2; and **any promise of a number after the move**, which this row does
  not make (the row's own "Not in this row").
- **The layer group's tokens per call**, because the window holds no such session (N = 0). It becomes readable when
  a row wholly inside the layer is worked; the same command reads it.
