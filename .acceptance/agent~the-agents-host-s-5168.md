Flips `.agent-org/host.json` `events.source` from `poll` to `webhook` (receiver, tunnel and publicUrl already declared by #5197, whose live signed `pull_request` delivery is quoted on that row). The 3-minute tick drop-in `~/.config/systemd/user/a11ign-work-tick.timer.d/tick-3min.conf` is removed on the host in the same change; the timer reads `OnUnitActiveUSec=2min` from the shipped unit and `DropInPaths` is empty after `daemon-reload`.

**Measured at this head:** the Acceptance exits 0 (`events.source` reads `webhook`). Before reading, from `~/workers/gh/gh-calls.tsv`, non-cache rows 12:00-12:31Z 2026-10-12: `app:scheduler` 2179 (the gate), at the 3-minute tick. The after reading and event-to-wake latency go on #928 once the new source has run an hour.

**Mutations:** none; a one-key data change. Revert is `"source": "poll"` in `host.json`.

**Not done here (named):** the after reading and latency are owed on #928, not in this diff.

Acceptance: bash -c 'node -e "const h=require(\"./.agent-org/host.json\"); if(h.events?.source!==\"webhook\") process.exit(1)"'

Closes #5168
