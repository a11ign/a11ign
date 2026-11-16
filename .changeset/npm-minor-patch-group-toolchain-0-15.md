---
"a11ign": patch
"@a11ign/judge": patch
"@a11ign/scorer": patch
---

The optional `@axe-core/playwright` range moves from `^4.13.0` to `^4.14.0` (`a11ign`), and `a11ign`, `@a11ign/judge` and `@a11ign/scorer` are built and linted with `@a11ign/toolchain` 0.15.0 instead of 0.14.0. The toolchain bump is a 0.x minor, which this repository reads as breaking for the toolchain itself; it builds and lints these packages, so their published build output now comes from the newer build tooling (`@rslib/core` 1.0.5). No exported API changes in source, and the packages' own tests and build pass on it.
