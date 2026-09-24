## A waiting condition is DATA, not a sentence (chairman, 2026-09-19)

- **If a conclusion changes what should happen next, it goes in a FIELD, not a comment.** The comment is
  the reasoning; the field moves the org. **Nothing in this org reads comments.**
- **Waiting on a SESSION → `answer:<session>`. Removing the label IS the act of answering**, so there is
  nothing to remember.
- **Waiting on another row → `gh issue edit <n> --add-blocked-by <m>`**, GitHub's own dependency edge,
  returned by the `--json blockedBy` call the gate makes.
- **Waiting on a date → `Not-before: YYYY-MM-DD`; on an HOUR → `Not-before: YYYY-MM-DDTHH:MM:SSZ`**
  (#2113 — seconds and the `Z` are required, anything else fails open). Use the timestamp whenever the
  condition turns true at a named time.
- **`Fleet-hold-until: YYYY-MM-DDTHH:MM:SSZ` says TWO things and only one is enforced.** It refuses
  `fleet:deploy`/`fleet:provision` until T (code); it also *means* "my captures own the workers until T",
  and **nothing reads it for that**. Declare both; the second is a note to humans.
- **All of these CLEAR THEMSELVES, and that is the point.** `blocked` has **no referent** — it never says
  what blocks the row, so only a human can lift it. Use it only for a wait no field can express, and say
  what would clear it.
