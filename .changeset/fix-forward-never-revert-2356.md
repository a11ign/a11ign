---
"@a11ign/agent-org": minor
---

**A red `main` now wakes a fixer, and nothing reverts a merge automatically (#2356).** The chairman ruled on
2026-09-24 that the org always fixes forward, with no fallback after any window. `trunk.yml`'s revert job, and
`trunk-revert.mjs` with it, are deleted; the parent re-check stays as `trunkRecheck`, which now only READS and
records whether a red is the merge's own, inherited or unknown.

The work gate's new `trunk-red` cause reads `main`'s newest verdict run and emits one order, ahead of every
other cause, naming the failing test, the run and the merge and saying to fix forward. An own or unknown failure
goes to the session that merged it, and `wake.mjs` now honours an order's `fallback`, so a session that is gone
or busy hands it to any idle engineer; an inherited failure goes to the pool directly. Other pull requests keep
merging while the fix is in flight, and the fix goes first by its order rather than by freezing the queue.
