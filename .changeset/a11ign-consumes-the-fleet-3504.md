---
"a11ign": patch
---

Declares `@a11ign/screenreader-fleet` as `^0.3.0`, where it was the exact `0.1.4`: the fleet package is no longer a sibling in the workspace but a package released from its own repository, and the isolation gate refuses an exact pin to a non-sibling (#3504). Nothing else in the package changed.
