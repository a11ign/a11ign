## What

`.agent-org/roles/reviewer.md` gains three checks that the reviewer ran on no pull request before. Steps 8 to 10 of the per-PR list carry them, each with its one clause of why and the pull requests the row set names:

- **Step 8:** the reviewer checks each Done-when item and each Region file item by item against the diff, and requests changes for any item missing or turned into a notice, naming it (rows narrowed: agent-org#1211, #1057, #1243, #1138, #1060).
- **Step 9:** the reviewer flags a new function that duplicates an existing exported helper, after a `git grep` for its name and body shape (copied helpers: agent-org#1138, #1123, #1238, #1121, #1184, #1057).
- **Step 10:** a test that only regex-matches source text, or stubs the changed line, does not cover that change, and the reviewer names the line left uncovered (agent-org#1243, #1238, #1116, #1144).

This is the brief only. The weekly blind read in the row's Change 4 is the ceo's follow-up and is not made here.

platform: n/a (prose in an existing brief)

Acceptance:
```bash
bash -c 'grep -q "item by item" .agent-org/roles/reviewer.md && grep -q "Flag a new function that duplicates" .agent-org/roles/reviewer.md && grep -q "regex-matches source text" .agent-org/roles/reviewer.md'
```
