## What it is

Adds `### Lever A` to `docs/capture-cost.md`: the recapture of the activation-budget cut (worker PR #71, `ACTIVATION_SHARE_OF_REMAINING` 0.5 to 0.25), read from two `action-smoke` runs on `windows-2022` that differ only in the worker pin (0.13.7 against 0.13.8).

- `survey.html`, `probe-forms: "true"`: **326.6 s uncut** (run `38992044416`) and **312.6 s cut** (run `38992042444`), a difference of 14.0 s.
- Fields left unactivated on `survey.html`: **0 uncut, 2 cut** (`activationBudget.skipped`).
- **220 s is NOT reached** (92.6 s short). The next cut is filed as its own row, a11ign/agent-org#1685 (the sweep round trip, 61 trips at 1.7-1.9 s).
- The section says that two runs of n=1 are one reading.

Docs only: no code, no workflow change. The two recapture branches (`agent/lever-a-recapture-cut-agent-org-1679`, `agent/lever-a-recapture-uncut-agent-org-1679`) are not for merge.

Acceptance: `git grep -q "^### Lever A" -- docs/capture-cost.md`

Closes a11ign/agent-org#1679

🤖 Generated with [Claude Code](https://claude.com/claude-code)
