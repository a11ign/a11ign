`.agent-org/decisions.json` carries `"outside.arm": true` as a flat boolean key (row #5603, epic #5602, home row agent-org#1573 closed 2026-10-16T11:33:23Z by agent-org#1586, merged at c86960eee and first released in v0.214.0). It is the switch that turns on the outside home of auto-arm for a11ign, set only after that home was built and released. Its canary (signals, window, revert) is on the row. Revert: set the key to `false`.

Acceptance: node -e 'process.exit(JSON.parse(require("fs").readFileSync(".agent-org/decisions.json","utf8"))["outside.arm"]===true?0:1)'
