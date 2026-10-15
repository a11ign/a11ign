Rewrites the two text fields of the `stop-hook-bound` class in `.agent-org/failure-classes.json`. The guard now says the bound makes the `blocked` declaration (agent-org#1488, merged as `326bdbf7`) and that the ledger line counts bound stops that were routed. The guardNote drops the sentence that the stop is not prevented until #1488 merges, names the gap that remains (a lane-owner row spawned onto an engineer seat that cannot reach what it needs, handed to the orchestrator one-shot lane, agent-org#1527), and keeps the 2026-10-15 measured counts, dated as a reading before #1488 merged. Nothing else in the file changes.

**Measured at this head:** the Acceptance command below prints `true`; `git diff --stat` shows two changed lines in the one file; the project's parser (`parseFailureClasses`) reads the edited index as 30 classes.

Acceptance: jq -e '.classes[] | select(.id=="stop-hook-bound") | (.guard + .guardNote) | (test("does not make the `blocked` declaration") or test("ready; Region")) | not' .agent-org/failure-classes.json

Closes a11ign/agent-org#1528
