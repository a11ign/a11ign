---
"@a11ign/agent-org": patch
---

**The fleet batch is selected by the `fleet-gated` label and the row's own waiting fields, never by milestone (#2443).**

Both feeders scoped by "the version-one path" milestone, each with its own constant, so a `fleet-gated` row filed
off-path was invisible to `orchestrator` (#2212 sat on `Out of release` for hours). `work-gate.mjs` now exports
`FLEET_GATED_SELECTOR` and `fleet-gated-nightly.mjs` imports it; `partitionFleetBatch`, `fleetBatchRows` and
`fleetBatchOrders` lose their `milestone` parameter. `Not-before:`, `Fleet-hold-until:`, `answer:` and an open
`blockedBy` still shelve a row (#2027, unchanged).
