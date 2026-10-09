Regenerates `.github/workflows/consumer-gate.yml` with `node --import tsx scripts/generate-consumer-gate.ts`, unedited, so `release.yml`'s `guards` and `consumer-gate / check-pin` jobs stop failing with `STALE ... does not match README.md` (release-run-failed, 2026-10-09T14:26Z).

Diff stat: `1 file changed, 7 insertions(+), 7 deletions(-)` (14 lines).
- 12 lines are the 40-character pin (`7e5228ba…` to `9a1b530b…`), which the check strips.
- The `release 0.3.0` to `release 0.5.3` comment line is the one that is NOT a pin. It is the drift the check reports; it arrived with README's pin to `a11ign@0.5.3` (#4507).

No README and no generator edited. Platform: nothing to reuse; this is the existing generator's own output.

Acceptance:
```bash
node --import tsx scripts/generate-consumer-gate.ts --check
```
Printed `OK .../consumer-gate.yml matches README.md's documented workflow.` (exit 0) at this branch.

Closes #4556

Done-when item 2 (`ceo` dispatches `release.yml` on main after merge) is `ceo`'s.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
