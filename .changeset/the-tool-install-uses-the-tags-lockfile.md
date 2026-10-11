---
---

`scripts/agent-org-newest-tag.ts` installs the tool's dependencies in CI from the tag's own `pnpm-lock.yaml` (`npx pnpm@10.34.5 install --frozen-lockfile --ignore-scripts`, the version agent-org pins, never the job's own pnpm), and keeps `npm install --no-package-lock` only for a tag with no lockfile. The fresh npm resolution crashed on agent-org v0.155.0 and made every PR and `auto-arm` red (#4988). Nothing published changes.
