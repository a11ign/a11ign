---
"@a11ign/agent-org": patch
"@a11ign/lab": patch
---

**A review verdict is ONE write: the review carries the whole verdict, and the gate reads it there (#3030).** `pr-review-verdict` posted only the verdict's first line as the GitHub review, and the reviewer's brief then had the whole file posted again as a comment, so the chairman saw two reviews for one head with no code between them (#3020: review 14:05:49Z, 63 characters; comment 14:06:28Z, 505). The door now posts the verdict file's WHOLE text as the review body and no comment; its first line is still validated as the opener, and the attribution read-back still proves the newest review is ours by exact body equality, now over the whole body (compared in `@tsv`'s spelling, since the API read-back escapes newlines).

**`verdictAmong` reads review bodies as well as comments** (`verdictBearers` in `review-verdict.mjs`, one list ordered by time, so the newest verdict at a head wins across the two and a verdict posted as a comment, on every PR already open, keeps working). `pr.reviews` was already on the `gh pr list` call, so no new request is made. `reviewer.md` no longer asks for the comment.
