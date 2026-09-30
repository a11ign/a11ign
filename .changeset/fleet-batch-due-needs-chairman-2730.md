---
"@a11ign/agent-org": patch
---

**`fleet-batch-due` no longer re-fires on a `fleet-gated` row already answered `needs:chairman` (#2730).** #2728 (a credential row that carried `fleet-gated`) came back three minutes after `orchestrator` had answered it, because `needs:chairman` is not one of the order's three machine-readable exits (`Fleet-hold-until:`, `--add-blocked-by`, `Not-before:`) and `waitingOn`/`fleetWaitingOn` deliberately do not read it. `partitionFleetBatch` now moves such a row to its `waiting` half with the reason `waiting on the chairman (needs:chairman) -- declared on the row, and it clears itself`; removing the label puts the row back in the batch. `waitingOn` itself is unchanged, so no other reader inherits the label.
