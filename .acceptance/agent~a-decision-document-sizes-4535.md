Adds `docs/outcomes/outcome-12-flows.md`, the sizing document for #4084 outcome 12 (flows, not URLs).

What it finds: the row's premise is partly stale. The flows file already carries the full journey vocabulary (`goto, fill, choose, check, press, expect, capture`), both browser drivers and the worker already replay a flow to a capture point, and a multi-capture report shape exists. What is missing is that nothing can run a non-login flow: `planFrom` (`resolve.ts:180`) never sets `flow`/`upTo`, and no flag names a second flow. It decides: step actions are declared in the flows file (outcome 11 / #4532 is the route for MFA'd apps), only what the flow names is pressed under the file author's consent, the per-step report is one capture per `capture:` step, and a step is replayed per capture attempt (up to 4x for one capture point), which the first row must disclose in SECURITY.md. Sized at 3 PRs; row 1 needs no Windows worker.

Numbers in the document name their command and commit (`791552a77`). The PR-latency figure (median 18.1 min, p90 41.9) was measured with `gh pr list --state merged --limit 40` on 2026-10-09; the worker-minute figures are `estimateMinutes` arithmetic over `capture-cost.md`'s constants.

platform: nothing built; docs only.

Acceptance: `bash -c 'test -s docs/outcomes/outcome-12-flows.md && grep -q "^## What it covers" docs/outcomes/outcome-12-flows.md && grep -q "^## What it would cost" docs/outcomes/outcome-12-flows.md && grep -q "^## First row" docs/outcomes/outcome-12-flows.md'` printed nothing and exited 0 at this head.

Closes #4535

🤖 Generated with [Claude Code](https://claude.com/claude-code)
