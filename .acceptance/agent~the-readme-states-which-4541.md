README.md gains a "Not yet met" list of the five unmet trust-bar items, each linked to its METHODOLOGY.md section (or ADR 0019), and `docs/outcomes/outcome-17-trust-bar-plan.md` gives what each item says today (with line), the minimum to move it one step, and ONE first row: the expert labels the 22 held-out real pages blind. The expert's hours are marked as estimates; their time is not assumed.

Raised, not changed: METHODOLOGY.md line 114 "Reporting standard: Not done" is outside the five and is named in the plan for `product-manager`.

Acceptance:
```bash
grep -q 'Not yet met' README.md
bash -c 'test -s docs/outcomes/outcome-17-trust-bar-plan.md && grep -q "^## First row" docs/outcomes/outcome-17-trust-bar-plan.md'
```

Closes #4541

platform: nothing to check, prose only.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
