The consumer gate's step *npx a11ign <url>, from the clean install* (`.github/workflows/registry-consumer-gate.yml`) looks for the worker's script as `dist/server.mjs` first and `src/server.mjs` second, in each of the two package directories (`screenreader-worker`, then the old-name `nvda-worker`). `@a11ign/screenreader-worker` 0.13.0 publishes `dist` and `launcher` and no `src/`; the published `a11ign@latest` (0.10.2 -> fleet 0.9.0 -> worker 0.9.0, measured 2026-10-12 with `npm view`) still has `src/server.mjs`, so the gate stays green against `latest` and against a tree carrying 0.13.0.

- **Measured** (the step's lookup loop, verbatim, run in four scratch layouts): worker 0.13.0 layout (`dist/server.mjs` only) -> `node_modules/@a11ign/screenreader-worker/dist/server.mjs`; old-name layout (`nvda-worker/src/server.mjs` only) -> that path; both present -> the `dist` one; empty `@a11ign` -> `NONE` (the step's `::error::`).
- **Measured** (`git grep -c 'dist/server.mjs'` on `HEAD:` the file): 0 before, 1 after; `yaml.safe_load` parses the file.
- **Not measured:** a run of the workflow (it installs from the registry on a runner); CI's first run of the gate after this merges is the live reading.

Acceptance: bash -c 'git grep -q "dist/server.mjs" -- .github/workflows/registry-consumer-gate.yml'

Mutation: the Acceptance command against `HEAD:.github/workflows/registry-consumer-gate.yml` exits 1 (no `dist/server.mjs`); against the edited file it exits 0.

Closes #5317
