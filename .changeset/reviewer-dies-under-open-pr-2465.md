---
"@a11ign/agent-org": patch
---

**A reviewer instance that dies under a pull request that is still open is now cleared from the registry, and the next tick starts a fresh one (#2465).** `spawnableReviewer` refuses to start a second instance under a label the registry holds and herdr does not list, and `endFinishedReviewers` only removed a key once the pull request was no longer open, so #2453 and #2456 went about seven hours with no reviewer. The tick's teardown now counts the COMPLETE listings (both standing panes present) that lack a registered reviewer for an open pull request, and clears it on the third consecutive one; a listing missing `ceo` or `orchestrator` is partial and neither advances nor resets the count, so the refusal the partial list needs is unchanged. Each change is one line in `reviewer-absences`, beside `reviewer-endings`. `wake-reviewer-dead.test.ts` drives both listings and is mutation-checked in both directions.
