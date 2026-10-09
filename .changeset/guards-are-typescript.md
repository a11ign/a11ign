---
---

`packages/guards` is TypeScript (#4273, sweep 1 of 3): 80 `.mjs` files became `.ts` by the toolchain's `js-to-ts` script, and `mjs-ratchet.baseline.json` fell from 190 files to 110. `@a11ign/guards` is private, so no published package gains or loses anything. 16 guards files stay `.mjs` because a plain `node` runs them or loads them by path (ADR 0043 Decision 8).
