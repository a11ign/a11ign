---
"@a11ign/agent-org": patch
---

**`Not-before:` can now name an HOUR, and the comparison moved to parsed time because widening the regex
alone would have shelved the row 18h late (#2113).**

The field could not express a wait shorter than a day, so a row whose last done-when turns true at a named
hour read as startable from midnight. #2002's last done-when was a read of a `workflow_dispatch` run the
host timer fires at 06:10:00Z; the row carried `Not-before: 2026-09-23`, and from 00:20:00Z `waitingOn`
reported it as waiting on **nothing** for the ~5h50m in between. The harm on #2002 itself was zero — it
was `in-progress` with an owner who took the read at 07:14:00Z — and the exposure is an unclaimed `ready`
row with a sub-day wait being offered to a session that cannot finish it.

**The one-regex widening was measurably the wrong fix, in the other direction.** `waitingOn` compared
`date > today` where `today` is always ten characters, and a string is greater than its own prefix:
`"2026-09-23T06:10:00Z" > "2026-09-23"` is `true`, so a widened regex alone would have shelved the row for
all of 2026-09-23 and cleared it at 2026-09-24T00:00Z. Today's defect reads the row startable ~6h early;
that one reads it shelved ~18h late. `waiting-condition.test.ts` pins the case that fails on it.

So `notBeforeDate` accepts an optional `THH:MM:SSZ` suffix and `waitingOn` compares **parsed** time, over
two instants chosen by the field's own granularity: a date-only value declares a CALENDAR DAY and is
measured against `today` at midnight UTC — the old lexical rule exactly, pinned against it across a grid
of dates, todays and clocks — while a timestamped value declares an INSTANT and is measured against the
caller's clock. `waitingOn` and `partitionUnclaimed` take that clock the way `partitionFleetBatch` already
did, and `fleetWaitingOn` hands its own down, so a fleet-gated row's two conditions are read against one
clock rather than two.

**The calendar round-trip arrived WITH the parsed comparison rather than beside it.** A lexical comparison
cannot roll a date over because it never parses one; `Date` silently repairs `2026-02-31` into 2026-03-03,
so `Not-before:` now borrows the refusal `Fleet-hold-until:` has held since #1841, shared as one
`roundTripsUtc` rather than copied. Seconds are required when a time is given, and every malformed value
still fails OPEN — a typo leaves the row visible for a human to find.

`Fleet-hold-until:`'s doc comment now states **both** meanings the field already carries: the documented
one, refusing `fleet:deploy`/`fleet:provision`, and the one five live rows use it for — "my capture
sequence owns the workers until T" — which no command reads. `agent-practices.md` carries the sub-day form
and that same distinction. No fifth field is minted for either.
