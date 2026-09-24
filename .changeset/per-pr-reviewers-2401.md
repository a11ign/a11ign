---
"@a11ign/agent-org": patch
---

**Reviewers are instanced per pull request: the owner of PR `n` is `reviewer-<n>`, and the odd/even split is
retired (#2401, `ceo`'s #1950 ruling c and the chairman's three rulings of 2026-09-24).** `parityOwner` returns
`reviewer-<n>` for every `n` (its name is kept, since `parityOfReview` and `parityViolationsOnCommit` keep their
meaning and the row's Open-check calls it), the gate's two reviewer orders address it, and the gate's prompt text
no longer says "odd number / even number". A status naming the retired `reviewer` or `reviewer-2` on a commit
stamped before `PER_PR_REVIEWERS_FROM` reads as history (`PARITY.retired`), never as a violation. `reviewer-2` is in
`sessions.json`'s `retired`; neither name is added to `live`.

`wake.mjs` starts a codex instance in a workspace labelled `reviewer-<n>` (`A11Y_REVIEWER_SESSION=reviewer-<n>`,
the reviewer's own `GH_CONFIG_DIR`) when an order for a reviewer cause finds none, reuses it, cleared, for the next
head, and `work-tick` ends it when the pull request merges or closes. **There is NO limit on the count** (the chairman's ruling
of 2026-09-24: the pool follows the pull requests waiting); a start refuses only for a named cause. `reviewer-<n>`
receives PR n's orders and no other's. Its pane opens IN a per-PR checkout (`~/reviews/reviewer-<n>`, a linked
worktree) at PR n's head that the tick prepares before the order is typed, re-points on every head-changing push, and
removes when the instance ends. The engineer spawn path --
`spawnableRole`, `SPAWN_CAUSES`, `registerSpawn`, `endFinishedSpares` and the `spare-cycles` ledger -- is unchanged, and
the two standing panes are left running; closing them is `ceo`'s, after the first per-PR verdict is on a merged PR.

**The detector ruling 2 asked for:** the new `reviewer-auth-failed` cause, addressed to `ceo`, fires when a reviewer
instance's pane shows codex's own auth-failure text (read from the installed codex binary, not invented) or the
credential's `last_refresh` moved after the instance started while it still owes a verdict past 30 minutes. Every
`last_refresh` change is appended to `reviewer-refreshes` (beside the wake ledger) with the live-instance count, so the first
real refresh is a recorded reading. What could not be measured without forcing a refresh is in `docs/known-gaps.md` §48.
