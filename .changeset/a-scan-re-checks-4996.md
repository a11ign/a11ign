---
"a11ign": minor
---

An authenticated scan now re-checks it is still signed in before every audited page, using the login flow's final `expect`. A failed check signs in once more; a page that is still signed out is reported "not audited: signed out" (never an audit of the sign-in page), in the roll-up and in `--json` (`notAudited: true`), and the run exits 4, distinct from a run where pages merely failed (#4996, #4084).
