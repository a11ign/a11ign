---
"@a11ign/agent-org": patch
---

**`org-health`'s red-PR signal asks `red-pr.mjs`'s `isBrokenRed` whether a PR is red, so a hold's own red is never offered to `ceo` (#2956, the class behind #2883 in the 2026-10-02 retrospective).** Red was decided separately by every consumer. `pr-checks-failing` excuses a hold only when the hold is its ADDRESSEE's own (#2400), so a PR a worker owns and `ceo` holds (#2883, frozen to 2026-10-03T18:27Z) was still ordered, `redPrFacts` listed every ordered PR, and `org-health` would have offered `ceo` its own deliberate hold every day of it, with the owner correctly silent. `redPrFacts` now also requires `isBrokenRed`, and `redSince` is the earliest BROKEN check (`redSinceOf`), so a held PR with a real `ts / run` failure is offered and dated by that check, not by the hold's `gate`. A PR with no owner is offered as before. `redPrFacts` no longer takes `required`: the order already carries it.

**Pinned so a fourth consumer cannot re-decide it:** `org-health.test.ts` scans every non-test `agent-org` module for one that reads red state (`statusCheckRollup`, a spelt-out red conclusion, the decider's vocabulary) and requires `isBrokenRed` from `red-pr.mjs` or a shrink-only exemption with a reason; `org-retro.mjs` and `org-health.mjs` are positive controls, and a fixture with its own `FAILURE` set goes red. The scan found a fourth decider already in the tree, `queue-table.mjs`'s own `isRed`, exempted by name and filed as #2981.

**What it does not do:** change the decider or the retrospective (#2954), or `pr-checks-failing`'s addressee-relative routing.
