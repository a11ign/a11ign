---
"a11ign": patch
---

**The flows file's parser exists, and nothing can reach it yet (#2359, PR 1 of 7).** ADR 0038 designs a run that logs in to the page it examines; this is the file format it reads, refusing rather than tolerating: a closed vocabulary of seven steps with no script, no evaluated expression and no fixed sleep; `origin:` pinned so a flow written for staging cannot be aimed at production; controls addressed by accessible name and never by selector; and a login flow that takes its values from the environment only, must end in an `expect`, and captures nothing. No flag or Action input accepts a flows file until PR 7, so no run changes behaviour.
