## What

`docs/outcomes/outcome-10-linux-path.md`: the decision document for #4084 outcome 10. It states, layer by layer with file and line, what runs on a Linux runner today, what a Linux-only report would claim and refuse, the runner-minute difference from `docs/capture-cost.md`, and the one row to file first.

Decision: build the rule-layer-only path (CLI flag, then Action), do not build a Linux accessibility-tree census, keep every screen-reader reading on Windows. Main finding: all four rules-owned asserting subtypes read the NVDA transcript, so a Linux-only report asserts only through axe-core; and today the CLI refuses to report axe at all without a worker.

Linux minutes (about 5 for 5 pages) are INFERRED and labelled so; the Windows figures are READ from `capture-cost.md`. The first row's follow-up measures the Linux number.

platform: checked GitHub Actions pricing as quoted in `capture-cost.md`; nothing built.

Acceptance: bash -c 'test -s docs/outcomes/outcome-10-linux-path.md && grep -q "^## What it covers" docs/outcomes/outcome-10-linux-path.md && grep -q "^## What it would cost" docs/outcomes/outcome-10-linux-path.md && grep -q "^## First row" docs/outcomes/outcome-10-linux-path.md'

Closes #4534

🤖 Generated with [Claude Code](https://claude.com/claude-code)
