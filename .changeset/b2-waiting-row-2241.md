---
"@a11ign/agent-org": patch
---

**B2 no longer refuses a session whose only held row the gate has already shelved (#2241).** The gate
(`waitingOn`) and the claim read the same row and disagreed: `#1926` declared
`Not-before: 2026-09-24T01:30:00Z` for a fourteen-hour machine run, the gate said nothing was owed until
then, and B2 said its holder owed a commit — so the holder was refused twice on 2026-09-23 and two
offline rows (#2155, #2170) sat `ready` with no engineer able to take them.

A held row that `waitingOn` reports as waiting — a future `Not-before:`, an open `blockedBy`, an
`answer:<session>` label — no longer counts as in build. The discriminator is `waitingOn` itself, called
rather than restated, so B2's other teeth are untouched: a session's own `CHANGES_REQUESTED` produces no
waiting condition and still refuses, even while a held row is waiting. A `Not-before:` that has passed
refuses again, and a row whose wait cannot be read — a malformed timestamp, a lookup that did not carry
`labels` or `blockedBy` — fails CLOSED and refuses as before. `inBuildReason` takes an injectable clock
for the same reason `waitingOn` does. The refusal, when it still fires, now names this way out and says
what it read on the row. `lookupRowShape` asks for `labels` and `blockedBy` on the `issue view` it
already made, so no held row costs a further round trip.
