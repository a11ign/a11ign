---
"@a11ign/screenreader-fleet": patch
---

Declares `@a11ign/screenreader-worker` as `^0.1.0`, where it was the exact `0.1.0`: the worker is no longer a sibling in the workspace but a package from the registry, and the isolation gate refuses an exact pin to a non-sibling (#3447). Nothing else in the package changed.
