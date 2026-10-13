The weekly token-cost unit's `TimeoutStartSec` is raised from 600 to 1800, so the read it runs (`scripts/token-cost.ts --post`, measured at 14m29s wall over the 2026-10-05..10-12 window, #3217) can reach the comment it posts to. At 600s every attempt was killed first and none posted.

A 1800s timeout alone moves the retry schedule past Monday, so `RestartSec` goes from 90 to 60 minutes in the same change. Each failed attempt runs its full 30-minute timeout, so starts are 90 minutes apart: 12:13Z + 7 x 90 min = 22:43Z, the last start inside Monday UTC. At 90 minutes the eighth start is 02:13Z Tuesday, after the week has changed (reviewer-5396, blocker on #5396).

- **Unit syntax:** `systemd-analyze verify .agent-org/units/a11ign-token-cost-weekly.service` exits 0, with no warning naming this unit.
- **Schedule:** the header and the `StartLimitBurst` comment state the 22:43Z last start and the 60-minute restart, and the `RestartSec` line states why it is 60.

Acceptance: bash -c 'n=$(sed -n "s/^TimeoutStartSec=//p" .agent-org/units/a11ign-token-cost-weekly.service); test "$n" -ge 1800'
