---
"@a11ign/agent-org": patch
---

One instance, one row: a spawned engineer that holds or has held a row is no longer a member of the `engineers` pool (the refusal names why), `row-claim` refuses it a second row (resuming its own is not refused), and an order that names it is delivered as before. Every `spare-cycles` line now carries `rows`; an instance that ends holding more than one is written `clean: false`, and #1950's count reads only a clean single-row line, so a line with no `rows` is legacy, counts for nothing and the count restarts at zero. A leftover registry entry for an address is settled (one failed line) before the next instance's claim, so it cannot refuse that claim. The routing rules file no longer tells a spawned engineer to claim the next Ready row (#2407).
