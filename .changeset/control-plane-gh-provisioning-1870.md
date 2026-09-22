---
"@a11ign/worker-fleet": patch
---

`bootstrap-control-plane.sh` now provisions `gh` (GitHub CLI) on the control role, idempotently,
following GitHub's own apt repository since Debian ships no `gh` package. `fleet-playbook.mjs`'s
fleet-hold check (#1839/#1841) needs `gh` on whatever host runs `fleet:deploy`, and the durable
pipeline-dispatch host had none -- it was ENOENTing instead of naming a real hold or saying "may
proceed" (#1870).
