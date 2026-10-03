---
"a11ign": patch
---

**The GitHub Action's log now says so when its count is bounded by an incomplete examination or an abstention (#3295).** On `https://www.gov.uk/` (run 37134253796) the log read only `0 finding(s) (none); fail-on=never`, though the result recorded that the focus-order sweep stopped at its cap and the scorer abstained on every criterion, so a reader who greps the log for the count saw a clean zero. A line before the count now names the stopped sweeps (`examination INCOMPLETE`) and, separately, the abstention; a complete, scored examination prints exactly the lines it did before, as `docs/try-it.md` already described.
