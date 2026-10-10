---
---

The core deletes its `scripts/test-support/git-sandbox.ts` and `packages/guards/src/test-memory-cap.ts` and imports both from `@a11ign/toolchain/lib/<stem>` (0.7.0, already pinned), so each has one source: the toolchain's. No shipped package changes: the importers are the core's guard tests, `assert-glob-not-empty.ts` and the pre-push hook, which now runs `node_modules/@a11ign/toolchain/dist/lib/test-memory-cap.mjs` (#4590, #4425 phase 3).
