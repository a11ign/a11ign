Adds `### Lever A, second cut` to `docs/capture-cost.md`: one `action-smoke` run (run `39000496869`, worker `0.13.9`, workerCode `033505cc2ccc2fa1`) read per direction, with the three buckets and their trip counts, the statement that one run of n=1 is one reading, the finding that the buckets do not sum to the trip, and the reason no cut row is filed.

**Measured at this head:** the heading is present, exit 0.

Acceptance: bash -c 'git grep -q "^### Lever A, second cut" -- docs/capture-cost.md'

Refs agent-org#1687
