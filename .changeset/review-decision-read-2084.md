---
"@a11ign/agent-org": patch
---

**The org's QUEUE READ now reads `reviewDecision`, the field GitHub merges on (#2084).** Measured at
`468a74f1b`, `git grep -l reviewDecision -- '*.mjs'` returns exactly one file and it is not a queue read:
`row-claim/own-pr-health-rule.mjs` (#2126) uses it to answer *may this session claim another row*, which
emits no order, wakes nobody, fires only on `CHANGES_REQUESTED`, and covers only the session holding the
row. Nothing that reads the QUEUE touched it — not `work-gate.mjs`, not `queue-table.mjs`, not
`merge-guard.mjs`, not `auto-arm-sweep.mjs` — while `main`'s review requirement, live since #2022, decides
every merge here from it. The consequence was a state nothing could see: #2049 sat green, armed and
unmergeable for over seven hours on a `CHANGES_REQUESTED` posted at a head the author had already fixed,
and every org read returned green-and-armed.

`readPrs` now asks for `reviewDecision` on the `gh pr list` call it already makes — another field, never
another call, which is why this closes here rather than in `queue-table.mjs`, whose own header records
dropping `mergeStateStatus` precisely because a GraphQL-only field meant a second, refusable request. The
new `pr-review-blocked` cause names every pull request that is not a draft, not held and green on every
required check, and that GitHub is holding anyway, routed to `product-manager` as one set-keyed order in
`pr-green-unarmed`'s shape. `reviewStateOf` distinguishes six states rather than two: an EMPTY decision
is the #1968 state and not an approval, an ABSENT field is a fact about the gate rather than about the
pull request, and a value this gate cannot name BLOCKS — the `!== "never"` discipline
`branch-protection.test.ts` already carries, because the value that slips through an allowlist is the one
nobody has seen.

It also closes a second hole the row did not predict. `draft-awaiting-verdict` covers DRAFTS only, and
docs-and-tests pull requests open ready, so a pull request that opens ready never enters the reviewer
lane at all: #2198, opened ready at 17:39:37Z with **zero reviews**, `BLOCKED`, `REVIEW_REQUIRED` and
armed, produced no order of any kind from `decide` run against the live payload.

`branch-protection.test.ts` now reads review staleness back from BOTH surfaces — classic protection's
`dismiss_stale_reviews` and the `merge-queue-main` ruleset's `dismiss_stale_reviews_on_push`, which are
independent fields that agree today — and refuses a DISAGREEMENT, keyed on the decision recorded in
`.claude/rules/agent-practices.md` rather than on a literal. **That ruling declines #2084's done-when 1**:
dismissal is documented as covering APPROVING reviews only, so it would not have cleared the refusal
#2049 was stuck on, and *Update branch* is a documented dismissal trigger that `update-branch-sweep.mjs`
runs after every merge — measured twice, 15 of the 40 most recent merges had another pull request land
inside their approval-to-merge window, so turning it on would have stalled each of them for a re-review
nothing would have asked for. No branch configuration is changed by this pull request.
