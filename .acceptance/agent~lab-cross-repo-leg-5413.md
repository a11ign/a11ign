Adds the exit-code lines for the four control fleet files the lab's cross-repo leg fails on (a11ign/a11ign#5413), read from control v0.13.15 source: `fleet-converge.ts`, `fleet-dispatch.ts`, `fleet-lock.ts` in the control table, and `worker-fleet-carried.ts` beside the `cli-flags` note.

Acceptance: `grep -q "fleet-converge.ts" docs/gate-exit-codes.md && grep -q "fleet-dispatch.ts" docs/gate-exit-codes.md && grep -q "fleet-lock.ts" docs/gate-exit-codes.md && grep -q "worker-fleet-carried.ts" docs/gate-exit-codes.md`
