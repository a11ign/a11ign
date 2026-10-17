Moves the guarded docs' release pins to a11ign@0.10.14 (commit 493b0285acc150251d6fb9a05114e87f98fb3159), the release `v0` points at. Written by `docs-pin-write.yml` (#5224); the file is generated, never edited by hand.

History: full

The `History: full` line is there because `generate-consumer-gate.test.ts`'s #4153 real-tree case runs `git diff <pin> origin/main -- action.yml`, and the pin is a commit of `main` that the `acceptance` job's depth-1 clone does not hold (`fatal: bad object <pin>`, #5651). `git fetch --unshallow origin main` does.

Acceptance:
pnpm exec rstest run --config scripts/rstest/rstest.config.ts packages/guards/src/docs-release-pin-currency.test.ts packages/guards/src/outsider-job-fresh.test.ts packages/guards/src/generate-consumer-gate.test.ts
