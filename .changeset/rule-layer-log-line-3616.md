---
"a11ign": patch
---

The Action's log now says how many criteria the rule layer (axe-core) failed, in a line before the count. The count line is the screen-reader layer's findings only, so a page axe-core failed on three criteria logged `a11ign: 0 finding(s) (none)` with nothing about the rule layer (#3616). No line is added when axe-core failed none.
