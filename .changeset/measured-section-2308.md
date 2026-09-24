---
"@a11ign/agent-org": patch
---

**A PR body that declares a `## Measured` section must show a command with its output directly beneath it (#2308).** Part c of `ceo`'s 2026-09-24 ruling on #2305: 7 of 46 first-review refusals were a count or population claim not true at the reviewed head. `acceptance-commands.mjs` now reads a `## Measured` heading (heading form only, outside HTML comments, so prose `Measured:` and the template's own guidance comment declare nothing) and reports `MEASURED: RECORDED`, `MALFORMED` (no fenced command with its output on the next line) or `DUPLICATE`, failing the job on the last two. The section's absence is `NOT DECLARED` and passes: it is the reviewer's cue that no figure is claimed. The shape is `row-file`'s Open-check rule, copied not imported. The PR template documents the section without carrying an empty heading, which would fail every PR.
