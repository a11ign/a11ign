---
---

`@a11ign/toolchain` moves from `0.1.2` to `0.1.3` in the root, `cli`, `judge`, `lab` and `scorer`, and `cli`, `judge` and `scorer` stop writing `cleanDistPath: false` in their own `rslib.config.ts`, because the released `libraryPreset` carries it (#3824). A devDependency and build config only: what each package exports and ships is unchanged.
