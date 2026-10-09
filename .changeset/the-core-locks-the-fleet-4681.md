---
"a11ign": patch
---

Locks `@a11ign/screenreader-fleet` at `^0.7.1`, the release whose `fleet-env` imports only `node:*` and `./worker-http.mjs`, so control (which runs no `npm install`) can load the laid fleet's `fleet-env.ts` without `@a11ign/toolchain` by package name (#4680, #4681). The lockfile moves the fleet's own dependencies with it: `@a11ign/judge` 0.1.0 to 0.5.1 and `@a11ign/evidence` 0.1.0 to 0.3.2. Nothing else in the package changed.
