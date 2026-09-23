---
"@a11ign/agent-org": patch
---

`endsInsideQuote` now starts a comment where bash starts one -- at the beginning of a word, after any of bash's ten metacharacters -- rather than after whitespace alone. An Acceptance line such as `npm run lint;# don't skip this` used to walk into the comment text, open a quote on the apostrophe, and JOIN the next Acceptance command onto it, so `acceptance` ran and reported on a command nobody wrote (#2088).
