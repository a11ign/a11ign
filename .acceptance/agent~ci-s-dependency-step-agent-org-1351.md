The `changeset` job's `dependency` step now hands `scripts/dependency-changeset.ts check` the pull request's reviews (`--reviews=<file>`, written from `pulls/{n}/reviews`) and the head sha they must name (`--head=<sha>`), with `GH_TOKEN`, so the settled-refusal branch of agent-org#1339 (merged as a11ign#5439) can fire in CI (agent-org#1351, parent a11ign#5414).

- **`pull_request`:** the head is `github.event.pull_request.head.sha`; the reviews are read live.
- **`merge_group`:** the number is parsed from `github.event.merge_group.head_ref` with an anchored match (ceo's ruling on agent-org#1359, which supersedes the merge-commit first line this row's body names), and the pull request's own `.head.sha` and reviews are read live. No match is no number, and `check` runs exactly as before.
- **A read that cannot be made** (a 4xx, or five 5xx) leaves `check` without the two flags and prints a `::warning::`: today's refusal, never an empty review list. A 5xx or a transport error is read again, with the pattern `noRelease` already uses.

Acceptance: grep -n -e '--reviews' .github/workflows/ci.yml && grep -n -e '--head' .github/workflows/ci.yml

Mutation: measured against the step's shell, run out of the parsed `ci.yml` behind a fake `gh` and `node` (the guard additions are on `agent/ci-dependency-step-guard-tests-agent-org-1351`, not in this diff: the row's Region is `ci.yml` alone). Each break failed its own tests and the file was restored from the committed blob with `git diff --quiet`: flags never passed (4 of 17 failed); a failed read swallowed so the list reads `[]` (1); a 4xx retried (2); the retry pattern drifted in this copy (2); the queue entry's head never read (2); flags passed even when the read failed (1); the ref match unanchored at the start (1) and at the end (1); the number never taken from the ref (3); the merge group's head used for the pull request's (3).

Closes a11ign/agent-org#1351
