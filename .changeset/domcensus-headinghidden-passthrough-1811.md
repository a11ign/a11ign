---
"@a11ign/evidence": minor
---

**`domCensus()` now carries `headingHidden` through, not just `heading`.** #1549 split the worker's DOM heading count into `heading` (rendered) and `headingHidden` (CSS-hidden below a breakpoint, in a closed panel, `display: none`), but `domCensus()` never read the second field off the raw capture — so every consumer that wanted "how many headings does the DOM carry, reachable or not" saw only the rendered count, and a page whose headings are all hidden read `heading: 0` exactly like a page that never rendered. Absent on any capture taken before #1549, the same "cannot say" convention every other field here already follows (#1811).
