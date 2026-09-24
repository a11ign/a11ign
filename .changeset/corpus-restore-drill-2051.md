---
"@a11ign/lab": patch
---

**A corpus release can now be verified by REBUILDING a lab from it, not just by counting the tarball** (`packages/lab/src/packaging/corpus-restore-drill.mjs`, #2051). It restores a snapshot into a scratch tree, regenerates `pages/` and the manifest as a lab does, counts every member with `find -L` against the live tree and states the difference, and runs the real `check-signals` off the result. Measured on the 2026-09-24 03:00Z release: 8,507 JSON restored, gate PASS over 1,631 cases; restored alone, with no regenerated pages, the same tree reads every case as stale.
