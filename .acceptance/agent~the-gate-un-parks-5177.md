`.agent-org/project.json` no longer carries `rows.autoUnpark`: agent-org#1134 made the flag's one home `rows.autoUnpark` in `machinery-canary.json` (now on, per `ceo`), so the key here was never read and only let a reader believe the flag was set from this file (a11ign#5177, 3b).

Acceptance: jq -e '.rows | has("autoUnpark") | not' .agent-org/project.json
