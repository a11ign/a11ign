The weekly token-cost unit's `TimeoutStartSec` is raised from 600 to 1800, so the read it runs (`scripts/token-cost.ts --post`, measured at 14m29s wall over the 2026-10-05..10-12 window, #3217) can reach the comment it posts to. At 600s every attempt was killed first and none posted.

A 1800s timeout alone moves the retry schedule past Monday, so `RestartSec` goes from 90 to 70 minutes in the same change (reviewer-5396, blocker on #5396). Two paths set the last start. A read that hangs to the 30-minute timeout has starts 100 minutes apart, so the eighth is 12:13Z + 7 x 100 min = 23:53Z, inside Monday UTC; at 90 minutes it is 02:13Z Tuesday. A read that fails at its end (about 14.5 minutes) has starts 84.5 minutes apart, so the eighth is about 22:04Z, with its comment check about 22:19Z. A CI-health comment that lands after the last check is missed, and the 10-05 16:43 slot (22:53Z) is one such case on the failure path. `product-manager` ruled it a known gap (#5396), stated in the service header and in `docs/token-cost.md`; no retry schedule covers it under the one-day window.

The timer's comment and `docs/token-cost.md` now give the same 70-minute schedule, since both are in this row's Region.

- **Unit syntax:** `systemd-analyze verify .agent-org/units/a11ign-token-cost-weekly.service` exits 0, with no warning naming this unit.
- **Schedule:** the Acceptance command below computes the hang-path last start from both values. It fails at `RestartSec=90min` and at `TimeoutStartSec=600`, and passes at 70 and 60. The header and the `StartLimitBurst` comment state both paths.

Acceptance: bash -c 'f=.agent-org/units/a11ign-token-cost-weekly.service; t=$(sed -n "s/^TimeoutStartSec=//p" $f); r=$(sed -n "s/^RestartSec=//p" $f); test "$t" -ge 1800 && test $(( 733 + 7 * (t / 60 + ${r%min}) )) -le 1439'
