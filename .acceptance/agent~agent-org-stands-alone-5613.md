`.agent-org/decisions.json` carries `"outside.acceptance": true` as a flat boolean key (row #5613, epic #5602, home row agent-org#1579 closed 2026-10-16T11:10:01Z by agent-org#1584, released in v0.213.1). It is the switch that turns on the outside home of acceptance for a11ign, set only after that home was built and released. Its canary (signals, window, revert) is on the row. Revert: set the key to `false`.

Acceptance: node -e 'process.exit(JSON.parse(require("fs").readFileSync(".agent-org/decisions.json","utf8"))["outside.acceptance"]===true?0:1)'
