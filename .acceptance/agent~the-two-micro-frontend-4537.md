Adds `docs/outcomes/outcome-15-spa-reliability.md`, the sizing document for #4084 outcome 15 (the two SPA reliability findings), and records the readings in `docs/known-gaps.md` (§31 and §57).

What it finds: the row's premise for (2) is refuted. §31 already states "about 1 time in 3" with its table (checkbox + `polite`: 2 of 6). What was missing is that the project's own fixtures cannot reproduce it: of 1,715 `good.html` calibration pages, 451 carry a live region and 0 of those also carry a checkbox or radio (script over `runs/screenreader-dataset/pages`, `2b4bb5bbf`), and the one stability canary that activates a control is the silent variant. The first-visit count for (1) is not measured and cannot be from existing captures (nothing records cold or warm; the local `runs/witness` is 34 stale files), so it is routed to `orchestrator`. It decides: build one fixture (checkbox + `polite`, outside the case matrix) and measure 20 captures of it; do nothing for (1) until the read-only count exists. Sized at 1 PR plus about 1 to 2 worker-hours of capture for (2).

Numbers in the document name their command and commit; the capture-time basis (170-371 s per capture) is `docs/capture-cost.md` and is labelled inferred for the fleet.

platform: nothing built; docs only.

Acceptance: `bash -c 'test -s docs/outcomes/outcome-15-spa-reliability.md && grep -q "^## What it covers" docs/outcomes/outcome-15-spa-reliability.md && grep -q "^## What it would cost" docs/outcomes/outcome-15-spa-reliability.md && grep -q "^## First row" docs/outcomes/outcome-15-spa-reliability.md'` printed nothing and exited 0 at this head; `grep -q 'self-announcing' docs/known-gaps.md` printed nothing and exited 0.

Closes #4537

First row filed: a11ign#4567 (product-manager, 2026-10-09).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
