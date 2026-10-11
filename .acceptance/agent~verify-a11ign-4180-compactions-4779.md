The deliverable is a reading, posted on a11ign#4055 (https://github.com/a11ign/a11ign/issues/4055#issuecomment-6112827725): compactions per worker session and cache-read per merged row, three days either side of v0.83.1 (2026-10-08T18:12:46Z). This pull request adds no code; it records the reading and closes the row.

**Measured 2026-10-11 from `~/.cache/a11ign/trace/events.ndjson` (newest event 2026-10-11T19:22:55Z, past the end of the "after" window):**
- Compactions per worker session, before (n=323 sessions): 89 compactions, mean 0.28, p50 0, p90 1, max 4. After (n=549): 186, mean 0.34, p50 0, p90 1, max 5. No session over 10 compactions in either window.
- Cache-read tokens per merged row, before (110 rows): mean 6,380,060, p50 3,206,814, p90 12,505,580. After (219 rows): mean 3,254,869, p50 2,104,960, p90 6,549,699. Rows are those GitHub's closing references name (the store has no PR-to-row link), so n is a floor.

**Not claimed:** no saving. a11ign#4738 (the engineer's context window, open) may confound the "after" window, and the two windows have different row mixes.

The row's own Acceptance (`grep -n 'MIN_WORKING_ROOM_TOKENS =' ~/repos/agent-org/src/worker-profile.ts`) reads a file on the host, so CI cannot run it; it was run by hand and printed `81:export const MIN_WORKING_ROOM_TOKENS = 100_000;`. CI runs the check below, which pins that this record carries both windows' n and the no-saving statement.

Acceptance: bash -c 'grep -q "n=323 sessions" .acceptance/agent~verify-a11ign-4180-compactions-4779.md && grep -q "(110 rows)" .acceptance/agent~verify-a11ign-4180-compactions-4779.md && grep -q "no saving" .acceptance/agent~verify-a11ign-4180-compactions-4779.md'

Closes #4779
