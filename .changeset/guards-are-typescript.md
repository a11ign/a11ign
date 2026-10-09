---
---

`packages/guards` is TypeScript (#4273, sweep 1 of 3): 79 `.mjs` files became `.ts` by the toolchain's `js-to-ts` script, and `mjs-ratchet.baseline.json` fell from 190 files to 111. `@a11ign/guards` is private, so no published package gains or loses anything. 17 guards files stay `.mjs`: 16 because a plain `node` runs them or loads them by path (ADR 0043 Decision 8), and `mutation-check.mjs` because the unit-test coverage gate reads a child process's coverage from the source file, which it cannot parse as TypeScript.
