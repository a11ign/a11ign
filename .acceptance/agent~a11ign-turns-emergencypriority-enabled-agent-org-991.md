Turns `emergencyPriority` on in `.agent-org/host.json`, the host declaration half of a11ign/agent-org#991. The option is OFF by default in agent-org#988, so the chairman's ruling of 2026-10-11 is not in force on this host until this lands. `setters` and `incidentKeys` are left at their defaults.

**Release:** the host's tool detaches at the newest release tag of agent-org (`v0.181.20` at the time of writing), and `v0.181.20` contains the merge of agent-org#988 (`d9d0959d`). Checked with `git merge-base --is-ancestor d9d0959d v0.181.20` in `a11ign/agent-org`.

**Measured:** agent-org's own reader (`parseEmergencyPriorityOption` in `src/work-gate/causes/rows-offer.ts`, run under `node --experimental-strip-types`) returns `enabled: false` for the `origin/main` file and `enabled: true` for this one, with the five default incident keys and the managers App and leads login as setters.

Acceptance: bash -c 'node -e "const h=JSON.parse(require(\"fs\").readFileSync(\".agent-org/host.json\",\"utf8\")); if(h.emergencyPriority?.enabled!==true) process.exit(1)"'

Closes a11ign/agent-org#991
