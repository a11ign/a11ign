Moves the guarded docs' release pins to a11ign@0.10.10 (commit e25f984530fc82dbfdc90a877f67f61265b5f87b), the release `v0` points at. Written by `docs-pin-write.yml` (#5224); the file is generated, never edited by hand.

Acceptance:
pnpm exec rstest run --config scripts/rstest/rstest.config.ts packages/guards/src/docs-release-pin-currency.test.ts packages/guards/src/outsider-job-fresh.test.ts packages/guards/src/generate-consumer-gate.test.ts
