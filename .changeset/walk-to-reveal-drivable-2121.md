---
"@a11ign/nvda-worker": patch
---

**`walkToReveal` is exported and its page reads come through an `io` seam (#2121).** The 1.4.13 focus-reveal walk could only ever be exercised by a real fleet capture, and every capture this project has taken returned from tab stop 0 or stop 1 — so stops 2–7 of its `FOCUS_REVEAL_STOPS = 8` loop, including the bail-out when the focus read comes back empty and the break when the probe's deadline passes, had never executed anywhere. `walkToReveal({ interaction, deadline, io })` now takes its Tab press, structural census, focus read and clock from `io`, which defaults to the module bindings it has always used, so the fleet path is the same four calls in the same order. Callers that do not pass `io` see no change.
