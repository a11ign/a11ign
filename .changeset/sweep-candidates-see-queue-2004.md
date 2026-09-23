---
"@a11ign/agent-org": patch
---

**`auto-arm-sweep` no longer reports `FAILED TO ARM` on a pull request that is correctly armed and sitting in the merge queue.**

**Why.** `armedFromApi` knows three armed states — merged, auto-merge pending, and **in the merge queue** — and its own comment says the third is GraphQL-only: `mergeQueueEntry` exists on neither `repos/:o/:r/pulls/:n` nor `gh pr view --json`. The candidate read was exactly that read, a `gh pr list --json number,isDraft,autoMergeRequest` with a second armedness predicate inside a `--jq` shell argument. So a queued PR was swept as unarmed on every run, the arm was refused, and `sweep` exited 1 on a PR that had done exactly what it was supposed to — reddening the head whose event triggered the run. Measured 2026-09-22 against #1999, both reads in the same minute: GraphQL reported `mergeQueueEntry: {position: 1, state: "AWAITING_CHECKS"}` while the candidate read answered `1999`. Deterministic rather than a race — it repeated on every sweep for as long as the PR sat in the queue (#2004).

**What changes.**
- The candidate read is now the GraphQL `pullRequests(states: OPEN, baseRefName: "main")` query, fetching every field `armedFromApi` decides on, and `unarmedCandidates` filters it **with `armedFromApi` itself**. One predicate, not a second copy of it in a string.
- The arm call's `catch` now reads the state for **armed meanwhile** as well as merged meanwhile, and reports `SKIPPED -- armed meanwhile` rather than `FAILED TO ARM`. This closes the genuine race the candidate read cannot: a PR that arms between the list and the arm is queued, not merged, so `mergedMeanwhile` answered `false` for it.

**What does not.** The exit codes, the arming decision (`sweepDecision`), the hold rules, `confirmArmed`'s post-arm confirmation and its bound, and the `CANNOT_ASK` behaviour `#1970` ruled into `auto-arm.yml` are all unchanged. A genuinely failed arm still reports `FAILED TO ARM` and still exits 1.
