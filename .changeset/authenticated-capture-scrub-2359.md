---
"a11ign": patch
---

**The containment for a login's credentials exists, and nothing can reach it yet (#2359, PR 2 of 7).** Every value a run reads from the environment for a login will be replaced with `‹credential›` in everything the CLI writes or prints, in its raw, JSON-escaped, URL-encoded and base64 forms, with the count disclosed ("N announcements contained a value from your login and were redacted."). A rescan then runs the same detector the `auth:leak-check` command uses, including a run of four or more one-character announcements that spell part of a credential; a hit stops the run before anything is written or printed. A value shorter than 8 characters refuses the run rather than rewriting the page's own text. No flag reaches this until PR 7, so no run changes behaviour.
