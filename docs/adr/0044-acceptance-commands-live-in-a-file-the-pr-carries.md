# ADR 0044: the Acceptance commands live in a file the pull request carries, so a description edit cannot reach the verdict

## Status

**Proposed, 2026-10-09.** Row #4415 (filed by `ceo`). The question came from the chairman's session, relayed by a caller
`prompt:session` could not identify: "editing a PR description making it red is crazy." **Decision: yes, in the order below, and not
before #4413 lands.** It changes no code: the rows that do are the appendix.

**Measured on 2026-10-09**, a11ign at `74b9c5e20`, agent-org at `2af5381` (v0.90.0, read in place with `git grep`, never run). **A
reading is a moment:** each command can be re-run, and a number quoted from here without re-running it is a quotation.

## Context

**The merge-blocking verdict is a function of text anyone with write access can change after the review.** `reusable-acceptance.yml`
reads the LIVE body (`gh api repos/…/pulls/N --jq '.body'`) and refuses to fall back to the event payload's copy (#3286, line 84 to 91:
a Dependabot body is rewritten seconds after `opened`). It hands that body to agent-org's `acceptanceReport`, which reads from it the
`Acceptance:` commands, the `Refutation` and `Mutation` sections and the hand-run and full-history declarations
(`src/acceptance-commands.ts`, `acceptanceReport` and its callers), and to `extractClosesDeclaration`/`closesReferences` for the rows
the PR closes (#4138). The workflow's own comment calls the body "adversarial": the step output carries a random delimiter so no body
line can end it early. Three consequences follow, all measured in this repository's history:

1. **A description edit is a CI event.** `edited`, `labeled` and `unlabeled` are the "meta" events (`ci.yml` `run-name` and
   `concurrency`), and the #3211 agreement step exists only so a meta run and a code run on one head agree. #4406 went red on a
   cancelled meta run after a body edit (#4413).
2. **A review does not cover what runs.** An approval attaches to a head SHA; the commands CI executes attach to the body, which
   moves without a new SHA. `.claude/rules/main-review-requirement.md` already records that a review outlives its head; this is the same
   gap pointed at the commands.
3. **Every reader of the commands needs the live body, and the live body is fetched with a token** (the one step in the job that holds
   one, and so the one place the "adversarial" input and a credential meet).

**Who reads the body today (agent-org at `2af5381`, a loose pattern, so an upper bound):** `git grep -l -E
'extractAcceptance|extractClosesDeclaration|pr\.body|PR_BODY'` over `src/` outside tests names 17 files, among them `acceptance-commands.ts`,
`pr-open.ts`, `verify-stamp.ts`, `work-gate.ts`, `arm-pr.ts`, `closes-mismatch-check.ts`, `close-rows-for-merged-pr.ts` and
`merge-guard/lookups.mjs`. They split in two, and the split is the whole design:

- **The Closes readers** (`arm-pr`, `closes-mismatch-check`, `close-rows-for-merged-pr`, `work-gate`, `merge-guard`) read the line GitHub
  ITSELF acts on to close a row at merge. A body edit that changes that line changes what the merge does, so it SHOULD be a CI event.
  They stay on the body.
- **The Acceptance readers** (`acceptanceReport` and the section extractors, `pr-open`, `verify-stamp`) read text that exists for CI and
  for reviewers. Nothing outside this repository acts on it. These can move.

**Scale of the file population, if each PR carries one:** 456 pull requests merged in the 7 days from 2026-10-02
(`gh pr list --state merged --search 'merged:>=2026-10-02' --limit 1000 --json number --jq length`), and 6 are open (`gh pr list --state
open --json number --jq length`). So a file per PR is about 65 files a day landing on `main`, and the migration window is short: six
open PRs carry a body Acceptance today.

## Decision

**1. Take it, behind #4413, in this order.** #4413 fixes the instance (a prose-only edit triggers nothing that can fail; a cancelled
sibling is never a verdict) and does not wait on this ADR. It stays valuable afterwards, because a body edit that changes the `Closes`
line must still run the checks. This ADR removes the larger class: **after it, the verdict's only body input is the `Closes`
declaration, and every other input is in the reviewed tree at the head SHA.**

**2. The file.** One file per pull request, in the directory `.acceptance/`, named for the branch with each `/` replaced by `~` (the branch
`agent/foo-4415` is `.acceptance/agent~foo-4415.md`). **The mapping is injective because `~` cannot appear in a git ref name**
(`git check-ref-format` forbids it), so no two branches share a file; `--` was the first draft and was refused in review, because
`agent/foo--bar` and `agent/foo/bar` both gave `agent--foo--bar.md`. Two collisions remain and both are loud, not silent: branches
differing only in case on a case-insensitive checkout, and a branch name reused within the 14-day sweep window; each surfaces as git's own
add/add conflict on the second PR, never as one PR running another's commands, because CI reads the file the PR ADDS. Its content is **the body's own grammar**: the same `Acceptance:` header, the same
`Refutation`, `Mutation`, hand-run and full-history sections, parsed by the SAME `acceptanceReport` and `extract*Section` functions, which
already take a string. The only change to the parser is where the string comes from, which is the cheapest migration available and the
reason the grammar is not redesigned here (a second grammar is a second parser, and `pr-open.ts`'s own header says a local re-derivation of "is this body valid" is how a body
passes the wrapper and fails in CI).

- **CI reads the file the pull request ADDS**, found by diffing the head against the merge base for paths under `.acceptance/`, not by
  computing a name from the branch. Zero added files reads as `ACCEPTANCE: MISSING`; two as the existing duplicate-section refusal.
  Reading "the file this PR adds" and not "the file at the branch's name" means a stale file already on `main` is never run, a renamed
  branch still works, and nothing needs the branch name to be trusted.
- **The body keeps `Closes`** (GitHub reads it for auto-close, and `arm-pr`, `closes-mismatch-check` and `work-gate` read it) and gains
  one pointer line naming the file. The pointer is for humans; nothing parses it.
- **`pr-open` writes the file and the body together** (it already runs the parser before anything is sent), and refuses a branch whose
  diff adds no file.
- **Paths under `.acceptance/` are outside every row's Region by construction**: the Region check in `pr-open`, the `ownedPaths` job and
  B4 (`file-overlap-rule`) must exempt the directory, or every PR would be refused for its own acceptance file. That is part of row 1.

**3. The migration: both readable, the file wins, and the body fallback ends on a count, not a date.**

| Row | Repository | Change | Blocked on |
|---|---|---|---|
| 1 (#4418) | agent-org | the reader: given the added file, run `acceptanceReport` on it; given none, fall back to the body and print `ACCEPTANCE-SOURCE: body (deprecated)`. Export it through agent-org's declared public interface (#4407), because a11ign may not reach `src/`. `pr-open` writes the file; the Region, `ownedPaths` and B4 exemptions. First step: read `verify-stamp.ts`, whose stamp holds the body's hash (`--draft-body`), and say what it binds once the commands are not in the body. | #4413, #4415 |
| 2 (#4420) | a11ign | `reusable-acceptance.yml` calls the reader row 1 released, pinned to that release. The live-body step narrows to `Closes` and the row labels (#4138) and keeps its token; the commands come from the checkout. | row 1's release |
| 3 (#4422) | a11ign | the PR template, `.agent-org/roles/*.md` and `CLAUDE.md` wording; a sweep of `.acceptance/` older than 14 days (below); the fallback removed when no open PR prints `ACCEPTANCE-SOURCE: body`. | row 2 |

The order is the agent-org parser first and the a11ign workflow after, per #4407's public-interface rule: a11ign pinning a release that
does not yet export the reader is the failure that rule was written against. Row numbers are in the appendix: #4418, #4420, #4422.

**4. The sweep, because 65 files a day is not free.** `.acceptance/` files are a record of what CI ran at the head that merged, and
nothing reads one after its PR closes, because CI reads only files a PR ADDS. So a file on `main` is inert, and the sweep deletes those
older than 14 days in one pull request on the existing cadence. The cost accepted is that `main` carries up to about 900 small files at
any time (65 a day, 14 days, measured rate, not forecast).

**5. What the body stops doing.** After row 3 the body carries prose, `Closes`, the pointer and whatever else a human wrote. A
prose-only edit changes no input of any check, and #4413's rule (nothing runs for it) becomes a statement about inputs rather than a
filter on the edit payload's `changes.body.from` (the field the row names; not read for this ADR).

## Consequences (including the ones the chairman will not like)

1. **The security posture does not improve on the thing it is easiest to claim it improves.** An author who can write a body can write the
   file: CI runs author-written commands from the PR's own tree today and will afterwards. What changes is **who can alter them after review**:
   the file is in the diff the reviewer reads and moves only with a new head SHA, so a review binds what runs. The adversarial-delimiter
   step is not needed for the commands, because a file in the checkout is not stdin to a shell step. It still protects `Closes`.
2. **A body edit is not fully inert.** It can still change the `Closes` line, which GitHub acts on, so a `Closes` edit still triggers the
   checks. That is correct, and the part of #4413 that decides whether an edit changed the `Closes` declaration is what stays. The class removed is the commands, not the whole body.
3. **A PR now has one more file, and 456 a week land.** A Region check that does not exempt the directory refuses every PR; a tree-wide
   scan (a guard walking `docs/`, the leak patterns, `tracked-prose-leak-guard`) now meets a new directory of shell commands. Row 1
   names the first, row 3 the second.
4. **A rebase or a force-push does not move the file, and an amended file is a new head.** Fixing a wrong Acceptance is now a push and a full
   code run (minutes), where it was a body edit (seconds). That is the price of the verdict binding to the head, stated here so nobody
   reads it as a regression.
5. **Reviewers read the commands in the diff.** `.agent-org/roles/reviewer.md` mentions the body's `Acceptance:` today (a grep match, not a reading of what it instructs); row 3
   repoints it.
6. **Concurrent PRs do not conflict**, because each adds a differently named file. That is the property a single shared `ACCEPTANCE.md`
   lacks.

## Alternatives rejected

- **Do nothing beyond #4413.** Rejected, though it is the cheapest and it fixes the instance. It leaves consequence 2 and 3 of the context:
  the commands that run are not the commands that were reviewed. If #4413 alone had made the reds stop, this ADR would say no; it is "yes" on
  the review gap, not only on the red.
- **One fixed file, `ACCEPTANCE.md`, that each PR rewrites.** Nothing accumulates, but at the measured 65 merges a day every open PR
  conflicts on one path with the PR that merged before it. Rejected on the measured rate.
- **The commands in the commit message.** A commit message is immutable per SHA, which is the property wanted. Rejected: a squash merge
  rewrites it, a PR of several commits has several, a multi-line shell command in a message is unreadable in the diff view, and no
  reviewer looks there. Considered seriously because it is the most platform-native of these.
- **The event payload's body.** Immutable per run. Rejected on #3286: the payload is the body as it was at the event, so a fix to a bad body
  is not read until a push, and the Dependabot rewrite races it. It would also leave `labeled` runs reading a different body than `opened`.
- **The commands in the row (the issue), not the PR.** Rejected: the issue body is exactly as editable, and a PR that closes no row, or
  two PRs for one row, has no single row to read.
- **A GitHub feature that locks a PR description.** Not found; GitHub offers conversation locking, which does not stop the author editing
  the body. NOT checked beyond recalling that GitHub offers conversation locking: I did not read the REST or GraphQL PR fields for
  this ADR, so a feature could exist, and the last falsifier below is the standing check.

## What would falsify this

1. **Row 1 finds `verify-stamp` cannot bind to the file**: if the stamp's body-hash binding has no honest equivalent for a file, the
   move forces a second protocol change and the order above is wrong. Say so on the row; do not work round it.
2. **After row 3, a prose-only body edit still turns a check red or makes one run**: then something other than `Closes` still reads the body,
   and the claim "the only body input is `Closes`" was false. Test: edit the body of a green PR, and read the run list for that head.
3. **More than one open PR per week hits the Region or `ownedPaths` refusal on its own `.acceptance/` file** after row 1 is released: the
   exemption is not complete, and the count of readers of the changed-file list was understated.
4. **`main` carries more than about 2,000 `.acceptance/` files, or the sweep PR itself needs a review a human must give**: the accumulation
   cost was understated and the file should live somewhere that does not land on `main` (a check-run annotation or a ref of its own).
5. **The fix-a-wrong-Acceptance loop (push, full code run) causes more than a handful of avoidable code runs a week** against today's body edit
   (count `synchronize` runs whose only diff is `.acceptance/`): consequence 4 was larger than "minutes".
6. **GitHub ships a way to freeze a PR description until review**: it is the platform feature, and this ADR is withdrawn in its favour.

## Appendix: the rows

Instance fix, not blocked on this ADR: **#4413** (prose-only edit triggers nothing that can fail; a cancelled sibling is never a
verdict). Build rows, each blocked on the one before by a native blocked-by edge, filed from this ADR: **#4418** (row 1, agent-org reader), **#4420** (row 2, workflow), and **#4422** (row 3, template, briefs, sweep).
The ADR index row in `docs/adr/README.md` is outside row #4415's Region and is added by row 3 (#4422).
