---
---

`scripts/` is TypeScript (#4274, sweep 2 of 3): 55 `.mjs` files became `.ts` by the toolchain's `js-to-ts` script, run as `node --import tsx scripts/<name>.ts`, and `mjs-ratchet.baseline.json` fell from 111 files to 56. Nothing published changes. 29 `scripts/` files stay `.mjs`: the 13 a job runs before `pnpm install` (plain `node`, no `tsx` yet) and the 16 isolation fixtures; `eslint.config.js` stays `.js` because ESLint cannot read a TypeScript config without `jiti`.
