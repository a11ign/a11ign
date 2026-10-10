---
"a11ign": patch
"@a11ign/judge": patch
"@a11ign/scorer": patch
---

The core's tests and guards import the helpers they share with the toolchain (`fixture-symbols`, `product-home`, `sandbox-exhaustion`, `source-text`, `walk-scope-declaration`, `walk-scope-discovery`, `worktree-resolution`) from `@a11ign/toolchain/lib/<stem>`, and the core's own copies of six of them are deleted. The `@a11ign/toolchain` devDependency moves to 0.7.0 in the root, `a11ign`, `@a11ign/judge` and `@a11ign/scorer` (#4589, #4425 phase 3). `@a11ign/evidence` is unchanged: it keeps its `./source-text` subpath until the fleet stops importing it (#4712).
