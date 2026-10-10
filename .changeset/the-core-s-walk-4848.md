---
"a11ign": patch
---

Moves `@a11ign/toolchain` from the exact `0.7.0` to the exact `0.7.1`, the first release whose `lib/walk-scope` lists `expectFailure` and `getTestContext` (Node 24's two new `node:test` functions) in `NOT_WRAPPED.test`, and adds the same two entries to the core's `walk-scope.ts` copy so `walk-scope-copy-matches-toolchain.test.ts` and lab's `declared-walk-scope.test.ts` enumeration are green on Node 24 (#4848). The root, `cli`, `judge` and `scorer` move together (`toolchain-package.test.ts` requires one version across the four). Nothing else in the package changed.
