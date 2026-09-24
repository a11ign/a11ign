---
"a11ign": patch
---

**The proof that a login's credential does not reach what a run writes now exists as a command, and it runs nowhere by itself yet (#2359, PR 6 of 7).** `npm run auth:leak-check` drives a real capture on the machine the worker runs on, through a fixture site whose account page either does or does not echo the username, and searches what came back and what a run would write. Exit 0 is clean, 1 a leak, 2 could not examine, and examining nothing is 2. The two fixtures give it its positive controls: against the echoing site the raw response must exit exactly 1, and the written artifacts must exit 0 with a redaction count of at least 1. No flag reaches an authenticated run until PR 7.
