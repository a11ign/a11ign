---
"@a11ign/agent-org": patch
---

**The work gate now sees a Ready row whose work is already pushed, and stops offering it as a fresh
start (#2031).** #2014 bought the interception at CLAIM time, and it says nothing to anyone who never
attempts a claim — the gate, which is what actually offers rows to the org, was one of those readers.
Measured 2026-09-22 on #2000: `agent/worktree-prune-unit-2000` was pushed at 21:02:36Z; the row read
`ready`, no `session:`, no `in-progress`, until 21:22Z; `gh pr list --head <branch> --state all`
returned `[]` for that whole window. The gate offered it as `ready-row-unclaimed` throughout, because
`ready` with no `session:` label was the entire question it asked, and a second session was routed into
the same three Region paths at 21:06Z — stopped by a worktree-PATH collision, which is not a guard aimed
at this.

The gate reads `git ls-remote --heads origin` once per tick and emits a new cause,
`row-branch-unshipped`, naming the branch and its head sha; the row is shelved out of
`ready-row-unclaimed` while the condition holds, with its reason on the tick log's `SHELVED row #N:`
line. **The detection spends NO API pool, and that is the design rather than a saving:** opening the
pull request is the act that makes a row look claimed and that act spends GraphQL — #1996's PR was
never opened because the shared 5,000-point pool was exhausted until 21:20:11Z — so the board goes
stale precisely when the pool is gone, and a detector that spent the pool would be blind in the same
outage that produces the defect. `GIT_READS` counts the free read rather than leaving it out because it
is free, and the test pins the BINARY the seam spawns (`git`, never `gh`) rather than trusting the
comment.

**It names the branch and concludes nothing else.** A branch on `origin` whose name ends in a row's
number means the work EXISTS; it cannot tell finished work from abandoned work, and the trailing number
can be a coincidence. So the order offers three exits — open the pull request, delete the branch, rename
it — and chooses none, routed to the row's lane owner, else `product-manager`, who is this org's first
reader for rows and the queue. It is a JUDGMENT cause keyed on the sha: "abandoned, leave it" is an
answer that changes no state, and an ACTION cause's twenty-minute expiry would re-ask it until the STUCK
cap stopped it.

The trailing-`-<n>` rule itself moved to `row-claim/row-branch-rule.mjs` and is now imported by both
readers rather than copied — #2031's own filing named that copy as the reason it was blocked on #2014.
`row-claim.mjs`'s behaviour is unchanged; the two callers keep their own failure policies, which differ
deliberately: a claim about to write THROWS on a listing it could not get, while a tick degrades to
"not asked" and goes on offering rows exactly as it did before.
