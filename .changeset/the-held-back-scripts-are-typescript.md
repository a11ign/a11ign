---
---

The held-back `.mjs` are TypeScript (#4393, follows #4274): 34 files became `.ts` by the toolchain's `js-to-ts` script (12 under `scripts/`, 17 under `packages/guards/src/`, the `scripts/rstest/` config, and the four packages' `isolation-smoke`), run as `node <file>.ts` now that the host and CI strip types. `mjs-ratchet.baseline.json` fell from 47 files to none, and keeps 12 reasoned exceptions: `.pnpmfile.cjs`, `eslint.config.js`, and the ten PACKAGE files of the isolation fixtures, which stay `.mjs` because Node refuses to strip types under `node_modules` (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`). The isolation gate's consumer is now `"type": "module"`, since a `.ts` smoke no longer says so by its extension. Nothing published changes.
