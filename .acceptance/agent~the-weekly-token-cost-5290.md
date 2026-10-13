The weekly token-cost unit's `TimeoutStartSec` is raised from 600 to 1800, so the read it runs (`scripts/token-cost.ts --post`, measured at 14m29s wall over the 2026-10-05..10-12 window, #3217) can reach the comment it posts to. At 600s every attempt was killed first and none posted.

- **Unit syntax:** `systemd-analyze verify .agent-org/units/a11ign-token-cost-weekly.service` exits 0, with no warning naming this unit.
- **Retry arithmetic, named not changed:** the header's "last start about 22:43Z" assumes each failed attempt takes no time. Eight full-length attempts at 1800s put the last start near 02:13Z Tuesday. The comment above `TimeoutStartSec` says so; the header is left for the row that owns the retry bound.

Acceptance: bash -c 'n=$(sed -n "s/^TimeoutStartSec=//p" .agent-org/units/a11ign-token-cost-weekly.service); test "$n" -ge 1800'
