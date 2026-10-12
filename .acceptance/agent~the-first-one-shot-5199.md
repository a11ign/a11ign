## What

`.agent-org/host.json` turns on the first one-shot lane: `workers.orchestratorOneShot` becomes `true`, and `workers.ceoOneShot` is declared `false`, so it is a decision and not an absent key (`flag-without-a-switch`). The reader is agent-org's `orchestratorOneShotEnabled` and `ceoOneShotEnabled`, which treat only a literal `true` as on.

Revert: set `"orchestratorOneShot"` back to `false` (or remove it) on the `workers` line.

platform: nothing built; the flip is a host declaration that agent-org's existing readers consume.

Acceptance:
```bash
node -e 'const h=require("./.agent-org/host.json"); if(h.workers?.orchestratorOneShot!==true||h.workers?.ceoOneShot!==false) process.exit(1)'
```
