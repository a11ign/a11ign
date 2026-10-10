---
"a11ign": patch
"@a11ign/judge": patch
---

The core's guards and tests import `local-import-closure` and `tree-wide-guard` from `@a11ign/toolchain/lib/<stem>`, and the core's own copies of both are deleted, so each has one source (#4718, #4425 phase 3). `walk-scope` stays a declared copy: the toolchain's `REPO_ROOT` is the directory it is installed in, so as the rstest preload it observes no read of this repository.
