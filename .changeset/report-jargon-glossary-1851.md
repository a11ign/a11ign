---
"a11ign": patch
---

**The CLI text report's legend now glosses its four remaining unexplained terms.** A reader with no accessibility background, handed the report cold, could classify findings and outcomes correctly but could not say what the confidence number meant, what the `Support` line was telling them, what `ACT` stood for, or what the `§5.x` citations pointed at (#1802's own closing blind-read named these four as still unglossed).

The legend (`howToReadThisSection`) now explains, in the order the report uses them: the 0-1 confidence scale and that "overall confidence" is the WEAKEST finding, not an average; that the `Support` line is a check on the scorer's own confidence rather than a finding about the page, and what OUTSIDE means; that `ACT` is W3C's Accessibility Conformance Testing framework; and that `§5.2`/`§5.3` are WCAG's own section numbers. Nothing machine-readable changes -- no new field, no `ActOutcome`, no `--json` output.
