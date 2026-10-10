## What

The last `--import tsx` left in the Acceptance's paths: `ExecStartPre` of `.agent-org/units/a11ign-fleet-watch.service` now runs `%h/.local/bin/node -e "import('./packages/control/src/fleet-watch.ts')"` (the host's own Node 24, which strips types since #4389; `/usr/bin/env node` could resolve to the distro 22). The load-proof step is unchanged in meaning, so `fleet-watch-unit-exit.test.ts` still finds its non-`-` preflight importing `./fleet-watch.ts`. Closes the umbrella after #4696-#4699.

## Evidence

- Measured: `~/.local/bin/node -e "import('./packages/control/src/fleet-watch.ts')"` in the primary checkout prints no error (module loads, no loader).

platform: none needed; a unit-file text edit.

Acceptance:

```bash
bash -c '! git grep -qE -- "--import[= ]\S*tsx" -- package.json scripts packages .agent-org/units ":!scripts/fixtures"'
```

Mutation: restore `--import tsx` on line 48 of the unit: the grep exits 0 and the acceptance fails.

Closes #4596
