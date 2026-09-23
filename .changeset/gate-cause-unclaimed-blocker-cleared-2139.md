---
"@a11ign/agent-org": patch
---

**The work gate now tells `product-manager` when an UNCLAIMED row's last declared blocker closes
(#2139).** #2027 built `blocker-cleared` for the HOLDER of a claimed row and left the unclaimed pool
with nothing: `blockerClearedOrders` is scoped by `labelsOf(row).includes(CLAIM_LABEL)`, and that one
condition was the whole gap. A `lane:any` backlog row that has just become startable was reachable by
no cause at all — `lane-backlog-unpromoted` addresses only a lane OWNER, and `ready-queue-empty` fires
only when the unlaned Ready pool is EMPTY.

Measured 2026-09-23 on the live tracker: a sweep for open rows whose every declared blocker is CLOSED
returned **six** — none claimed, none `ready`, all `lane:any`, every one structurally startable —
stranded 57m, 4h30m, 13h43m, 13h51m, 14h09m and **16h09m**, with three of five peer sessions idle.
They were found because a queued report about an unrelated row sent a human looking.

**The new cause is deliberately NOT gated on an empty shelf**, and that is the finding rather than a
preference. The Ready queue held four rows throughout, which is exactly why the one cause that would
eventually have looked stayed silent. The failure is a queue with DEPTH and no THROUGHPUT — work the
org already owns and has merely not promoted — and a shelf-empty gate would have withheld all six for
sixteen hours and then reported them as a supply problem.

`unclaimed-blocker-cleared` is emitted once per row, keyed on the SET that cleared (#1799's key
discipline, unchanged from `blocker-cleared`), so an unchanged clearing asks once and a row blocked and
cleared again is a new question. It is a **START** cause — nobody holds the row, so promoting it is the
org taking on work, which is `blocker-cleared`'s own argument read the other way — and a **JUDGMENT**
cause, because "it stays in backlog" does not stop being true twenty minutes later and an action
expiry would re-ask it for ever.

**A row hidden by a `NOT_PICKABLE` label is reported with the label NAMED, never dropped and never
reported as free.** #1561's `blockedBy` edge cleared itself at 08:28:00Z exactly as designed and the row
still sat 4h30m, because a hand-set `blocked` LABEL outlived the referent it named: a self-clearing edge
overridden by a non-self-clearing label. Excluding such a row would reproduce the invisibility that
stranded it, and `blocked-unexaminable` — the only other cause that could have reached it — is itself
shelf-gated and was silent for the same four hours.

The two causes address different populations and are not collapsed into one: the claim-label condition
in `blockerClearedOrders` is unchanged, and deleting it still turns the suite red for #2027's reason.
`worker-profile.mjs` routes the new cause to sonnet at `medium` — the gate hands over the row, the
cleared set and any hiding label, so the woken turn judges material already in its prompt rather than
building anything.
