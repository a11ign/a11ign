## A waiting condition is DATA, not a sentence (chairman, 2026-09-19)

- **If a conclusion changes what should happen next, it goes in a FIELD, not a comment.** The comment is
  the reasoning; the field moves the org. **Nothing in this org reads comments.**
- **Waiting on a SESSION → `answer:<session>`. Removing the label IS the act of answering**, so there is
  nothing to remember.
- **Waiting on another row → `gh issue edit <n> --add-blocked-by <m>`**, GitHub's own dependency edge,
  returned by the gate's `--json blockedBy`.
- **Waiting on a date → `Not-before: YYYY-MM-DD`; on an HOUR → `Not-before: YYYY-MM-DDTHH:MM:SSZ`**
  (#2113: seconds and the `Z` are required, else it fails open); use the hour whenever the wait ends at one.
- **`Fleet-hold-until: <timestamp>`** refuses `fleet:deploy`/`fleet:provision` until T and *means* "my captures
  own the workers" (nothing reads it).
- **A wait names its CONDITION: `Waiting-for: closed|merged #n` or `labelled|unlabelled <label> #n`** (`pr:hold
  --until`); the tick re-reads it, and a hold with none stops excusing a red PR after 4 h.
- **A freeze has an ANCHOR row; every wait it causes cites `Waiting-for: closed <anchor>`.**
- **All of these CLEAR THEMSELVES, and that is the point.** `blocked` has **no referent**, so only a human can lift
  it: use it only for a wait no field can express, and say what would clear it.
