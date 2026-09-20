---
"a11ign": patch
---

**The CLI text report now says `ASSERTED` on every axe-core and PDF-layer finding, instead of leaving it to be inferred.** A reader with no accessibility background, handed the report cold, had to work out "this is a confirmed problem" from the *absence* of the `INDICATOR` tag the lived-experience layer's own findings carry -- there was no positive signal at all. Both layers read a rule match directly (the DOM for axe-core, the tag tree for PDF) rather than inferring it, the same class of claim ADR 0021's addendum already settles for axe-core, so each finding line now prints `ASSERTED` explicitly.

**Bare criterion numbers now carry their plain-language name** -- "4.1.2 Name, Role, Value" instead of "4.1.2" -- in the axe-core section, the PDF section, and per-criterion outcomes. Findings from the lived-experience layer were already named at the point they're produced and are unchanged. The machine-readable `CriterionOutcome.criterion` field itself is unchanged; EARL and `--json` still read the bare number.

**The legend gained one line** tying the finding-level vocabulary (`ASSERTED`/`INDICATOR`) to the outcome-level one (`asserted`/`referred`), after a blind read found the two confusing in isolation with nothing saying they're the same split (#1791).
