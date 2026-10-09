---
"a11ign": minor
---

**New command: `a11ign <url> --compare-axe` runs axe-core and a11ign on one page and prints what each found, keyed by WCAG criterion.** It prints three lists, **axe only**, **a11ign only (screen-reader findings axe cannot make)** and **both**, then one line stating how many of the A/AA criteria a11ign fully assesses and how many of those by a deterministic rule, read from `criterion-coverage.ts`. A criterion a11ign asserts is marked `asserted`; one it refers to a person is marked `referred`. With no capture worker the axe half still runs and the command says a11ign did not run, rather than printing an empty list as "nothing added" (and the same the other way round if axe is unavailable). It compares one page and does not sign in.

`a11ign --help` now prints the usage on stdout and exits 0; before, it was read as a flag with no page and ended in an error.
