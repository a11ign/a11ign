Switches the `row-off-board` wake class to a one-shot run by adding `"row-off-board": "run"` to `.agent-org/seats.json`, beside the existing `answer-owed`, `org-health`, `unclaimed-blocker-cleared`, `row-call-count-signal`, `ready-rows-untiered` and `ready-queue-empty` keys. Parent a11ign#4505; agent-org#911 (class a11ign#928). The reader is agent-org's seat-mode check, which reads any key naming `run` as a one-shot run and any absent key as `seat`.

**The one-line revert:** delete the `"row-off-board"` line, or set it to `"seat"`. Either reads as `seat`, which is today's behaviour.

**Measured at HEAD (before this change):** `node -e "console.log(require('./.agent-org/seats.json')['row-off-board'])"` prints `undefined`, and the Acceptance exits 1; in the edited worktree the same Acceptance exits 0. The file is data, so there is no detector to break in the other direction. The six existing keys are left as they were, so the one-key addition is the only change.

**Not done here (named):** nothing in this PR proves a live tick runs the class as a run. That is observable only after the tick runs on the host, and the resource ban keeps this session away from `fleet:*` and `lab:*`. Done-when item 2 is therefore for the gate to read on the next tick, not for this session to quote.

Acceptance: node -e "process.exit(require('./.agent-org/seats.json')['row-off-board']==='run'?0:1)"

Closes #5266
