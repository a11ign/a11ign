---
"a11ign": patch
"@a11ign/worker-fleet": patch
---

**`witness`, `worker:compare` and `auth:leak-check` say "did not answer within 12 s", never "down" or "unreachable", and wait long enough for the slowest healthy box (#2683).** Each probed `/health` with its own number (5 s, 8 s, 10 s) and reported a timeout in words that called a slow box gone. A new `@a11ign/worker-fleet/probe-outcome` reads a probe as ready, busy, not-ready, refused or no-answer; a refusal and the box's own `ready:false` say the box is up, and silence names `npm run fleet:wake -- <name>`. The shared timeout is 12 s: the loaded ceiling (about 10 s) plus 2 s, against a slowest healthy first-after-idle answer of 3.09 s (`orchestrator`'s readings on #2671, not measured by this change). `worker:compare` also now says why a worker has no vitals instead of leaving the column blank.
