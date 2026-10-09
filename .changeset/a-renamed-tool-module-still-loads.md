---
---

`toolPath`/`toolUrl`/`toolModule` in `scripts/agent-org-newest-tag.ts` take a module named `.mjs` that the tool holds as `.ts` (and the reverse), so agent-org's rename of its modules (agent-org#435, #4389) no longer breaks `pnpm run verify` (#4394). Nothing published changes.
