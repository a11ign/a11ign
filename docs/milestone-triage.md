# Milestone "Road to version one": every open row, sorted by the on-path test

**A reading at a moment, not a standing fact.** Read 2026-09-25 at `origin/main` `60b9c5218`, by
`worker-judge`, from each row's BODY and labels (`gh issue view`), not from titles. The milestone changes
by the hour; re-derive before quoting (the command is at the end). It is the record of the sort
`ceo` asked for in #2262 (ruling d, comment 5810424410) and `product-manager` filed as #2273.

**The test, `ceo`'s words: a row is on the path iff it stops an outsider running the tool on their product
or trusting the result.**

It cuts both ways. A row that meets it belongs on the path whichever milestone holds it, and one that does
not belongs off it however much the org needs it. **OFF does not mean unimportant**: the org's own gates
are real work, and the ready order, not the milestone, says how soon (`docs/row-filing.md`, "`out-of-release`
answers one question, and importance is not it").

## The verdicts

Three verdict words, each matched by the two `grep` commands in #2273's Acceptance:

- **ON**: meets the test. Stays.
- **OFF**: fails the test and is MOVED by the pair the board defines: the `out-of-release` label with the
  `Out of release` milestone, both, and no other spelling.
- **HELD (OFF)**: fails the test, and is **NOT moved**, because it is in progress under a claimant. A row
  is not moved out from under its claimant without the claim being released first. Each names its claimant
  and when it can move.

| row | verdict | why, in the test's terms |
|---|---|---|
| #2262 | ON | B1 itself: the bar. The chairman's call to close; **unchanged here** |
| #2268 | ON | a REQUIRED `task` input stops an outsider running the Action at all, and an unset one would ship an empty task |
| #2275 | ON | records that MFA, SSO and CAPTCHA are out of a run's reach, with the test-account route. An outsider whose product sits behind one must be told before they invest, which is what stops a run being trusted for a page it never reached. **The one judgement call on the open rows**: it stops nobody running anything, and it is on the path ceo named (ruling c, clause 6). It is blocked on the auth build by an edge and lands with it |
| #2340 | ON | the public claim quotes protocol-18 counts; the number an outsider is shown is the "trusting the result" half of the test |
| #2359 | ON | a run cannot log in to the product it examines; the authenticated capture is what lets an outsider point the tool at a page behind a login |
| #2399 | ON | the leak check and the authenticated measurement ADR 0038 leaves unmeasured; the credential-echo question is what lets an outsider trust a run behind a login. `lane:orchestrator` |
| #57 | OFF | the pnpm move: isolation between the org's own worktrees. No outsider runs or trusts anything differently. Its body schedules it AFTER first publish |
| #1756 | OFF | CODEOWNERS enforcement on the pipeline lane: the org's own merge gate. `lane:ceo`, and the lane protects the DECISION (whether to turn enforcement on); moving the row decides nothing about it |
| #1889 | OFF | a budget ruling on two near-miss false negatives at the candidate model's cut: a gate on the model the org trains |
| #1959 | OFF | nothing wakes `ceo` for a pipeline PR awaiting code-owner approval: org routing |
| #2132 | OFF | `prompt:session` cannot tell a decision from a report: the org's session tool |
| #2188 | HELD (OFF) | 2.4.6 acceptance cases: a subtype outside the four that assert (`CLAUDE.md`), so its finding is a referral, and one failing pair is a fixture that does not vary the criterion. In progress under `session:worker-4`; moves when that claim closes or is released |
| #2211 | HELD (OFF) | wording in the `fleet:status` output. In progress under `session:worker-judge` (the author of this document, PR #2437); moves when that PR merges and the row closes, so it never needs to move |
| #2258 | HELD (OFF) | the retrained candidate fails held-out acceptance on 4.1.3. A candidate that has not shipped reaches no outsider (the first sort's reading, that the shipped model is the previous one, was not re-derived here). In progress under `session:orchestrator`, `fleet-gated`. **Moves LAST**, after #2430 merges and the retrain reading is posted on #2258, or when `product-manager` asks `orchestrator` there to release it: it is the only open `fleet-gated` row, and moving it empties the fleet batch (below) |
| #2259 | HELD (OFF) | a held-out count that could overturn a cut ruling on the scratch model. In progress under `session:worker-9` |
| #2273 | HELD (OFF) | this row. Sorting the milestone is the org's own process, and by the test it is OFF: it closes when its PR merges, so it is not moved |
| #2358 | HELD (OFF) | `A11IGN_BOT_TOKEN` is the chairman's personal token and CI merges as `DanBeckDev`: the org's own CI identity. In progress under `session:worker-15`, filed `needs:chairman` |
| #2391 | HELD (OFF) | the fix PR for a red `main` jumps the merge queue: the org's own pipeline. In progress under `session:worker-17` |

**Not sorted, by ruling:**

- **#69** (split the monorepo by layer): blocked on B1 by an edge and **not touched here**, by `ceo`'s
  ruling. Unchanged.
- **#20** (the daily board report): labelled `meta`, which the board excludes from every count by rule.

**Tally at this reading:** 20 open rows = 18 sorted + 2 not sorted. Of the 18: 6 ON, 5 OFF (moved), 7 HELD
(OFF, not moved). So the milestone still holds 15 rows after the move: the 6 ON, the 7 HELD, and the 2 not
sorted.

## A `fleet-gated` row filed OFF-path is not offered to `orchestrator`; put it on the milestone or say so on the row

Both feeders that hand `orchestrator` its fleet batch scope by MILESTONE, not by label: `FLEET_MILESTONE`
in `packages/agent-org/src/work-gate.mjs` (used by `partitionFleetBatch`) and `MILESTONE` in
`packages/agent-org/src/fleet-gated-nightly.mjs`. A `fleet-gated` row on `Out of release` is invisible to
both. That is how #2212 hid for hours on 2026-09-24 until it was moved back in by hand. Scoping the feeders
by the `fleet-gated` label instead is #2443 and is not built here.

## What became of the rows the first sort listed

The first sort (the body of #2273 as filed, read 2026-09-24 at `1a644b835`) listed rows that are no longer
open. They take no verdict row because they are not open. **Each was read `CLOSED COMPLETED`, not moved to
another milestone**, so none of them is in `Out of release`:

- #2201, #2234, #2221, #2197, #2051, #2210 (OFF in the first sort) and #2269, #2271, #2272 (ON in it):
  closed 2026-09-24. #31 and #149 closed the same morning, before the first sort's table.
- **#2212**: closed 2026-09-24T14:30Z. Its measurement moved the published counts (`0` asserted wrongly /
  `422` referred / `41` conformant at protocol 18 became `0 / 395 / 40` at protocol 21); publishing the
  restatement is #2340. **This document does not say the conformal threshold is insensitive to the protocol
  bumps, and the evidence cannot show it.** The floor `0.6557` was the same INPUT to both readings and
  nothing re-fitted it, so the counts moved by page (−15 membership, −12 within) and not by cause
  (`ceo`, #2212).
- **#2215**: closed 2026-09-24T17:05Z.

## Not examined

The rows carrying `out-of-release` were not read. **Measured at this reading: 34 open rows carry the label
and 33 open rows sit in the `Out of release` milestone** (`gh issue list --label out-of-release --state open
--limit 300` and `--milestone "Out of release"`), so the two facts the board pins equal already disagreed by
one, before any row was moved here. The one is #2223, which carries the label and not the milestone (read
again after the five moves: 38 and 37, the same one). It is not this row's to change. The test cuts BOTH ways: a row there that meets it belongs ON the path.
This sort covers the rows of the milestone it was asked about and nothing else.

## Re-deriving it

```bash
gh issue list --milestone "Road to version one" --state open --limit 200 --json number --jq length
```

That count, less the two rows named "not sorted", is what `grep -c '^| #[0-9]* | ' docs/milestone-triage.md`
prints while this document is current. A row filed into the milestone after the date above has no verdict
here until somebody adds it. The verdict is decided by the test in the second paragraph, read against the
body of the row: `ceo`'s own read was of titles only, and the first sort here was already from bodies.
