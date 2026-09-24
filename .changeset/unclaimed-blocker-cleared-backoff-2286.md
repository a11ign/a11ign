---
"@a11ign/agent-org": patch
---

**An unanswered `unclaimed-blocker-cleared` order now backs off instead of repeating on the two-hour
TTL (#2286).** Measured 2026-09-24 from the host's wake ledger: 28 of `product-manager`'s 46 recent
deliveries were this cause, and 23 of them were four rows (#2161, #2149, #2132, #2092) re-asked at an
unchanged key every two hours, five or six times each, with nothing changed between. #2280 found the
same at ledger scale: 447 of 454 redundant deliveries were the TTL re-ask working as designed.

The gate now emits the order only in a window that opens at 0, 6h and 24h after the row's last blocker
closed and every 72h for ever after, each window exactly `JUDGMENT_TTL_MS` long so `wake`'s dedupe
delivers once per window with no state kept. The first ask is immediate and its key is unchanged; a
changed cleared set, or an answer written as a field (`ready`, an edge, `Not-before:`, `answer:`), is
unaffected. One conditional `issue list --state closed` call reads the closing times; a refused read
falls back to the previous behaviour, never to silence.
