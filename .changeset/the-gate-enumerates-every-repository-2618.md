---
"@a11ign/agent-org": patch
---

**The gate and wake enumerate every repository the project declares, and a seat name cannot collide across two (#2618, child 3c of #69, ADR 0040 decision 2).**
A pull request or row number is only unique inside its repository, so `reviewer-7` and `engineers/ready-row-unclaimed/7` named two things once a second
repository existed. Every repository and tracker now carries a key; a NAME is `<role>-<n>` for the empty key (the primary project's, exactly today's) and
`<role>-<key>-<n>` otherwise (`reviewerSeat`, `seatName`), and a LEDGER, marker or queue key is the bare `<n>` for the empty key and `<key>#<n>` otherwise
(`subjectRef`), so the primary project's wake ledger is read by the new code with no conversion and by the old code unchanged. `scopesOf` makes one scope
per key, `readLanes` reads a scope's own pull requests and rows, and `main` ticks every non-primary scope through `scopeTick` after its own; with one
declared project that list is empty and the orders are byte-identical to what they were (recorded fixture, live run). A failed read of one repository is
named in the `PARTIAL` line and drops nobody else's orders. `wake` reads `reviewer-<key>-<n>` as an instance of ITS repository (`reviewerInstance`,
`orderPullRequestRef`) and REFUSES a checkout for one until host paths exist (child 3f), rather than fetching the primary's pull request for it.
