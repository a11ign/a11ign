---
---

The core's tests, docs checks and workflows stop reading `a11ign/lab`'s source (ADR 0045 cut 2, #5080). `packages/cli` gains `src/action/assert-action-report.ts`, the script `action-smoke.yml` runs, which ships in no tarball; nothing a consumer imports changes.
