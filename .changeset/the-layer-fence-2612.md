---
"@a11ign/nvda-worker": patch
---

**`@a11ign/nvda-worker` exports `./auth-flow` and `./windows-trim`, and its tests no longer reach into sibling packages by path (#2612, child 1 of #69).** The two modules were read by relative path from tests that compare them with `cli`'s `flows.ts` and `worker-fleet`'s `build-lean-worker-image.ps1`; those parity assertions moved to `lab` and `worker-fleet`, which read the worker by package name. No runtime behaviour changes.
