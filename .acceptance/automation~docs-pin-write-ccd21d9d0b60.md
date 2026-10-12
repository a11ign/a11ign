Moves the guarded docs' release pins to a11ign@0.10.2 (commit ccd21d9d0b6088caeff375fa91d3efe0897cb839), the release `v0` points at. Written by `docs-pin-write.yml` (#5224); the file is generated, never edited by hand.

Acceptance:
pnpm exec rstest run --config scripts/rstest/rstest.config.ts packages/guards/src/docs-release-pin-currency.test.ts
