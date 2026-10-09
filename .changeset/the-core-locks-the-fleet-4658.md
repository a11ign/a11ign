---
"a11ign": patch
---

Locks `@a11ign/screenreader-fleet` at `^0.7.0`, the release whose `worker-code-check` resolves the layer clone's hasher as `code-version.ts` or `code-version.mjs`, where 0.6.0 imported only the `.mjs` the worker layer no longer ships (#4651, #4658). The fleet re-exports its flag guard from `@a11ign/toolchain/lib/cli-flags`, which first shipped in `@a11ign/toolchain` 0.5.0, so the root, `cli`, `judge` and `scorer` move from the exact `0.1.4` to the exact `0.5.0` together (`toolchain-package.test.ts` requires one version across the four). Nothing else in the package changed.
