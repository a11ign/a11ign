---
"@a11ign/worker-fleet": minor
---

**`fleetConsistency` now reports how many guests reported each field, not only whether any did (#2019).**
`fields.compared`/`fields.unchecked` is a partition on "did anybody report it", so a `MUST_MATCH` field one
guest of ten reported was indistinguishable from one all ten agreed on — and a consumer reading that
partition called the fleet interchangeable on the strength of a single reading. The return value gains
`fields.coverage`: one `{field, reported, asked}` per field any guest was asked about. `asked` counts the
guests that carried the BLOCK, so a caller that never collects `policy` does not see a permanent gap, and
`reported` is counted on the guest rather than read off the values map, whose keys collapse when a caller
omits `worker`. `compared`/`unchecked` are unchanged: a field at 0 sends a reader to the field, a field at
k sends them to the boxes, and both are still the lists to act on.
