---
"@a11ign/scorer": minor
"@a11ign/judge": patch
---

**2.4.6's heading feature now asks whether a heading relates to the content it introduces, not whether its string is on a word list (#2188).** WCAG 2.4.6 judges a heading against the content that follows it, and the old `generic_heading_present` judged the string alone: "Help" above help content fired, while "Info" and "General" above unrelated content did not. It now fires for a one-word heading at level 2 or deeper whose section never uses that word; a heading with no content, or no announced level, reads 0. The finding is still `cantTell`, never asserted, and a vague two-word heading ("General information") is not caught by this feature.

Scorer breaking change: `FEATURE_SCHEMA_VERSION` moves v19 to v20, so the shipped v19 weights cannot score under this pipeline until the retrain is promoted, and any retrain is a major (minor while 0.x). `@a11ign/judge`'s 2.4.6 coverage note carries the same reading and the ACT rule it rests on.
