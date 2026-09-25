---
"@a11ign/agent-org": patch
---

**`pr-review-verdict` derives `reviewer-<n>` when the pane holds no `A11Y_REVIEWER_SESSION` (#2528, the #2498 residual).** A pane herdr restores
is not started by the tick, so it never receives the variable: `herdr.service` restarted at 2026-09-25T12:01:57Z and `reviewer-2485`'s
`codex resume` began at 12:01:58Z, and its verdicts posted UNATTRIBUTED. The door is where every path converges, so the name is closed there
and the restored reviewer is left running (ruled against ending an instance that predates `herdr.service`: it costs a verdict to save a label).

With the variable unset the door reads the directory it runs in and derives `reviewer-<n>` only when that directory, or one above it, is
`reviews/reviewer-<n>` for THE PULL REQUEST BEING REVIEWED -- never from the number alone, which any session can be handed. It says on stderr
that it derived the name and from where, and the existing read-back still has to prove the newest review's body equals the one just posted
before any status is written. Where nothing can be derived the #2127 behaviour is unchanged: the review posts, UNATTRIBUTED and loudly. A
variable the tick did set still wins. The pins are in `review-attribution.test.ts`; the host's `bin/` copy is an install of the door and needs
`install-reviewer-bin.sh` to pick this up.
