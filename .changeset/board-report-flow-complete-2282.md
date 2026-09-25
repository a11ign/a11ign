---
"@a11ign/agent-org": patch
---

**The board report's queue flow no longer reads a truncated listing once the tracker passes 1000 issues (#2282).** `gh issue list` cannot page, and its newest-first listing drops the OLDEST rows, which are the open ones the age reading exists to count: at 1202 issues the "over 7 days" column and the older days of the Filed column were short, and the age table did not say so. `readFlow` now reads the open rows from one listing (a small set) and everything filed or closed in the window from one paged REST read `since` the window's start, since a row filed or closed in the window was updated in it; the two are merged one entry per issue. Only an open set that itself fills the cap is now a floor, and when it is, the age table says so beside the per-day table.
