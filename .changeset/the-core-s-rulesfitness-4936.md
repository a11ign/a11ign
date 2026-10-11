---
"@a11ign/judge": patch
---

The core's rules-fitness check (`pnpm run rules-check`) now lives in `@a11ign/judge`'s source tree and reads its own cases and fixtures from `src/fitness/`, where it read the lab's (#4936, epic #4425). Nothing under `src/fitness/` is in the package: `files` is still `dist`, `README.md` and `LICENSE`, and `dist` is unchanged.
