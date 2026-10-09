# Outcome 10: what a Linux runner can do for a11ign

Row #4534, for #4084 outcome 10. The evaluator's suggestion is the deterministic layer and the accessibility-tree
evidence on Linux Chromium, with the screen-reader capture as an opt-in remote or nightly stage.

**Decision: build the rule-layer-only path on Linux (two pull requests), do not build a Linux accessibility-tree
census, and keep every screen-reader reading on Windows.** The reasons are below; the row to file is under
`## First row`.

**Taken at** `origin/main` `791552a77` (2026-10-09), and, for the one layer that lives in another repository,
`a11ign/screenreader-worker` `c3b77925d`. Every figure is marked MEASURED (a command printed it, named beside it),
READ (copied from a document that names its own runs) or INFERRED (arithmetic or a choice, with its basis). Nothing
here was run on a GitHub runner, because no Linux job of this Action exists yet to run.

## What it covers

One line first, because it decides the rest: **on Linux today a11ign can scan a page with axe-core and read a PDF's
tag tree, and it cannot report either of them for a web page, because the CLI refuses to produce a report without a
screen-reader worker.** The layers, in the order the evaluator named them:

| layer | runs on Linux Chromium today? | what decides it |
|---|---|---|
| **rules / axe-core** (the scan) | **Yes, as a scan.** Playwright's bundled Chromium is tried first, the `msedge` channel second | `packages/cli/src/scan/axe.ts:247` (`launchBrowser`), `:28` (`WCAG_AA_TAGS`), `:312` (`scanWithAxe`); `pnpm run scan <url>` (`packages/cli/src/scan/run-axe.ts`) prints it |
| **rules / axe-core** (a report) | **No.** `main` leases a worker and runs the scan beside the capture; a capture that fails throws and the axe result is discarded | `packages/cli/src/cli.ts:803` (`Promise.allSettled` of both), `:839` (`orderTheLayers` rethrows the capture's error), `:1507` ("The page was not examined"), and for a user who configured no worker `packages/cli/src/worker-probe.ts:26` ("A screen reader is a Windows application, so nothing runs here without one"). The Action refuses before anything runs: `action.yml:261-266` |
| **rules / the judge's deterministic rules** (`rules-owned`) | **The code runs; it has nothing to read.** All four asserting subtypes read what NVDA said | `packages/judge/src/rules.ts:1787` (`addImageAlternatives(transcript)`: `1.1.1:missing-alt`, `1.1.1:filename-alt`), `:962` (`addUnnamedControls(entries)`: `4.1.2:unnamed-control`), `:556` (`addSilentStateChanges`: `4.1.2:state-change-silent`, the before and after announcements of an activation) |
| **accessibility-tree evidence** (the census) | **No.** The call is portable; the code that makes it is not in reach | `Accessibility.getFullAXTree` is sent by `structuralCensus` in `screenreader-worker` `src/browser-session.ts:1011`, over the DevTools socket of a browser the worker launched. That launch is Edge on Windows: `src/browsers.ts:234` (`image: "msedge.exe"`), `:118` (profile under `LOCALAPPDATA`). This repository calls the same CDP method only to bind login controls (`packages/cli/src/auth/playwright-driver.ts:79`), never to feed a report |
| **the trained scorer** | **The Python runs on Linux (CI does); it has nothing to score.** Its input is `modelInput()`, built from a capture's evidence, and this path has no capture | `.github/workflows/ci.yml:294` (`setup-python` on `ubuntu-latest`); `packages/scorer/src/evidence-units.ts:197` (`modelInput`'s output shape) |
| **the NVDA capture** | **No.** guidepup throws `No available supported screen readers` at import | `docs/known-gaps.md:790`; `action.yml:3-4`, the reason the Action is composite and Windows-only |
| **the PDF layer** (not on the evaluator's list) | **Yes, today, for a PDF target only.** No worker, no browser, no NVDA | `packages/cli/src/cli.ts:407-420` (`runPdfLayer`), `:553` and `:576` (the lease is skipped for a PDF) |

Two readings follow from the table, and the second is the one the outcome turns on.

1. **The precedent exists.** `runPdfLayer` already prints a report whose `screenReader` is the sentence
   `not applicable — a PDF has no live page to navigate`, with `announcements: 0` and no verdict
   (`cli.ts:425-430`). A page run that skips the worker is the same shape with a different reason.
2. **Moving to Linux changes what a report can assert, not just where it runs.** The only layer that may assert on a
   web page without a screen reader is axe-core, and ADR 0021 already says its `violated` is "asserted BY axe-core
   and attributed to it". The four rules-owned asserting subtypes (`CLAUDE.md`) all read the transcript, so a
   Linux-only run asserts none of them. And `1.1.1:missing-alt`'s tree-based sibling, `addUnnamedGraphics`
   (`rules.ts:1749`), reads the census, which Linux does not produce. A Linux census would add that one oracle and
   no assertion of its own: the function's comment says "the tree is the oracle and never the evidence".

**What a Linux-only report would claim, and what it must refuse.**

| it would claim | it must refuse |
|---|---|
| axe-core violations, each named as axe-core's, on the WCAG tags in `WCAG_AA_TAGS` (`axe.ts:28`) | any announcement, transcript line or "what a screen-reader user hears" |
| the axe version and the browser channel that ran (`axe.ts:127` carries it) | a verdict, an outcome count or an `asserted` / `referred` split: those are the judge's, and the judge has no capture |
| that the rule layer ran, or did not (`RuleLayerCoverage`, imported at `axe.ts:34`) | "clean" or "0 violations" for anything axe did not examine; `null` stays `null`, as `cli.ts:811-815` already insists |
| which criteria it did not examine, by the same `criterion-coverage.ts` table | any statement about the criteria that only a screen reader reads: 7 single-line `needs: ["screen-reader"]` entries, 10 that name it at all (of 49 single-line `needs:` entries) |

The refusal is one sentence in the report and in the JSON (`screenReader: null`, never an empty string or `0`), so a
consumer cannot render "no screen reader ran" as "the screen reader found nothing". This is the rule `CLAUDE.md`
states as "a finding is either ASSERTED or REFERRED", applied to a layer that is absent.

**Commands behind the figures in this section** (all at `791552a77`, from the repository root):

```
grep -o 'needs: \[[^]]*\]' packages/judge/src/criterion-coverage.ts | wc -l                       # 49
grep -o 'needs: \[[^]]*\]' packages/judge/src/criterion-coverage.ts | grep -c 'screen-reader'     # 10
grep -c 'needs: \["screen-reader"\]' packages/judge/src/criterion-coverage.ts                     # 7
```

The 49 counts only `needs:` written on one line; an entry that wraps is not in it, so read the 7 and 10 as lower
bounds. File and line citations were read at the two commits above and move when the files do.

## What it would cost

**Per run, in runner minutes (the evaluator's concern).** The Windows figures are READ from
`docs/capture-cost.md` (its `## Action` and `## What a cap costs` tables, runs and heads named there, taken on
`windows-2022`). The Linux figures are INFERRED, because no Linux job of this Action has ever run.

| 5 pages | billed minutes | price at the 2-core rate | basis |
|---|---|---|---|
| Windows, capture + axe + judge | **33** typical, **43** worst page | **$0.33 / $0.43** at $0.010 | READ: `capture-cost.md` table row "5": 340 s and 460 s per page, `1.5 + N x (capture + 35 s) / 60` |
| Linux, rule layer only | **about 5** | **about $0.03** at $0.006 | INFERRED: 2 min fixed (checkout 6.9-9.8 s is READ from the same file's decomposition; `pnpm install` and a Chromium download are NOT measured, so the 2 is a ceiling I chose) plus 0.5 min a page (CHOSEN; the per-page axe time has never been measured on a runner: `capture-cost.md` says only that axe and judging are "small against the capture") |

So the difference is **about 6.6 to 8.6 times fewer billed minutes** (33/5 and 43/5) and, at the two published
prices, **about 11 to 14 times less money** ($0.33/$0.03 and $0.43/$0.03). The prices are READ from GitHub's pricing
page as `capture-cost.md` quotes it ($0.010 Windows, $0.006 Linux); that page states no minute multiplier and neither
does this document. **Treat the Linux row as a bound to be replaced by a measurement, not as a finding:** the
second pull request below produces the measured number.

**To build, in pull requests and Windows minutes.** All INFERRED from the shape of the code read above.

| step | pull requests | fleet worker-minutes | Windows runner minutes |
|---|---|---|---|
| the CLI skips the worker and reports the rule layer alone (`## First row`) | 1 | **0** (it needs no capture; its test imports a saved axe result, `--axe-results`, so it needs no browser either) | 0 |
| the Action accepts `ubuntu-latest` when told the screen reader is off, with a measured Linux job in `action-smoke.yml` | 1 | 0 | **11 to 12** for one dispatch to prove the Windows path did not move (READ: runs `35975577476`, `35975580437`, `35976874484`, `35976877072` billed 11 to 12 minutes; the workflow is release-time and dispatch only, so this is spent once, on purpose) |
| a Linux accessibility-tree census (the evaluator's second layer) | **not recommended**, see below | | |
| the opt-in screen-reader stage | **0 new**: `examples/nightly-workflow.yml:44` already runs the Windows capture on a schedule | | |

**Why the census is not on the list.** It would be roughly two pull requests in `screenreader-worker` (port the
launch off `msedge.exe` and `LOCALAPPDATA`, then feed `censusFromAXTree`'s output through the CLI into the judge),
plus one here, and an `orchestrator` row for the protocol version it would touch. In exchange a Linux report would
gain one oracle (`graphicUnnamed`, `rules.ts:1749`) that **asserts nothing without the transcript beside it**, and a
second place where "the tree says X" and "NVDA said Y" can drift. That is a high price for an input no rules-owned
subtype can use alone. **What would change this:** a rule that asserts from the tree alone (the PDF layer's
Figure-without-alt check is the existing example of a tree-only assertion), or the evaluator naming a Linux user who
needs the unnamed-graphic count and not the reading.

**Is it worth doing at all?** Yes, narrowly, and for a reason that is not the cost: today a Linux user gets an error
whose first sentence is "No capture worker answered" (`worker-probe.ts:26`) and no axe result, while the scan that
would have answered them runs on their machine. The saving is a bonus; the refusal to say anything is the defect.
**What it does not do:** it does not make a11ign a screen-reader tool on Linux, and it must not be sold as one. Its
whole claim is axe-core's, with a11ign's coverage statement and precedence rules around it, which is a smaller
product than the one the Action advertises (`action.yml:9`). If the chairman does not want that smaller product
shipped under this name, the first row below is still the right size to find out, because it is one pull request and
removable.

## First row

One row, small enough for one pull request. `product-manager` files it from this section.

**Title:** `a11ign --no-screen-reader reports the rule layer alone, leases no worker, and says in the report that no screen reader ran (#4084 outcome 10)`

**Region**

```
packages/cli/src/rule-layer-only.ts
packages/cli/src/rule-layer-only.test.ts
packages/cli/src/cli.ts
```

**Change.** Add the flag `--no-screen-reader` to the CLI. When set, `main` runs `runRuleLayerOnly(args)` BEFORE
`leaseWorker`, on the same footing as the PDF route at `cli.ts:624`, and for each URL (the list path at `cli.ts:553`
also skips the lease) it does exactly this:

1. runs `pageContext(url, ruleLayer, axeResults)` (`cli.ts:1301`), so `--axe-results <file>` imports a saved result
   and the scan otherwise runs on the bundled Chromium; no worker, no judge, no scorer, no Python;
2. prints the existing report with `screenReader: "not run: --no-screen-reader. This report is axe-core's alone and
   says nothing about what a screen reader announces"`, `announcements: 0`, `verdict: undefined`;
3. under `--json`, emits `{ url, task, screenReader: null, ruleBased: <findings or null> }`, `ruleBased` being `null`
   when the rule layer did not run, never `[]` (the `cli.ts:811-815` rule);
4. exits `2` with one stderr line when combined with a flag that needs a screen reader (`--worker`, `--probe-forms`,
   `--probe-focus`, `--probe-navigation`, `--forms`, `--login-flow`, `--auth-state`) or with `--no-axe` (nothing would
   run). A refused combination leaves no half-run.

It does not touch `action.yml`, the worker, the judge or the evidence types. The Action half is the second row,
filed after this merges and its measurement exists (`## What it would cost`).

**Acceptance**

```bash
bash -c 'pnpm exec tsx --test packages/cli/src/rule-layer-only.test.ts'
```

The test must show, each against a real invocation of the CLI with `A11Y_WORKER` pointing at a closed port and
`--axe-results` naming a fixture, so no browser and no worker is needed:

- exit `0`, the report contains the sentence above, and the output contains no word of a transcript;
- `--json` carries `screenReader: null` and a `ruleBased` array equal to the fixture's findings;
- a closed-port worker is never connected to (a listener on the port records zero connections);
- `--no-screen-reader --worker http://x:1` and `--no-screen-reader --no-axe` each exit `2`;
- mutation, both directions: delete the early return so the lease happens and the zero-connections assertion fails;
  make the refusal fire always and the exit-`0` case fails, and no other test breaks.

**Done-when.** The pull request merges; `pnpm run verify` is green at its head; and the second row (the Action
accepting `ubuntu-latest` with `screen-reader: false`, plus one measured Linux job in `action-smoke.yml`) is filed
by `product-manager` on this row's merge, carrying the measured minutes in place of the INFERRED 5 above.

**Tier:** Sonnet. **Fleet:** No.
