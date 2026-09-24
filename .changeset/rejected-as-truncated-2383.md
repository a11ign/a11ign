---
"@a11ign/lab": patch
---

**`build-realism-tier` records WHICH captures it rejected as truncated, not only how many (#2383, from #2215).** `with-realism.jsonl.source.json` gains `rejectedAsTruncated: [{ url, gaps: [{ channel, reason, kind }] }]`, sorted by `url` so two builds diff cleanly, and `[]` rather than absent on the base-only path. Before, `rejected as truncated: 4 of 41` was a count, the urls went to stdout only, and when the previous build's rejection set was 2 the two captures were gone with the protocol-18 recapture — the next such delta could not be attributed. No floor is added: how many rejections are acceptable belongs to the question asking.
