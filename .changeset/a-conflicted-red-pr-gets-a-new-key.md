---
"@a11ign/agent-org": patch
"@a11ign/lab": patch
---

**A red pull request that turns CONFLICTED at the same head is now a new `pr-checks-failing` cause (#3005).** `stallReasonOf` orders a red-and-conflicted PR under `pr-checks-failing` alone, keyed on the head, and a conflicting branch gets no `pull_request` run, so the head and the red never move while the real work changes from "fix the check" to "rebase". #2990 sat 63 minutes at one key, delivered six times, its owner never told. `failingChecksOrder` now appends `/conflicting` to the `causeKey` when `conflictStateOf(pr)` is `CONFLICTING` (red to red-and-conflicted restarts the count; a conflict-free red PR keeps its key byte for byte) and the prompt names the conflict before the (a)/(b)/(c) triage: merge or rebase `main` first, because the red on the head is stale.
