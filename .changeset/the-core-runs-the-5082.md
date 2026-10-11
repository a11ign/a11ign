---
"a11ign": patch
---

Declares `@a11ign/screenreader-fleet` as `^0.9.0`, where it was `^0.7.3` (ADR 0045 cut 4, #5082): the core's root scripts now run that package's installed bins, `guest-run` and `normalise-fleet` among them, and `worker-fleet-delete.test.ts` holds one version of it under every importer, so `a11ign` moves with the root. `a11ign` imports the package's root and its `capture-client`, `cli-flags`, `health`, `probe-outcome` and `worker-http` exports, all of which 0.9.0 still carries.
