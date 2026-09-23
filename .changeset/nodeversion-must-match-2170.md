---
"@a11ign/worker-fleet": minor
---

**`nodeVersion` is a fleet consistency GATE, not just a reported field (#2170).** Step 3 of `ceo`'s ruling
on #2063 — report it, pin provisioning so the fleet converges, and only then may it join `MUST_MATCH`. It
moves out of `REPORTED_ONLY` and into `MUST_MATCH`, so a fleet whose guests run different Node builds is
now `consistent: false` with a located `nodeVersion` mismatch, and `capture-fleet-guard` exits 3 rather
than writing two runtimes into one corpus. Joining the gating channel also brings #2047's second refusal:
a guest that stops reporting the field is a coverage gap at ANY count, so 1 of 2 refuses as surely as 0 of
2.

The field is in exactly one list: the two lists are the gate and the not-gate, and a field in both would
be refused and exempted at once. `REPORTED_ONLY` keeps `displayAdapter`, which cannot graduate the same
way — its values differ by HARDWARE (`Intel(R) UHD Graphics 630` on nine guests, `Intel(R) HD Graphics
630` on the tenth), so no provisioning run converges it and a gate would refuse that guest for ever. Its
`why` said "no deployed worker reports it yet"; 10 of 10 report it as of 2026-09-23T18:02Z, so that
sentence is replaced by what is actually true.

The precondition this waited on, posted by `orchestrator` on #2170: all ten guests reporting one
`nodeVersion` (`v24.20.0`), read off their own `/health` rather than off `provisionRevision`, against the
5/5 split measured at 06:55Z the same morning. The reading is stricter than "the pin was installed" and
that is the point — at 17:57Z, after a clean provision, three of five upgraded guests still reported
`v24.19.0`, because `/health` reports the runtime of the RUNNING worker process and only the deploy's
restart moved them. The value this field compares is written into every corpus record by that running
process.
