The live fleet reading of #4449, taken 2026-10-10 with the fleet awake and idle: display mode converged (1024x768 on all 15), the Windows build did NOT (3 builds on 2 images), the window installed nothing on any of 15 boxes, and Edge is still split on three boxes. The file pastes the before/after per-box readings, the logon-task and deferral read-backs, the baseline's own 24 h command run today (4 boxes with no rise: workers 7, 8, 9, 11), and every change made to the fleet to take the reading. The month-later half is still to come, so the row stays open.

Measured, not estimated: every figure is from `fleet:status`, each box's `/health` environment, or a `win_powershell` read over the inventory, on the day. No address is written in the file (`git grep` for a dotted quad outside version strings found none).

platform: docs only; nothing replaces the live reading, which is a hand-run of the orchestrator.

Acceptance:
```bash
test -s docs/fleet-convergence-reading.md && grep -c -E "build|display" docs/fleet-convergence-reading.md
```

Closes: none — the month-later before/after pair (done-when 2), the logon task's first result (done-when 3) and one build (done-when 1) are still open on #4449.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
