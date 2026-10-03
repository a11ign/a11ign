---
"@a11ign/lab": patch
---

**A pull request the merge queue EJECTED for a red queue run is no longer reported as unarmed (#3019).** `a11ign/agent-org#16` and `#17` were green, approved and `mergeQueueEntry` null, and `pr-green-unarmed` told `product-manager` to arm them by hand; `auto-arm` had armed both, and the queue had removed each with `reason: "failed_checks"` because the `merge_group` run of `gate` was red, so the remedy would have added a third red run. `pr-armed-state.mjs` (where `armed` is decided) now reads the timeline: when the newest queue event is a `failed_checks` removal and nothing was pushed to the head since, the gate stamps the pull request and `stallReasonOf` answers the new reason `ejected` (eight answers now, not seven). Its order goes to the PR's owner (`ownerOfPr`, under `pr-checks-failing`), names the failed `merge_group` run and the failing subtests read from its log, and says in words that re-arming without a push fails the same way. A PR with no queue history, a removal for any other reason, or a removal followed by a push is classified as before. A refused read sends no order: a candidate whose own timeline read fails is neither called unarmed nor ejected.

**Cost:** one GraphQL call per unarmed candidate (usually none), plus one REST call and one `run view --log-failed` for a PR the queue ejected. A healthy tick pays nothing.
