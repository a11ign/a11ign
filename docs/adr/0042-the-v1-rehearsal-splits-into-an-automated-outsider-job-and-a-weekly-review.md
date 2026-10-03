# ADR 0042: the V1 rehearsal splits into an automated outsider job on every release and a weekly judgement review, and neither is a gate before a publish

## Status

**Proposed, 2026-10-03.** Row #3185, child of the chairman's direction of 2026-10-03 on the V1 rehearsal (RELEASE.md, "The
V1 rehearsal -- a standing release gate", #813; #928, #3130). It records seven decisions that `ceo` ruled on the chairman's
direction; **this ADR writes them down with their readings and does not reopen them.** It changes no workflow, no release and
no gate: the rows that carry it out are the appendix, filed beside this one.

The chairman's direction (#928, 2026-10-03): keep what the rehearsal protects, and stop it being a manual gate on each release.

**Measured at commit `97f7e9371`, 2026-10-03T10:45Z.** A reading is a moment: every command below can be re-run, and a number
quoted from here without re-running it is a quotation, not a measurement. The tree was built (`pnpm run build`) before the
readings that run a script.

**Extends [ADR 0041](./0041-every-repository-releases-itself-continuously.md).** Its decision 3 says the gate is never
softened; this ADR says what moved (WHEN a stranger reads, and who) and what did not (the runner-provable gates, and that a
stranger reads at all). Nothing in 0041 is withdrawn.

## Context

**The waterfall, measured.** RELEASE.md makes a hand rehearsal a precondition of every publish: a session that built none of
the release follows only the public documentation from a fresh clone, and the release waits on its reading. The marker that
records the last one is a commit sha, and `release:rehearsal-check` (a stage of `release:gate:ci`) refuses any commit that
changed something the rehearsal exercised since.

```
$ grep -n "REHEARSAL:COMMIT" RELEASE.md
170:<!-- REHEARSAL:COMMIT 633c908fed2ec6ab3f556dfc7e1dbbe59d6b7acf -->
$ node packages/lab/scripts/check-rehearsal-currency.mjs | sed -n "1p;3p" | cut -c1-230
  rehearsal marker: 633c908fed2ec6ab3f556dfc7e1dbbe59d6b7acf; release commit: 97f7e937156bfb57c95ec758898ca82fd769ef49
  RELEASE.md's rehearsal marker names 633c908fed2ec6ab3f556dfc7e1dbbe59d6b7acf, an ancestor of 97f7e937156bfb57c95ec758898ca82fd769ef49 -- but the rehearsal EXERCISES 190 path(s) that have changed since it:
```

The rehearsal was run on 2026-09-20; thirteen days of ordinary merges later 190 of the paths it exercised have changed and the
check refuses. The dry run of `release.yml` stops at the same place, with every later step skipped behind it:

```
$ gh run view 37114533700 --repo a11ign/a11ign --json jobs --jq ".jobs[]|select(.name==\"release\")|.steps[]|select(.conclusion==\"failure\")|[.number,.name,.conclusion]|@tsv"
10	The release gate — the part a runner can prove	failure
```

So the first release since `0.1.0` would wait on a full fresh-session rehearsal. A builder cannot run one (RELEASE.md's
requirement 1, the thing being tested is the knowledge a builder cannot un-know), the only repository one has been run in is the
chairman's personal one, and the agents cannot write to it:

```
$ gh api repos/DanBeckDev/a11ign-v1-rehearsal --jq .permissions
{"admin":false,"maintain":false,"pull":true,"push":false,"triage":false}
```

And any `README.md` or `action.yml` commit afterwards would stale it again. **What a per-release stranger run was buying had
also fallen:** RELEASE.md's own reading of the most recent rehearsal:

```
$ grep -o "0 lived-experience findings, [^(]*" RELEASE.md | head -1
0 lived-experience findings, 3 axe violations inside the YouTube embed 
```

That is the set rehearsal 6 found, so the seventh run found nothing new while its cost stayed a whole release.

