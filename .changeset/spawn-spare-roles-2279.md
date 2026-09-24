---
"@a11ign/agent-org": patch
---

**The spawn pilot can fire: `sessions.json` gains two SPARE engineer roles, `worker-4` and `worker-5`, and `wake`
offers work to the file's engineer roles instead of a typed list (#2279, `ceo`'s ruling on #1950 question 2).**
`spawnableRole` starts a process only into an ABSENT engineer role, and all three engineer roles are
permanently occupied by standing sessions, so the pilot merged in #2216 could fire only after a standing
session died. Three orders (#2199, #2204, #2209) reported `no spawn: EVERY ENGINEER ROLE ALREADY HAS A PROCESS`.

The instances get their own ADDRESSES rather than a second process under one name: `session:<name>` is a
routing address, `arm-pr` refuses a label outside `live`, and B2 caps one row in build per name. **The bound
is the order, not the roster** — a spawn needs a `ready-row-unclaimed` order `route` could not place, one per
tick — and two spares is `ceo`'s ceiling on the pilot's blast radius, not a claim about capacity.

**The row said no code change to `spawnableRole` was needed; that was right and not enough.** `wake.mjs`'s
`main` defaulted its roster to the literal `"worker-capture,worker-judge,worker-tooling"`, so an address added to
the file would never have been offered work or spawned into. `engineerRoles()` now reads it, in file order (the
standing three first), and `--roster` still overrides. The refusal names the count — `all N engineer roles hold
a process` — where it used to say every engineer role already had one, as if that were a fact about the
standing three.
