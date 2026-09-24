---
"@a11ign/worker-fleet": patch
---

**The two deploy refusals stop printing a recapture cost that was more than 2x wrong (#2244).** `protocol-guard.mjs` and `deploy-worker.mjs` told an operator deciding whether to spend a full recapture that it was "2,122 captures, about four hours of fleet time"; the corpus is 1,715 cases and 4,500 captures on disk (`orchestrator`, 2026-09-23T14:26Z). Both now print one shared `RECAPTURE_COST`: what a full re-run produces, `manifest.json`'s cases times two captures each (3,430), with the reading's date and no wall-clock, because the fleet's size is not something the guard can read. Eight files join `corpus-size-figures.test.ts`'s guarded list, each with its reason, and a control drives the scan over their real text at `a4eba30ed`. Two quotations of `capture-cache.mjs` that its rewording in #2242 had left in quotation marks now quote what it says.
