---
"@a11ign/evidence": minor
---

`@a11ign/evidence` exports `restatesWireType(text)`, the scan for a second spelling of a capture's wire type: it returns the `<field>: <shape>` strings of every `stateChanges` or `formChanges` typed as an inline object, `unknown[]`, a same-file alias or a cast, and of every inline `structure` object naming three or more of the sweeps. It reads text, so a repository holding a capture type can scan its own tree for one with the same detector the core's tests use instead of copying it (ADR 0045 rule 2, #5092).
