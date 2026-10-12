Switches the `ready-rows-untiered` wake class to a one-shot run by adding `"ready-rows-untiered": "run"` to `.agent-org/seats.json`, beside the existing `answer-owed`, `org-health`, `unclaimed-blocker-cleared` and `row-call-count-signal` keys. Parent a11ign#4505; agent-org#909 (class a11ign#928). The reader is agent-org's seat-mode check, which reads any key naming `run` as a one-shot run and any absent key as `seat`.

**The one-line revert:** delete the `"ready-rows-untiered"` line, or set it to `"seat"`. Either reads as `seat`, which is today's behaviour.

**Measured at HEAD (before this change):** `node -e "console.log(require('./.agent-org/seats.json')['ready-rows-untiered'])"` prints `undefined`, so the Acceptance fails before this change and passes after it.

**Mutation:** the same predicate run against `HEAD:.agent-org/seats.json` exits 1; against the edited file it exits 0. The file is data, so there is no detector to break in the other direction. The four existing keys are left as they were, so the one-key addition is the only change.

**Not done here (named):** nothing in this PR proves a live tick runs the class as a run. That is observable only after the tick runs on the host, and the resource ban keeps this session away from `fleet:*` and `lab:*`. Done-when item 2 is therefore for the gate to read on the next tick, not for this session to quote.

Acceptance: node -e "process.exit(require('./.agent-org/seats.json')['ready-rows-untiered']==='run'?0:1)"

Closes #5264
