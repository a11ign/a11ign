---
"a11ign": patch
---

Locks `@a11ign/screenreader-fleet` at `^0.7.2`, the release whose `cli-flags` imports only `node:*` instead of re-exporting `@a11ign/toolchain` by package name, so control (which runs no `npm install`) can load every fleet module it imports (#4686, #4687). Nothing else in the package changed.
