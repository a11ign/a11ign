---
"a11ign": patch
---

A scorer failure on a single `url` is now recorded as an unmeasured page, the way a failed page in a list is, instead of ending as a bare exit 1 with no result. The CLI writes the one-page result (`status: "failed"` with the scorer's reason) and the Action's Report step exits 2 with a summary, so a page that could not be measured is never reported clean. Authentication faults, worker faults and a shipped-artefact mismatch are unchanged (#3657).
