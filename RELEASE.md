# Release status

What is verified, what is not, and what is deliberately deferred. Written to be read before shipping and
believed afterwards — every line is a measurement, not an intention.

## Verified at this commit

Run on a **clean checkout of `HEAD`**, which is what CI and a consumer see:

| check | result |
|---|---|
| unit tests | **462 pass, 0 fail, 2 honest skips** (the two git-dependent tests, in a tree with no `.git`) |
| typecheck | clean — and now actually covering the package tests: `tsc --listFiles` showed **0** of them in the program before M5, 24 after |
| lint | 0 errors (337 warnings, all `no-magic-numbers`, non-blocking by design) |
| `gate:isolation` | **6/6 packages usable when installed**, 1 private package skipped and announced |
| `rules:gate` | **PASS** — every rule-owned subtype exact on real captured evidence, **0 false positives across 1,183 conformant records**. This claim is about the RULE layer only, and it is a measurement: the rules are deterministic and carry no threshold, so nothing was tuned to make the number come out. See the row below for why the same words would be empty about the scorer. |
| `rules:coverage` | The other half of that claim, and it was missing until 2026-08-24: a rule that has never FIRED produces 0 false positives too. Five of eleven had never fired on a real page and two had never fired at all, while `criterion-coverage.ts` listed them as assessed. Exactness on evidence a rule never reached is not a result. |
| scorer false-positive bound | **Population rate ≤ 0.5% at 95% confidence, distribution-free** (ADR 0022), recorded as approximate — out-of-fold scores come from K fold models where the proposition assumes one. This REPLACES "0 false positives on the development set" as the scorer's claim. That number was never a measurement: the threshold was chosen to make it true, so every head reported precision 1.000 by construction and a figure that cannot be wrong cannot be informative. |
| held-out acceptance | **PASS** — `"passed": true`, no failure reasons |
| `npm run eval:gate` (judge quality) | **PASS — recall 78%, 0 false positives on conformant pages**, abstained on 5 of 16 failure cases, 48 failure-case runs (16 cases x 3). Recall was 59% before the realism tier, and 90% before abstention existed, when it carried 3 false positives, 2 of them accusing conformant W3C pages. It failed at one false positive until 2026-08-21; the cause was a mis-authored fixture, not the scorer. See below. |
| `verify.corpus.test.ts` | 6/6 |
| CI (`lint` + `capture-regression`) | **both green** — first time since 1 August; the fix was `capture-pure.mjs` |
| shipped model | `calibrationClean: true`, `generalisationVerified: true` (held-out, 0 errors), `releaseBlockedBy: []` |
| `npm run scorer:shortcuts` | **Read 2026-10-06 on the lab** (`orchestrator`, [#3130](https://github.com/a11ign/a11ign/issues/3130#issuecomment-6014497720), lab job at `8940cc2b6`, exit 0): **74 unclosable and 28 closable veto pairs, 1 constant feature (`transcript_present`), over 3,131 records.** It reports and does not pass or fail; nobody has said those counts are acceptable, and whether any of the 28 closable pairs sits on a head the scorer decides alone was not read. The figure this row carried before — **225 free vetoes across 13 heads, measured 2026-08-22** — is superseded and is not comparable with this one (16 heads now, a different corpus; `PLAN.md` B8 records 225 → a residual two that can reach a report at protocol 17, 2026-09-05). Still the one row in this table that is not a pass; not re-read since 2026-10-06, and not by this edit, because a gate reading `runs/` is the lab agent's to report. Re-read is [#4552](https://github.com/a11ign/a11ign/issues/4552). See the 4.1.2 operating limitation below; every other check here is blind to it by construction |

> **Read this before the table above reassures you.** Every gate in it evaluates on data that shares the
> corpus's structure, so none of them can see a head penalising a feature that is 0 on all of its training
> positives. Measured 2026-08-22: **225 such free penalties across 13 heads** (since re-read: the row above gives the 2026-10-06 reading). A green row is evidence about
> the thing it measures, not a general assurance — see *OPERATING LIMITATION* below and
> [ADR 0015](./docs/adr/0015-one-defect-per-page-taught-the-scorer-to-veto.md).
>
> **The layer split contains it, and that is measured rather than assumed.** Where a deterministic rule owns
> a subtype the scorer is suppressed for it, so `4.1.2:unnamed-control`, `1.1.1:missing-alt`,
> `1.1.1:filename-alt` and every keyboard/navigation criterion are unaffected. The nine subtypes the model
> decides alone are where a veto reaches a report.

Measured on a tree containing only committed content, which is what CI and a consumer see. When this table was written (2026-08)
`release:gate` stopped at `check-signals` for 418 stale captures; that is closed (*Closed since*, below), and `check-signals` last read
**0 stale on 2026-09-24**. The lab's last run of the whole chain that I found (2026-10-06, #3130) stopped earlier, at stage 5
`gate:isolation` (cause #3830, closed the same day), so stages 6 to 14 — `training:check-signals:complete` among them — were *unread*, not passed.

The judge runs on **our own trained scorer** (`judge-backend: local`) — 27 KB of heads over an 87 MB
encoder. No LLM, no API key, nothing leaves the runner.

> **Corrected 5 Aug.** The figures above were first recorded while `packages/scorer/python/score.py`
> — the program that *is* this backend — had never been committed. It existed only in one working tree,
> so a fresh clone could not run its own default judge, and the numbers were produced by a file no
> consumer received. `npm pack` includes untracked files, which is why installing it appeared to work.
> The program is now tracked, resolves from `import.meta.url` rather than the process cwd, and
> `npm run eval:gate` runs from the committed tree. A test now asserts that
> every `scripts/…` program referenced by `package.json` or `action.yml` is tracked in git.
>
> **The figures this table quotes were wrong until 2026-08-21, and the sentence above used to claim this
> gate reproduced them.** It said "recall 59%, 0 false positives" while the gate actually reported 78% and
> **one** false positive — the number this project most needs to be true was the one that had stopped being
> checked, which is the same shape as the acceptance gate that sat failing while three others were green.

### The one false positive, and why it was the fixture rather than the scorer

`tut-menus-good` was reported as 4.1.2 at **0.9873** on `4.1.2:state-change-silent`, against a 0.9
threshold, while `unnamed-control` sat at 0.0003. For an accessibility tool a false positive is an
accusation, so a gate limit of 0 is right and this was a real block.

The obvious suspects were both recent changes of ours, so both were eliminated by measurement rather than
argument:

- **Not the abstention floor.** Novelty cosine 0.8131, far inside support, and it reproduced with the floor
  set back to its previous 0.7192.
- **Not the new weights.** The previously shipped model from `fb49862` reproduced it exactly, so the realism
  tier, the publisher mask and the threshold move from 0.05 to 0.9 were all innocent.
- **Not the deterministic rules.** `rules.ts` produces no findings at all on that page.

The page was wrong. It carried `<button aria-expanded="false">Support</button>` with **no script** and a
submenu that was never hidden, so "collapsed" was never true, activating the button changed nothing, and the
recorded evidence was structurally identical to a genuine state-change failure. The scorer was reporting a
real defect — just not the one the fixture was written to test, since that pair tests NAMING and the bad
variant is an unnamed icon button with no state changes at all.

`rules.ts` had already diagnosed this exact page and declined to build a rule for it, concluding that "the
evidence does not contain the fact the rule needs". That was the right call about a rule, and it is why the
fixture stood: the rule layer abstained, and the model has no such restraint.

Fixing it needed the page to toggle `aria-expanded` and the panel's `hidden` — the way `disclosure-good.html`
and the generated corpus both express a conformant disclosure — and then a recapture, because a fixture IS a
recorded capture. A second defect surfaced in that recapture: the panel was still being read out, because the
page's own `nav ul{display:flex}` outranks the `hidden` attribute. Both fixed; `tut-menus-good` now reports
nothing and `tut-menus-bad` is still caught at 100% recall.

**Recapturing it was not previously possible.** `capture-books.mjs` wrote to
`resolve(process.cwd(), "src/eval/fixtures/books")`, a path the `packages/` restructure moved, so it would
have created that directory wherever you stood and written fixtures nothing reads — while reporting success.
`capture-fixtures.mjs` replaces it, resolves from `import.meta.url`, and captures over a live worker instead
of only in-process on the guest.

`releaseEligible: true` in `training-report.json` still means calibration and held-out acceptance, and has
never meant `eval:gate`. Both are stated here rather than one implying the other.

### The claim this project exists to make, demonstrated

Against the University of Washington "Accessible University" demo — a third-party, expert-built
inaccessible page and its accessible twin:

| | before (inaccessible) | after (accessible) |
|---|---|---|
| screen-reader layer | 1.1.1, 1.1.1, 4.1.2, **2.4.4**, **1.3.1** | **none** |
| axe | 1.4.3, 3.1.1, 1.1.1, 4.1.2, 1.4.1, 2.5.8 | **none** |

Two findings only the screen-reader layer produced, quoting what a user hears:

```
2.4.4 Link Purpose          heard: "click here, link"
1.3.1 Info & Relationships  heard: "102 announcements, no heading among them"
```

axe reports neither, and not by oversight: its `link-name` rule asks whether a link *has* an accessible
name, and "click here" has one. Meanwhile axe found four things a screen reader cannot perceive at all.
Neither layer subsumes the other — and the accessible twin is clean on both, which matters more than the
findings.

### The V1 rehearsal — an outsider job on every release and a weekly review, never a gate before a publish (#813, #3184)

**What a stranger's run protects, and how it is delivered now (ADR 0042).** The rehearsal protects two different things, and only
one of them is a command. *Does the documented path RUN from a fresh start?* (the 2026-08-05 class: an untracked scorer no fresh clone
could run; #494's three publish-blockers) is **automated and runs on every release**. *Is the report worth a stranger's minutes?* is a
judgement only somebody who did not build it can make, and it is a **review on a weekly rhythm**. Releases keep flowing between
reviews; **nothing waits on either, and nothing is typed.** What is retired is the rehearsal's being a manual gate on each release
(ADR 0042 decision 1, [the ADR](docs/adr/0042-the-v1-rehearsal-splits-into-an-automated-outsider-job-and-a-weekly-review.md)).

**What confirms a release now (#3717, ADR 0041; it was a version pull request, #3131).** A merge to `main` that carries a
changeset makes `.github/workflows/release.yml` run its `guards` job (every check on WHAT is published, below) and then call
`a11ign/toolchain`'s reusable `release-per-merge.yml`, **pinned by full sha**: it versions on a detached release commit,
publishes by OIDC with provenance from the `npm-publish` environment, and tags the merge. **No version pull request exists,
no branch is pushed, and `release.yml` holds no `A11IGN_BOT_TOKEN`:** the merge of the change that carries the changeset IS
the release, and the review and the queue that merge already passed are the confirmation. The reusable workflow subtracts
what release tags already consumed, so a merge that carries no unreleased changeset publishes nothing. **The `guards` job
runs on the merged tree, not on the release commit,** because a guard cannot be a step inside a called workflow; the call
`needs` it, so a guard that goes red stops the publish before the call starts. The packages that moved out of this
repository are kept out of the publish by the #3126 hold, a `guards` step on a push; **`changeset publish` publishes every
non-private package whose version the registry lacks, so a package still in the workspace and not named in the hold is
published**. A `workflow_dispatch` of `release.yml` runs the guards and the provenance rehearsal and stops: it does not call
the reusable workflow and never publishes. There is no token-reach probe any more (#4200): the arming and tag-move tokens are minted per job, so a mint that
cannot reach is a red step at the point of use.

**What nobody reads on a publish: the fleet part of the gate.** The runner proves 5 of `release:gate`'s 13
stages (`release:gate:ci`); the other eight need the Python venv or the corpus. **No person asserts them now, and no
machine does yet**: `scripts/release-gate-scope.ts` says so in the publishing run's log, every time, and
the row that reads the fleet part's verdict by commit sha is #3136. Until it lands, "the release published"
does not imply "the lab's stages passed"; run `pnpm run lab:job -e job=release-gate` and read it if you need
that claim.

**The release check is the outsider job's verdict, read AFTER the publish (#3184).** A job in a repository outside the organisation
installs the just-published package and the Action exactly as `README.md` says, from an empty workspace, against a site we do not
own (#3181, #3182). `registry-consumer-gate.yml`'s `outsider` job reads its public run list with `pnpm run outsider:verdict` on a
schedule, after a release and on dispatch. **`green` passes; `pending` inside nine hours passes with a notice naming the version and
its age; `red`, and no run at all past nine hours, FAIL that job and file ONE `regression` row for the version.** It does not refuse
the next publish: a fix is itself a release, and a refusal would deadlock it behind its own defect (ADR 0041 decision 3). **It
cannot prevent the publish it reads**, because the version is already on the registry when it learns of it.

**What the outsider job covers, and does not.** It covers the first class: the documented path completes and the result has the
documented shape. It does NOT read what the report SAYS: of the first rehearsal's five defects (table below) it would have caught
one, and the other four were judgements about the report's content, which is what the weekly review is for. The runner-provable
gates (`gate:isolation`, the consumer gate, the registry gate) are untouched and still precede a publish.

**The weekly review is a row, filed by a schedule, never a gate** ([`docs/weekly-review.md`](docs/weekly-review.md);
[`scripts/weekly-review.ts`](scripts/weekly-review.ts) builds the row, and reads the requirements below out of this file, so a
rewording here is a rewording there). A session that built none of the recent work takes it; the row's `Ineligible:` line names
the sessions that built the window's work. Its findings arrive up to seven days after a release, which is the price of not
blocking one (ADR 0042, "THE COST").

**Five requirements, and all five must hold or the run is not the review:**

1. **A session that built none of the window's work runs it.** Somebody who wrote the code cannot read its
   output as a stranger; they supply the missing context without noticing. **This is why a session that
   built the work cannot satisfy this review itself, however carefully it tries** — the thing being
   tested is precisely the knowledge a builder cannot un-know.
2. **A fresh clone and only the public documentation** — `README.md`, `docs/try-it.md`,
   `docs/github-action.md`. Reaching for internal knowledge is the failure being tested for, not a
   shortcut past it.
3. **A site we do not own**, with a real task. A page we built cannot falsify our assumptions about pages
   we did not.
4. **The reading is the deliverable, not the run.** The four questions `docs/try-it.md` already asks —
   did it see the real page, did I believe the findings, were the referrals worth reading, was it worth
   the minutes — answered in writing, with every finding the rule demands it for (`rules.ts:699`, 2.4.7)
   read individually against its stored log.
5. **Everything the reading surfaces is filed, not fixed in place.** Fixing as you go destroys the record
   of what a first reader actually met, which is the one thing no internal test can produce a second time.

**Most recent HAND rehearsal (the last one; the weekly review's rows are the reviews since):** 2026-09-20, run [35542705465](https://github.com/DanBeckDev/a11ign-v1-rehearsal/actions/runs/35542705465), against `633c908fe` — main, two days of ordinary merges past rehearsal 6's candidate, 54 paths touched across all five published packages. One completed run on the documents' recommended page and task, job ~6 m; 141 announcements, `jq -c .transcript a11ign-result.json | sha256sum` = `6c040860…`, matching rehearsal-4/5/6's own recorded hash, so the release candidate behaves as the rehearsed one did; 0 lived-experience findings, 3 axe violations inside the YouTube embed (identical set to rehearsal 6's reading: `aria-allowed-attr`/critical, `aria-prohibited-attr`/serious, `button-name`/critical, all inside the embedded YouTube iframe). Reading: ceo, #72.
<!-- REHEARSAL:COMMIT 633c908fed2ec6ab3f556dfc7e1dbbe59d6b7acf -->
<!-- The marker above is what `npm run release:rehearsal-check` READS -- a reading since #3184, never a gate: it prints the
     commit, its age in days and how many exercised paths changed since, and exits 0 however stale it is. It STAYS as the record
     of the last hand rehearsal (the weekly review's deliverable is a closed row, not a commit, so there is no sha for a command
     to read) and is allowed to go stale. `rehearsal-currency-gate.test.ts` checks it against `check-rehearsal-currency.mjs`'s own
     regex, so a rewording of the prose above can never silently stop the reading from finding the commit it names. Update BOTH
     the prose and the marker together if a hand rehearsal is ever run again. NOTHING checks that the two agree. -->
The first rehearsal (2026-09-09, run
[34364673899](https://github.com/DanBeckDev/a11ign-v1-rehearsal/actions/runs/34364673899), against
`a11y-witness@8849f92d`; full reading [#324](https://github.com/DanBeckDev/a11y-witness/issues/324)) produced **five** filed
defects, every one surviving a fully green internal suite — the argument for why this gate exists rather
than a good idea:

| | |
|---|---|
| #796 | broken links, missing `permissions:` in every quickstart snippet, a public-claim guard too narrow to see the one file readers are told to copy (merged) |
| #801 / #808 | the PR comment's first line read `No blocking findings: Yes` above six 🔴 serious findings — the wording `report.ts` was rewritten to remove, still live in `action/summary.ts` because the fix reached one of two consumers of the same function (merged) |
| #811 | the finding list under-reported: seven genuine focus losses detected, five emitted, because a shared dedup keyed on `wcag|evidence` collapses repeated occurrences that word themselves identically |
| #812 | a finding whose quoted before/after names two *different* controls, passing its own equality check only because both happen to contain the word "collapsed" |

**A rehearsal covers what it ran against, and nothing that has changed since.** "A rehearsal was run once"
and "a rehearsal covers this release" are different claims — the table above is evidence for the first, not
proof of the second. `npm run release:rehearsal-check` says how far the marker is behind: whether it is an ancestor of the
commit about to be released, and how many of the paths the rehearsal exercised have changed since (the three documents in
requirement 2, `action.yml`, and every package a consumer installs: each `packages/*/package.json` not marked `private`).
It was 190 at the swap (2026-10-03), and **that number is a reading, not a failure**: since #3184 the check is in neither
`release:gate` nor `release:gate:ci`, because the outsider job's verdict stands where it stood.

## NOT verified

- **A stranger's JUDGEMENT of any given release, before it publishes.** It used to precede a publish and now follows one by up
  to seven days (ADR 0042, "THE COST"). **A release now claims exactly this, and no more: "released with the outsider job's
  verdict on this version read as `<green|pending|red|absent>`, and the judgement review last read `N` days ago"** — never
  "rehearsed". Read the first from the newest `outsider` job run of `registry-consumer-gate.yml` (a `pending` inside nine hours is not a
  `green`), and the second from the newest closed `Weekly outsider review <ISO week>` row. The outsider job runs the documented path; it does not read
  what the report SAYS, and four of the first rehearsal's five defects were of that kind.

- **The `anthropic` and `openai` judge backends.** Written to their SDK specs and unexercised; this project
  keeps no metered key. They are opt-in, never the default.
- **`msEdgeImageMagnifyUI`** in `--disable-features`. The name is taken from Microsoft's documented *enable*
  flag and is unverifiable through CDP (`SystemInfo.getFeatureState` answers "Unknown feature" even for
  flags that demonstrably work). It is a belt beside a verified brace — `pointer.mjs` is what actually
  closes that hole.

### Closed since

Moved out of the two lists above when they stopped being true, each with the run or reading it rests on.

- **The Action on a real Windows runner — VERIFIED, read 2026-10-09.** [Run 37865857734](https://github.com/a11ign/a11ign/actions/runs/37865857734)
  (`release.yml`, `workflow_dispatch`, sha `06ec4559a`, 2026-10-09 00:39Z to 00:57Z) passed `action-smoke / consumer` and
  `capture-regression / capture`, both on `windows-2022`. `action-smoke` is `uses: ./` with inputs only, so it runs `action.yml`'s own
  steps as a consumer would: NVDA install, Speech Viewer off, Edge first-run policy, the local scorer. It makes three runs (all steps in the
  job passed): W3C's conformant `bad/after/survey.html` must draw a report, an interaction and **no** 1.1.1 accusation; W3C's
  inaccessible demo must still draw 1.1.1; and a run with no `probe-forms` input must press nothing `probe-forms` owns, while the probing run
  must press something. `action.yml` has changed once since that sha, in a description string only
  (`git diff 06ec4559a origin/main -- action.yml`, #4355). **Not shown by it:** any page beyond those two, `windows-2025` or a later
  runner image, a consumer's own `runs-on`, and what the report SAYS (the outsider job's question).
  `act` still cannot help: it is Docker/Linux and NVDA needs Windows. Do not read `capture-regression.yml`'s own run list for this: its newest
  entries (2026-09-18) are `push` runs that failed, on a trigger the workflow's header says was removed on 2026-09-06, and I did not establish why they exist.
- **The 418 stale captures — CLOSED, read 2026-09-24.** The lab's `a11y-job-retrain.service` recaptured the corpus
  (`Capture complete: 1743 captured, 0 failed, 0 skipped, of 1743 cases across 10 workers`) and `check-signals` then read
  **`1743 discriminating, 0 blind, 0 contaminated, 0 uncaptured, 0 stale`** at 2026-09-24T00:54:57Z (`worker-tooling`, read on the lab,
  [#1926](https://github.com/a11ign/a11ign/issues/1926#issuecomment-5809655558)). The generated tier reads uniformly protocol 21. The
  corpus was recaptured again on 2026-10-06 (1,795 of 1,795, #3524); **`check-signals` has not been read since that recapture** by anything this
  repository records, and not by this edit: it reads `runs/`, which is the lab agent's to report ([#4552](https://github.com/a11ign/a11ign/issues/4552)).
  The ~2.9 h `--resume` recapture quoted under *Deferred* below was therefore overtaken by a full recapture and is not owed.

## Known limitations, stated plainly

- **On a real page, eleven criteria are actually assessed — seven of them partially.** Twenty-two in total can
  produce a finding, but four (2.4.6, 3.3.1, 3.3.2, 4.1.3) come only from the trained scorer, which abstains
  on pages unlike its training data — which today is still many real pages. A fifth, 3.3.3, is decided by a
  rule and still cannot fire on a page you do not own: it reads the form probe, which is deliberately off
  there, because submitting somebody else's form is not a review. A sixth, 1.4.13, is rule-decided since
  2026-09-05 and cannot fire on a real page yet for a different reason: the probe it reads has simply not
  been turned on for real-page captures, not a consent boundary. A seventh, 1.4.2, is also rule-decided and
  its probe DOES run on every real-page capture — it has simply never once found what it looks for: 89
  captures carry 8 media elements between them and none autoplay, so the rule is exercised and correctly
  silent rather than blocked. An eighth, 1.3.5, is rule-decided since 2026-09-09 and cannot fire on a real
  page yet for a third reason: no worker-side census populates its evidence on any capture at all, so the
  rule is exercised only against a hand-built fixture — see `criterion-coverage.ts` for all four. The ones
  that always work are the deterministic rules:
  - **In full: 1.1.1, 1.3.1, 2.1.2, 2.4.4.**
  - **Only with an opt-in probe: 3.2.1, 3.2.2, 3.3.3** — a page that renames itself when a control is
    focused or typed into, and an announced validation error that names the problem and not the remedy.
    All three are rule-decided and exact, and all three read probes that press, type or submit — off for
    pages you do not own, so on somebody else's site they cannot fire in either direction.
  - **Rule-decided but never yet demonstrated on a real page: 1.3.5, 1.4.2, 1.4.13, 3.3.7, 3.3.8** — three different
    reasons, and none is a consent boundary. 1.3.5, 3.3.7 (a later required email field that stayed empty) and 3.3.8
    (a password field that cancels paste), the last two referrals rather than assertions, have no worker-side census
    populating their evidence on any capture yet; 1.4.2's probe runs and has simply never observed autoplaying media on a real capture;
    1.4.13's probe has simply not been turned on for real-page captures yet, which is an open gap rather
    than a measured absence.
  - **Partially: 2.1.1, 2.4.1, 2.4.2, 2.4.3, 2.4.7, 3.3.2, 4.1.2** — each covers one failure mode of several, and
    `criterion-coverage.ts` records which mode and why the others are out. Three of them (2.4.1, 2.4.2,
    2.4.3, added 2026-08-22) are failures a static analyser structurally cannot reach: a skip link that is
    present and inert, a route that changes without the title changing, and a tab order that contradicts the
    reading order. A fourth, 2.4.7 (added 2026-09-06), covers only F55 — script removing focus the instant it
    is received — from the same `focusOrder` event log the three above already read; the pixel-based F78
    failure (a styled-away outline) stays entirely out of reach.

  Everything else comes back `cantTell` or `untested`, and the report says which. Measured on the eval
  fixtures: `abstained 5 of 16 failure cases`, recall 78%, 0 false positives.
  - This is the single most important number for deciding whether the tool is worth running, and it had
    never been stated in one place before. Six of WCAG 2.2's 55 A/AA criteria, plus whatever axe-core adds
    for the visual layer.

- **The trained scorer DECLINES outside its support, and says so rather than guessing.** Measured with a
  k-NN feature-space novelty score (Sun et al., ICML 2022). The problem it solves: a linear head on a
  frozen embedding cannot tell it is extrapolating, and it returned **0.97 and 0.99 for 4.1.2 on two
  conformant W3C pages**. For an accessibility tool a false positive is an accusation, so outside its
  support the scorer reports those criteria as **unchecked, not clean**.
  - **The support has since been widened rather than merely respected, and the numbers below moved with
    it.** When the corpus was generated pages only, every training record sat at cosine **0.847–0.99** from
    its nearest neighbour while **28 of 32** real eval fixtures sat at **0.50–0.84** — entirely outside it,
    which is why abstention was the whole answer. Adding 53 real pages to the training set moved the
    training minimum to **0.5587**, so that 0.847 figure describes a corpus that no longer exists. Quoted
    here because it is the measurement that justified abstention, not a current statistic.
  - That is why eval recall reads 59% rather than 90%: the missing 31 points were the model predicting
    beyond its competence and sometimes being right. Not a capability, and not separable from the score.
  - **On real sites the deterministic rule layer is what finds things**, and it still runs when the
    scorer abstains.
  - **The realism tier IS now shipped, and it reversed the two conclusions this section used to state.**
    Those were: "lowering the floor is not defensible" and "a realism tier of 19 real pages was built,
    measured and NOT shipped". Both were true of a 19-page tier from one publisher. At **53 pages from 39
    publishers** they are not, and the reversal is the deliverable — a limitation that survived a serious
    attempt to remove it is a different claim from one that has now fallen to a bigger attempt.
  - **The real-page corpus is 77 pages** (55 training, 22 calibration) from **39 publishers**, every one
    carrying its own published accessibility statement, captured and disjoint from the eval fixtures.
  - **Abstention on real pages fell from ~4–6 of 22 scored to 20 of 22, with 0 false positives.** Measured
    on the held-out calibration set, same 22 pages both times:

    | model | floor | real pages scored | false positives | inaccessible caught |
    |---|---|---|---|---|
    | previous | 0.7192 (derived) | 4–6 of 22 | 0 | 2 of 2 in support |
    | **shipped now** | **0.70 (calibration)** | **20 of 22** | **0** | **2 of 2 in support** |

  - **The floor is now CHOSEN on held-out data, not derived from the training set's own minimum.** The
    trainer takes `--in-distribution-floor` and records `derivedFloor` and `floorSource` alongside it, so a
    reader can always see both what the data implied and what was picked. This mattered: the derived value
    (0.5587) scored 21 of 22 with 0 false positives but turned an honest abstention into a **miss** on
    W3C's `before/tickets.html`, which the previous model caught as 4.1.2. For an accessibility tool
    "I cannot assess this page" is a safe answer and "no findings" on a page its publisher calls
    inaccessible is a wrong one. **Why that page is missed is now known, and it is not the floor** — see
    the operating limitation below.
  - **Held-out acceptance passes on these weights**: 58 true positives, **0 false positives, 0 false
    negatives** across all 8 criteria, every one stable across repeated captures, and disjointness asserted
    against the realism tier rather than only the base corpus.
  - **What the realism tier actually caught, and no synthetic corpus could.** `4.1.2:unnamed-control` moved
    its threshold from **0.05 to 0.9**. Since the trainer picks the lowest threshold reaching zero false
    positives, that means every threshold below 0.9 false-positives on real conformant pages — an 18x error
    that only generated data ever made look safe.
  - **A publisher's disclosed exceptions are honoured, per head.** 53 of 53 real pages carry at least one
    exception; usable real pages per head range 0–41. Where a publisher states in writing that it fails a
    criterion, that head does not train the page as conformant. This was **inert for its whole existence**
    until 2026-08-21 — the join read a key the captured file never wrote — and a failed join was
    indistinguishable from a publisher with nothing to disclose.
  - **Two of the eight criteria cannot be evaluated on a real page at all.** 3.3.1 and 4.1.3 read only what
    the form-submission probe produces, and that probe is off for pages we do not own, because pressing
    *Book* on a stranger's site is not a review. Measured: **0 of 77 real captures carry `formChanges` or
    `postSubmitFields`**. So they are masked on every real page — they were previously trained as clean on
    41 and 39 pages from evidence that was never gathered, which is indistinguishable from a failed capture.
    They keep perfect held-out performance (8/8 each), because those records carried nothing for them.
  - **OPERATING LIMITATION: the scorer's heads carried 225 free vetoes, measured 2026-08-22; the mechanism is current, the number is not (last read 2026-10-06: 74 unclosable + 28 closable veto pairs, in the table at the top).**
    A head penalises features that are 0 on every one of its training positives — free to learn, and
    invisible to every accuracy metric here, because each shares the corpus's structure. Causal, by
    ablation on unedited real captures: `4.1.2:unnamed-control` moves `before/tickets.html` from 0.4525 to
    0.9752 when three table features are zeroed, and adding one properly named field to `before/news.html`
    drops it 0.9240 → 0.1688. Of the 147 training records carrying an unnamed form field, none has a table
    and none has a named field.

    **How much reaches a report is bounded by the layer split, and this correction matters.** An earlier
    version of this bullet said the *tool* reports an unnamed control only where nothing else is named.
    That is true of the HEAD and not of the product: `4.1.2:unnamed-control` is `decidedBy: "rules"` in
    `rule-ownership.json`, so the scorer is suppressed for it and the exact rule answers — 0 false
    positives across 1,183 conformant records. Verified on the three W3C pages where the head scores worst:
    the rule layer reports `4.1.2: combo box, collapsed, QUICKMENU ---- greater` on **all three**,
    including the one the scorer misses entirely.

    The vetoes that DO reach a report are on the nine subtypes the model decides alone —
    `1.1.1:generic-alt`, `1.3.1:fake-heading`, `1.3.1:unassociated-table`, `2.4.4:regex`, `2.4.6:regex`,
    `3.3.1:validation-error-silent`, `3.3.2:placeholder-only`, `3.3.2:unnamed-form-field`,
    `4.1.2:state-change-silent`, `4.1.3:form-activation-silent`. Those heads carry 12–21 vetoes each.

    The remedy is multi-defect pages, not a retrain. ADR 0015 has the full measurement.
  - **The "2 of 3 inaccessible pages caught" figure is ONE defect observed three times.** Every form
    control on all three W3C BAD `before` pages is the same unnamed navigation combo box in the shared
    site chrome of one template. Real-page recall must be quoted in distinct defects, never page counts.
  - **Caveats, and they are load-bearing.** 22 calibration pages support an error-rate granularity of about
    1/(n+1) ≈ **4.3%** and nothing finer, so no conformal guarantee is claimed or claimable. The choice of
    0.70 over 0.65 rests on **one page sitting 0.0022 below the threshold** — the principle (prefer
    abstention to a false negative) is sound, its effectiveness on that page is partly luck, and more
    known-inaccessible real pages are what would firm it up. Widening the set means finding more publishers
    who state their own conformance, because labelling pages ourselves would make the measurement our own
    opinion.

  **The generator half of the fix has landed** (`6d5fcae`): the corpus now generates a median of 14 links and
  a maximum of 40, and a capture was measured reaching 25 of 25 links on a rescaled page. What remains is
  mechanical and expensive — recapture 848 pairs and retrain. Until that runs, the SHIPPED model is exactly
  as limited as this paragraph describes, because it is still the model trained on the old corpus.
- **`task` shapes the CAPTURE but never the verdict.** This entry used to say the task did nothing on the
  defaults; that stopped being true when `probe-forms` began defaulting to **true** in the GitHub Action. On
  a default Action run the task now selects which control gets activated, and therefore whether 3.3.1 and
  4.1.3 evidence exists at all. It still does not affect the default `local` scorer's assessment — that
  scorer never sees it — so the report deliberately makes no claim about whether your task was completable.
  The CLI keeps `probe-forms` off, because it can be aimed at a page you do not own. See
  `docs/github-action.md`.
- **`taskCompletable` is a coarse proxy** — derived from "did anything score as a blocker", because this
  layer has no head for task completion.
- **One screen reader, one browser, one operating system.** Every finding is NVDA in Microsoft Edge on
  Windows, and WCAG conformance depends on what a page does with the assistive technology actually in use. So
  this tool demonstrates accessibility support for **that combination and no other** — it is not evidence
  about JAWS, VoiceOver, Narrator, TalkBack, Orca, or NVDA in a different browser. Most desktop screen-reader
  users are on Windows with NVDA or JAWS, which is why this combination came first; JAWS is the gap that
  matters most and is the hardest to automate. Each report names the combination that produced it.
- **Page-scoped, not process-scoped — and WCAG claims conformance for PROCESSES.** WCAG 2.2 §5.2.4 requires
  every page in a multi-step process to conform, so a tool that examines one URL structurally cannot assess
  sign-in, checkout or booking as a whole — ours or anyone's. Findings are about the page given to it, and **a
  clean report on one page is not a conformance claim for the process that page belongs to.** ADR 0011 records
  what changing this would take.
- **A page behind a consent wall is refused, not reported.** The screen reader is held inside the modal, so
  the capture describes the dialog rather than the page; the run exits 2 and says so. Correct, but it means
  many EU-facing commercial sites cannot be measured without dismissing consent first.

## Deferred, with the reason

- **Where a corpus snapshot lives long-term.** `npm run corpus:snapshot` writes a timestamped archive of
  `runs/`, which is gitignored and represents hours of worker time. It deliberately does NOT sync anywhere:
  a snapshot on the same disk protects against `rm -rf runs/` and a bad recapture, not against losing the
  machine, and a repo that silently uploaded a user's captures somewhere would be making that decision for
  them. Syncing it is an operator choice.

> **The 47.4% / 85.9% pair this row used to carry is retired.** It was an August reading of a tree that has since lost its laid layers and moved from c8 to rstest. The 85.9 came from `node --test --experimental-test-coverage`, which counted only the files a test loaded, so files with no test were invisible rather than zero; the 47.4 was the same tree with every file counted. Neither describes the population below. (Kept on its own line so that no explanation of the old figure shares a line with the current one.)

Not bugs being hidden — work consciously not done before shipping.

| item | why deferred |
|---|---|
| **Test coverage is 79.29% lines, 77.46% statements (`pnpm run coverage`, read 2026-10-09 at 791552a77)** | **What it counts:** the merged rstest (`@rstest/coverage-v8`) and child-process reading over `.c8rc.json`'s `include` (`packages/*/src`, `packages/*/bin`, `scripts/*.mjs`), 4,905 of 6,186 lines and 6,479 of 8,364 statements, with files no test loads counted as 0 rather than left out. **What it leaves out, by name in `.c8rc.json`:** the four LAID layers, which are other repositories' code with their tests left there (`packages/lab`, `packages/control`, `packages/nvda-worker`, `packages/worker-fleet`); and six files a unit test cannot reach (`packages/cli/src/cli.ts`, `packages/scorer/src/fetch-encoder.ts`, `packages/cli/src/scan/axe.ts`, `packages/cli/src/scan/run-axe.ts`, `packages/cli/src/auth/attach-spike.ts`, `scripts/coverage.ts`). The NVDA-driving code is excluded as `packages/nvda-worker/**`; it is covered by the capture and evidence checks against a live worker, not by this number. **Where the CI runner differs:** it gates at `lines: 70, statements: 69` and read about 0.8 points lower on statements than a local run at the time the floor was set (69.36% against 70.14%, #3998); that difference was measured once then and not re-measured here, so this local figure is not a CI figure. The run printed 242 `Failed to process coverage` lines for child-process files, which can only lower the total. **Reproduce it:** `pnpm install --frozen-lockfile`, `pnpm run build`, then `pnpm run coverage`; the last line it prints is `coverage: lines … statements …`. The figure moves with every merge; re-read it before quoting it, and the commit above is the only thing this row claims it was true at. |
| **Four modules still run their whole program on import** (`capture-screenreader-dataset`, `stability-gate`, `evidence-check`, `doctor`) | This is the coverage blocker as much as a smell: a module that captures or deploys on import cannot be imported by a test, which is why several of the largest zero-coverage files are zero. It has bitten twice in one session — importing the deploy tool began enumerating VMs, and importing the run started a capture and leased a page server. `deploy-worker` and `check-worker-code` are already guarded; these four are the rest. |
| `probeElementsListCounts` (40 code lines) and `leaseWorkerPool` (48) reviewed and left | Both read as one thing; splitting either would need a sentinel or a mutable bag. Recorded so the decision is visible rather than an oversight. |
| Another agent's untracked `case-matrix.test.ts` reports TS7031 | Implicit `any` in destructuring against the rescaled generator's shape. Untracked, so a clean tree typechecks clean; theirs to fix. |
| **`gate:stability` FAILS on the rescaled pages — 4/6 canaries** | **This gates the recapture below and must be diagnosed first.** `form-unlabelled/good` varied its `lists` count 0,0,0,0,1 and its transcript CONTENT at identical counts; `table-unassociated-headers/bad` reached 29,29,29,29,**5** headings. The worker logged **1 recovery** during the gate, so a papered-over mute-NVDA fault is the leading suspect for the truncated run — bigger pages mean longer sweeps and more chance of a timing miss. Starting the 848-pair capture in this state would produce evidence that varies for an unchanged page, "the one defect this project cannot tolerate". |
| **DONE 2026-08-08: recaptured and retrained.** | The full corpus is fresh protocol-5 evidence: 1,059 of 1,061 cases discriminating, **0 blind** (was 83), 0 stale, `gate:stability` 6/6 (was 4/6). Five capture defects were fixed to get there, including sweeps truncated by the capture deadline and a removed anchor that had silently zeroed the `lists` field on every page whose links sit in a `<ul>`. The generalisation claim is now testable, and the answer is the abstention limitation above: the corpus does not span real-page structure, so the scorer declines on real pages rather than extrapolating. Note the page sizes were REDUCED (ADR 0009) for affordability, which widened that gap — the realism tier is the outstanding work. |
| 98 cases whose `badSignal` cannot match their own generated page | Pre-existing inconsistency in `case-matrix.mjs`, exposed by regenerating pages; the local corpus in gitignored `runs/` is inconsistent as a result |
| Scoped cache invalidation | Two recaptures were measured as 65% unnecessary — a global `CAPTURE_PROTOCOL_VERSION` invalidates captures a fix could not have touched |
| ONNX export | Would drop torch (~529 MB) from the Action's setup |
| `provisionRevision` reads `"unstamped"` | Needs a deliberate pool-wide re-provision |
| `packages/lab/scripts/check-screenreader-hardening.py` was also untracked | Now committed; backs `npm run training:hardening`, which is in no gate, so it had no effect on any recorded result |

### Why those 418 captures went stale — diagnosed, so nobody re-derives it

> **Closed — read 2026-09-24 (see *Closed since*): 0 stale after a full recapture. What follows is the 2026-08 diagnosis, kept as history; the `--resume` command below is no longer owed.**

`check-signals` reports **554 discriminating, 83 blind, 6 contaminated, 418 stale**. The stale ones were
captured while the page rescale was live in the working tree; `3cce38d` shelved the rescale and restored the
generator, but not those captures. Measured rather than assumed: regenerating every page and comparing to the
hash each capture recorded gives **643 MATCH / 418 DIFFER**, so a regenerate cannot fix it — the committed
generator genuinely no longer produces those pages. The families are form (106), filter (106), image (61) and
the table cases.

`--resume` targets exactly these and nothing else, because `hasUsableCaptureFiles` **is** the resume
predicate — the same function `check-signals` calls:

```bash
npm run training:capture -- --resume      # 418 pairs, ~2.9 h, one worker
```

One consequence to weigh when this is picked up: the v4 scorer was trained across both page populations, so
those 418 contributed transcripts from larger pages than the corpus now generates.

## The red CI job is FIXED

`.github/workflows/ci.yml` (`lint.yml` until it was retired and folded in, 2026-09-06) used to fail on 6 files under `packages/nvda-worker/src/`, and the cause was one line:

```
Error: No available supported screen readers
```

`@guidepup/guidepup` **throws at import time** where no screen reader exists. CI is Linux, so merely importing
`capture-core.mjs` failed — and every test that imported it to reach a *pure* helper (`sweepStepFromSpeech`,
`dedupeKey`, `phraseAction`, `crossCheckStructure`, `elementsListRowName`, `failIfScreenReaderIsMute`,
`edgeArgs`) died with it. Node reports these per FILE — "test failed" — which reads like broken logic rather
than an unavailable dependency. It had been red since 1 August, growing from 2 files to 6 as more tests reached
for pure logic through `capture-core`.

Those seven functions now live in `capture-pure.mjs`, which imports no guidepup; `capture-core.mjs` imports and
re-exports them, so every existing caller is unchanged.

**The move was computed, not eyeballed.** An earlier attempt by hand broke `capture-core` — 2,370 lines, no
local test, it only runs against real NVDA on the worker — and was reverted. This time the transitive closure
of the seven symbols was derived with the TypeScript parser: exactly 19 top-level declarations, containing no
guidepup symbol, moved with their comments attached.

Verified, in the order that matters:

| check | result |
|---|---|
| the 6 files with `node_modules/@guidepup` physically moved away | **43 assertions pass** — CI's exact condition |
| `pure-graph.test.ts` | walks the import graph and fails on a Mac if any of them reaches guidepup again |
| `node -e "import('./capture-core.mjs')"` | clean — the only real check for a `.mjs` |
| `npm run capture:check --worker=…` on the real VM | **ALL CAPTURE CHECKS PASSED**, probe values and role phrases included |
| `npm run worker:deploy` | `/health.code` matches over HTTP, which shares no failure mode with the push |
| `npm run evidence:check` | **8 compared, 8 SAME** — evidence unchanged, so the cache stays valid and `CAPTURE_PROTOCOL_VERSION` stays at 4 |

### `evidence:check` was ALSO comparing captures asked DIFFERENT QUESTIONS

Found during M5, one field along from the page problem above and invisible to it. The probes are opt-in over
the wire, so a case whose recorded options differ from what the manifest asks for now is not comparable
either: **61 cases recorded `probeTables: true` while the manifest on disk said false**, because the manifest
predated the fix that derives that flag from the signal type. The fresh capture then asked no table question,
`structure.tableCells` went 4 → 0, and the diff called it an evidence change.

Both halves are now fixed and both were proven rather than argued:

- `evidence:check` excludes cases whose recorded probe options differ from the manifest's, and says how many;
- regenerating the manifest (`npm run training:generate`) removed the mismatch — **0 cases now differ**, page
  staleness unchanged at 643 current / 418 stale — and the two cases that had reported CHANGED then compared
  **2 of 2 SAME**.

That manifest staleness mattered beyond this check: a resumed capture run would have asked 61 table cases no
table question, which is precisely the "8 cases went silently blind when a probe changed" failure this repo
already has a rule about.

### `evidence:check` was comparing captures of DIFFERENT PAGES

Its first run on this change reported **40 of 47 CHANGED**, with differences like `structure.links 40->0` — and
recommended its own worst outcome: "bump `CAPTURE_PROTOCOL_VERSION` and recapture", i.e. 2,122 captures, for a
refactor that moved pure functions between files and altered no behaviour.

Every one of those 40 was a case whose PAGE had moved since capture (the 418 above): the recorded capture
describes the shelved rescaled page, the fresh one describes the current small page. Cross-tabulated, the split
is exact — **40 CHANGED / 40 stale pages, and all 8 whose page was current came back SAME or rejected. Zero
cases changed on an unmoved page.**

So the tool now excludes cases whose page has moved, using `hasUsableCaptureFiles` — the same predicate
`--resume` and `check-signals` use, so "comparable" and "current" cannot drift apart. It says how many it
excluded (418 of 1,061 here), and if nothing is comparable it exits 2 rather than reporting SAME over nothing.

This matters beyond one refactor: `evidence:check` exists to make a capture optimisation *affordable to
evaluate*. A version that cries "recapture everything" whenever the corpus is mid-migration is a version that
gets ignored, and then the cache-invalidation decision goes back to guesswork.

One thing came free with it. There were **two copies of the worker's hashed-file list plus a third derived by
regex** — `server.mjs`, `check-worker-code.mjs`, and `deploy-worker.mjs` parsing the second one's source. They
had to agree on contents *and order* or `/health.code` compares a different set than was deployed. Adding
`capture-pure.mjs` would have meant editing two lists by hand, which is precisely the shape that made this
check necessary in the first place, so the list is now one module (`worker-files.mjs`) that all three import —
and it contains itself, so editing it changes the hash.

## Reproducing the verification

```bash
npm run lint && npm run typecheck && npm test   # no worker, no venv, no network
npm run release:gate                            # signals -> rules -> acceptance -> judge quality
./packages/lab/scripts/action-dry-run.sh https://example.com "Complete the checkout"
npm run layers:compare -- '[["https://www.washington.edu/accesscomputing/AU/before.html","Apply now"]]'
```

`check-signals` is **red on this machine** and green on a fresh clone, because it reads the local corpus in
gitignored `runs/`, which is mid-migration (see the deferred table). It has no bearing on the shipped
artifacts: the model was trained and validated against a consistent corpus, and its report records that
dataset's sha256.