**What the rehearsal protects, which is kept:** the 2026-08-05 class (an untracked scorer that no fresh clone could run) and
#494's three publish-blockers, both of them "the documented path does not RUN from a fresh start", and a stranger's judgement of
whether the report is worth their minutes. They are two different questions and only one of them is a command.

## Decision

### DECISION 1 — the rehearsal splits in two, and neither half is a human step before a publish

**Decision:** the mechanical half (does the documented path RUN from a fresh start) is automated and runs on every release; the
judgement half (is the report worth a stranger's minutes) is a regular review on a rhythm. Releases keep flowing between
reviews. What the rehearsal PROTECTS is kept; what is retired is its being a manual gate on each release.

**Owner:** #3184 makes the swap; #3181, #3182 and #3183 build the halves.

```
$ grep -c "rehearsal-check" package.json
3
```

The marker check is wired into both `release:gate` and `release:gate:ci` today, which is the gate this decision retires as a
block and keeps as a reading (decision 6).

### DECISION 2 — the mechanical half is a CI job in a repository outside the `a11ign` organisation, owned by a dedicated test account

**Decision:** the job runs in a PUBLIC repository outside the `a11ign` organisation, owned by an account made for the purpose and
**not the chairman's**, so the chairman is not a dependency; the five accounts the organisation lists are all members and are
refused for it. It starts from an empty workspace, installs the JUST-PUBLISHED package and the Action exactly as README says
(only the Action's ref, `url` and `task` are substituted, and the job prints every substitution), against a site we do not own,
and passes only if the documented path completes and the result has the documented shape. It is the 2026-08-05 class and #494's
three publish-blockers made a command: no agent, no human, no marker to go stale.

**Owner:** #3181 (the tracked source of the workflow and its verdict reader), #3182 (the repository, green once and red once).

```
$ gh api orgs/a11ign/members --jq "[.[].login]|join(\",\")"
a11ign-ai-leads,a11ign-ai-workers,a11ign-bot,a11ign-ci,DanBeckDev
```

### DECISION 3 — no credential crosses the organisation's boundary, in either direction

**Decision:** the outside repository learns of a release by POLLING public data (the registry's `latest` and the release tag),
and `a11ign` reads ITS public run list. A push into the outside repository would need a stored token, which ADR 0041 (publish
over OIDC with NO stored token) and `main-review-requirement.md` rule out of the release path, so `repository_dispatch` is not
used (Alternatives rejected).

**Owner:** #3181 writes the poll; #3182 stands the repository up with no secret.

```
$ npm view a11ign dist-tags --json
{
  "latest": "0.1.0"
}
```

That `latest` is what the job polls. **UNMEASURED:** how long after a publish a poll sees it, and whether an inactive public
repository's schedule is disabled by the platform and when (falsifier 4).

### DECISION 4 — a red verdict files a row and does not stop the next publish

**Decision:** a version on the registry cannot be unpublished after 72 hours and the org fixes forward (chairman, 2026-09-24),
so the verdict turns the release's follow-on check red and files ONE `regression` row per version. It does not refuse the next
publish: the fix is itself a release, and a refusal would deadlock it behind its own defect. **A post-publish check cannot
prevent THAT publish.** The version that fails the job is already on the registry when the job learns of it, and this ADR says
so in terms. The pre-publish gates that need no stranger (the packed-install check, the consumer gate, the registry gate) stay
and are untouched.

**Owner:** #3181 builds the reader that turns a verdict into a row; #3184 wires it into `registry-consumer-gate.yml`, whose
`workflow_run` trigger already fires when `release` completes.

```
$ grep -n "workflow_run" .github/workflows/registry-consumer-gate.yml | head -2 | cut -c1-90
22:# touched: `workflow_run` fires when `release` completes, which is the "after a publish
26:#   - `workflow_run`     after `release` completes. A DRY run also completes, and gatin
```

### DECISION 5 — the judgement half is a WEEKLY review by a session that built none of the recent work

**Decision:** filed by a schedule (a wall-clock event, the one thing a schedule is for), answering `docs/try-it.md`'s four
questions in writing, every finding filed as a row (RELEASE.md's requirement 5 stands; requirements 1 to 4 become the review's).
The sessions that built the work in the window are named INELIGIBLE on the row. Nothing waits on it.

**Owner:** #3183.

```
$ grep -n "^[1-4]\. \*\*" docs/try-it.md | cut -c1-72
448:1. **Did the run see your page, or did it see the cookie banner?** T
450:2. **Did you believe the findings?** For any you did not, the announ
452:3. **Were the referrals worth reading, or noise?** They will outnumb
455:4. **Was it worth the minutes it cost**, and did it tell you anythin
```

### DECISION 6 — the swap is atomic

**Decision:** the rehearsal marker stops blocking and the outsider verdict is wired in by ONE pull request, so no commit on
`main` has neither; `release:rehearsal-check` becomes a reading, and RELEASE.md's rehearsal section is rewritten to match, with
its `NOT verified` entry saying what a release now claims. It waits until the job exists and has been seen GREEN and seen RED.
Removing the old gate first leaves a window with no stranger-facing check; adding the new one first leaves a release blocked by a
check this direction retires.

**Owner:** #3184.

```
$ node packages/lab/scripts/check-rehearsal-currency.mjs | grep -c "EXERCISES"
1
```

### DECISION 7 — #3130 is re-planned

**Decision:** its first release goes out once the automated job exists and is green, not after a hand rehearsal. Steps 1 and 3
to 6 of `ceo`'s 2026-10-03 order (a rehearsal sha, a hand rehearsal, a marker-update row, a dry run at its merge sha) are
cancelled; the manifests move from `0.0.0` to `0.1.0` with its four currency-pin updates stays. #3130's request for write
access on `DanBeckDev/a11ign-v1-rehearsal` is WITHDRAWN: that repository is the chairman's personal one and the agents have no
write access to it.

**Owner:** #3130, as re-planned on it.

```
$ gh api repos/a11ign/a11ign/issues/3130/dependencies/blocked_by --jq "[.[]|\"#\(.number)(\(.state))\"]|join(\" \")"
#3140(closed) #3184(open)
```

## What this does NOT change

The zero-false-positive claim, the asserted-versus-referred split, `main`'s review requirement, and the runner-provable release
gates. It moves WHEN a stranger reads, never WHETHER one does. It also changes no file: RELEASE.md and
`check-rehearsal-currency.mjs` are #3184's.

## Consequences

### THE COST, which this ADR does not soften

**A stranger's JUDGEMENT used to precede a publish and now follows a publish by up to seven days.** From RELEASE.md's own table of the
first rehearsal's five defects (2026-09-09, run 34364673899, against `8849f92d`), an automated outsider job would have caught
ONE class and would not have caught the other four:

| defect | what it was | the automated job |
|---|---|---|
| #796 | broken links, missing `permissions:` in every quickstart snippet, a public-claim guard too narrow to see the one file readers are told to copy | CAUGHT: a snippet that does not run as written fails the documented path |
| #801 | the PR comment's first line read `No blocking findings: Yes` above six serious findings | NOT CAUGHT: the run completes and the shape is as documented; the defect is what the report SAYS |
| #808 | the same wording, still live in `action/summary.ts` because the fix reached one of two consumers | NOT CAUGHT: the same, a judgement about what the report says |
| #811 | the finding list under-reported: seven genuine focus losses detected, five emitted | NOT CAUGHT: nothing in the job counts what the page held |
| #812 | a finding whose quoted before/after names two different controls | NOT CAUGHT: a stranger reads the quote, and no automated job does |

So a defect of the judgement class can now reach a user before a review reads it. That is the trade the chairman chose, and
falsifier 3 is how it is read back.

- **The outsider job runs after the publish, so it can never prevent that publish** (decision 4). The version it fails is on
  the registry, and the remedy is a fix released forward.
- **A weekly review cannot be run by the session that built the work**, so its first review waits on the outside repository
  existing (#3182) and the review inherits whatever rhythm of eligible sessions the org has.
- **The review's yield is unmeasured.** The only readings so far are the seven hand rehearsals' (see below).
- **The job's cost is unmeasured.** A Windows runner minute on every release is the price, and a schedule on an inactive public
  repository may be disabled by the platform.

## Alternatives rejected

- **Keep the hand rehearsal as a per-release gate.** Rejected: the waterfall measured under Context. It is 190 paths stale
  thirteen days on, a builder cannot satisfy it, the agents cannot write to the repository it ran in, any README or `action.yml`
  commit re-stales it, and its most recent run found nothing new.
- **Block the next publish on a red verdict.** Rejected: it deadlocks the fix. The fix for the defect is itself a release, and a
  refusal would hold it behind the defect it repairs. A version cannot be unpublished after 72 hours and the org fixes forward.
- **Push the release into the outside repository by `repository_dispatch`.** Rejected: it needs a token stored in `a11ign` with
  write access outside it, which decision 3 forbids (ADR 0041 publishes with NO stored token).
- **Publish to a pre-release dist-tag, test it, then promote.** Rejected for now: it would make the mechanical half pre-publish,
  but #3131 retired `dist-tag` from `release.yml`, and the poll latency it would wait on is UNMEASURED. **It is the first thing to
  revisit if falsifier 1 fires for the mechanical class.**
- **Use `DanBeckDev/a11ign-v1-rehearsal`.** Rejected: it is the chairman's personal repository, which makes the chairman a
  dependency, and the agents have no write access to it (the reading under Context).
- **Use an `a11ign-ai-*` or bot account.** Rejected: all of them are members of the organisation (the reading under decision 2),
  so the job would not start from outside it.

## What would falsify this

Each is a reading that can be taken. A falsifier that fires amends this ADR; it is not quietly absorbed.

- **Falsified if** (1) a release defect of the MECHANICAL class (the documented path does not run from a fresh start) reaches a
  user and is first found by something other than the outsider job.
- **Falsified if** (2) a weekly review finds a defect of the mechanical class that the job did not: that retracts "the mechanical
  half is automated" for that route.
- **Falsified if** (3) a defect of the JUDGEMENT class reaches a user AND is first reported by a person outside the org rather than
  by a weekly review, counted over eight weeks: the cadence then moves to daily.
- **Falsified if** (4) the outsider job's false-red rate is high enough that a red is read as noise: a gate people learn to
  ignore is a gate that is gone.

**UNMEASURED, and named so nobody reads a guess as a figure:** the publish-to-run latency; whether an inactive public repository's
schedule is disabled and when; the false-red rate; and what the weekly review yields (the only readings so far are the seven
hand rehearsals', and RELEASE.md's own reading of the latest is the "0 lived-experience findings" above).

## Appendix: the rows filed beside this ADR

Read from the rows and their native edges (`gh api repos/a11ign/a11ign/issues/<n>/dependencies/blocked_by`) at the commit above.
**Carries** names the decision a row makes true; **Blocked by** is the native edge, or the named condition when the wait is not
an edge.

### ROW 3181 — the mechanical half, part 1: the outsider job's tracked source, its verdict reader and their tests

**Carries:** DECISION 2, DECISION 3, DECISION 4.
**Blocked by:** nothing.

### ROW 3182 — the mechanical half, part 2: stand up the outsider repository under a dedicated test account, green once and red once

**Carries:** DECISION 2, DECISION 3.
**Blocked by:** #3181, and the chairman's one ask (creating an account that is not a member of the organisation, asked once on #3182).

### ROW 3183 — the judgement half: a weekly review by a session that built none of the recent work, filed by a schedule

**Carries:** DECISION 5.
**Blocked by:** nothing. Its first review waits on #3182.

### ROW 3184 — the swap: the outsider job's verdict replaces the rehearsal marker as the release check, atomically

**Carries:** DECISION 1, DECISION 4, DECISION 6.
**Blocked by:** #3181, #3182, #3160 and #3185 (this row).

### ROW 3130 — release a11ign from main now, re-planned

**Carries:** DECISION 7.
**Blocked by:** #3184 (and #3140, closed), as re-planned on #3130 on 2026-10-03.
