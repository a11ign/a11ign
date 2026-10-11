---
---

The core stops reading the worker's source and stops laying it (ADR 0045 cut 6, #5084). The provision stamp's `$RUN_SERVER` resolves to `launcher/run-server.cmd` inside the installed `@a11ign/screenreader-worker` 0.13.0, `prepare` and `build` no longer run `lay-layer.ts nvda-worker`, and the root declares the worker at `^0.13.0`. Only comments in `packages/cli`, `packages/evidence` and `packages/judge` moved; nothing a consumer imports changes.
