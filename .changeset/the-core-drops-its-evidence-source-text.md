---
"@a11ign/evidence": minor
"a11ign": patch
---

`@a11ign/evidence` drops its `./source-text` subpath (`stripComments`): the helper lives in `@a11ign/toolchain/lib/source-text`, and `@a11ign/screenreader-fleet` 0.7.3, the last consumer of the subpath, imports it from there. A consumer of `@a11ign/evidence/source-text` imports it from the toolchain instead. `a11ign` raises its `@a11ign/screenreader-fleet` floor to `^0.7.3`, the first release that does not import the removed subpath (#4712, #4589, #4711, #4425 phase 3).
