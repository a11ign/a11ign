`docs-pin-write.yml` writes an acceptance file for every re-pin that runs `generate-consumer-gate.test.ts`, whose #4153 real-tree case diffs `action.yml` from the pin's commit. The `acceptance` job's depth-1 clone does not hold that commit, so #5651 went red on `fatal: bad object 287b1ed4...` (run 38947499906). The generated file now carries `History: full`, so the job unshallows before running.

Acceptance:
pnpm exec rstest run --config scripts/rstest/rstest.config.ts packages/guards/src/docs-pin-write.test.ts
