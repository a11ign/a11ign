---
"@a11ign/agent-org": patch
---

**A merged PR that closed no row now reports on the row its branch was built for (#2036).** The shape:
a PR declares `Closes: none`, merges green, and leaves its row `in-progress` with nothing anywhere
noticing. Every component behaves as designed — the declaration is well-formed so `gate` passes it,
GitHub resolves no issue so the declared-vs-resolved check sees both sides agree, and
`applyClosurePlan` correctly closes nothing. Measured 2026-09-22 on #2011, whose row #2000 sat open with
its work on `main` until a session closed it by hand fifteen minutes later; nothing would have closed it,
because no cause fires for a row whose PR has already merged.

`close-rows-for-merged-pr.mjs`, which already runs on every merge and already holds the PR, now reads
`headRefName` on the path where nothing was closed: when the branch ends in `-<N>` and row `#N` is OPEN
and `in-progress`, it posts one comment naming the PR, its merge sha and its declaration. One row lookup,
one comment, no label, no close, no refusal. It is a REPORT because `Closes: none` on a row-numbered
branch is legitimate and common — 18 of the last 120 such merges did it and most were correct — so a
check that refused the shape would refuse the normal case.
