Regenerates `consumer-gate.yml`'s pin to the commit that last changed `action.yml`. Written by `consumer-gate-pin.yml` (#4331, #5212); the file is generated, never edited by hand.

Acceptance:
pnpm exec rstest run --config=scripts/rstest/rstest.config.ts --include packages/guards/src/generate-consumer-gate.test.ts
