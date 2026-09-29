---
"@a11ign/worker-fleet": minor
---

**An enrolled worker can be declared out of the capture set, so five cold-profile boxes do not stop the ten (#2660, #2654).** An inventory host that carries `a11y_capture: false` stays in the fleet (`fleet:env --list`, `doctor`, `worker:code`, `fleet:status` and the deploy tooling still name it) and is left out of `A11Y_WORKERS`, so `capture-fleet-guard` no longer refuses every default run the day the fifteen-entry inventory arrives. A host that declares nothing is in, so the ten need no edit. `fleet:env` names each host it leaves out on stderr with its address and the declaration that did it; a value other than `true`/`false`, a declaration on a group, and a capture set with every host excluded are refused rather than read as "in". `workersFromInventory` takes `scope: "fleet" | "capture"` (default `"fleet"`, so no existing reader changes).
