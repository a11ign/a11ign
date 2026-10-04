---
"a11ign": patch
---

`a11ign` now depends on `@a11ign/documents` by the range `^0.1.0`, the version `a11ign/documents` published, instead of the monorepo's workspace copy, which is deleted (#3125, move 6 of #69). A consumer installs the registry package, as the registry-consumer gate reads it.
