`docs/github-action.md` gains `## Running on a self-hosted Windows runner`: why (prices quoted from `capture-cost.md`, no multiplier stated), the `runs-on:` line, what the machine must hold per `action.yml` step, what changes about the evidence, and a run/read table that says "Not run on a self-hosted machine". `docs/known-gaps.md` gains entry 62 for it, and `docs/capture-cost.md` points to the section.

Acceptance: git grep -q "^## Running on a self-hosted Windows runner" -- docs/github-action.md
