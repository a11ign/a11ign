A green `action-smoke` run now keeps the capture records, and `docs/capture-cost.md` carries a runner's per-phase table read from one of them.

- **The run:** `38797684887` (`workflow_dispatch` on this branch at `a46618a22`, job `consumer`, `success`). Its `action-smoke-capture` artifact holds three `runs/witness/<stamp>-www-w3-org.json` records, each with `capture.diagnostics`; `gh run download 38797684887 -n action-smoke-capture` retrieves them.
- **The split:** by the doc's own method; in all three records the phases sum to the last `atMs` exactly (checked by the script, not asserted by a test).
- **The reading:** no capture reached the deadline, and `formField` is 122.8 s with `probe-forms` on and 4.8-14.2 s without. The fixed probes are 48.9-53.7 s on a runner, against 68 s on the fleet at protocol 21.
- **Limits stated in the section:** one job, two pages, n=1 per command, protocol 24 against 21, and run order confounded with the `probe-forms` input.

Acceptance: git grep -q "^## A runner capture, per phase (a11ign#4084 outcome 6)" -- docs/capture-cost.md

Mutation: renaming the section's heading to `## A runner capture` turned the acceptance command red (exit 1); restored from a copy, `diff` empty, exit 0.
