---
"@a11ign/worker-fleet": minor
"@a11ign/nvda-worker": minor
---

**A fleet field can now be COMPARED AND REPORTED without gating a capture, and Node is pinned in git (#2063).**
`fleetConsistency` gains a third channel beside `MUST_MATCH`: `REPORTED_ONLY` fields are compared exactly
as the gating ones are and named on the verdict with each guest's value, but they enter neither
`mismatches` nor `fields.coverage` — the only two things `capture-fleet-guard` reads — so a fleet differing
on one is `consistent: true` and no run is refused. The return value gains `reportedOnly`: one
`{field, why, values, reported, asked, state}` per field that has something to say, where `drifted` is the
guests giving more than one value and `unreported` is some or all of them giving none; a field every guest
agrees on yields nothing. `describeReportedOnly` renders them. `fleet:status`'s headline over such a fleet
no longer reads `these workers are interchangeable for capture` — that sentence is replaced rather than
appended to, and the state is untouched, because a drift that cannot refuse a capture through the guard
must not refuse it through the operator either.

`nodeVersion` and `displayAdapter` are the first two, by `ceo`'s ruling of 2026-09-23: report it, pin
provisioning so the fleet converges, and only then may it gate. The fleet was measured that morning running
v24.19.0 on workers 2-6 and v24.20.0 on 7-11 with every other reported field identical, and
`fleet:status` called it interchangeable. The worker's `/health` now also reports `displayAdapter` — the
adapter NAME, which is what decides whether a pinned display mode can be held at all, and a different field
from the driver version #1567 ruled on. It reads `unknown` on every guest until this worker is deployed,
which is visible in the report and refuses nothing.
