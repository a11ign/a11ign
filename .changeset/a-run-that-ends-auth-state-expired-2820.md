---
"a11ign": patch
---

**A run that ends `auth-state-expired` now says which layer refused the saved state (#2820).** A run holds two layers that each load the page in a browser of their own, the screen-reader worker's and the rule layer's, and until now the error read the same whichever of them refused. When the worker refuses, one line on stderr now names it and says what the rule layer did: refused the state too, accepted it, failed for another reason, or did not run (`--no-axe`, or imported results). The error's own message is unchanged, and the line carries nothing from the state, a header or the page.
