The re-pin writer's `regenerate` job DID run the consumer-gate generator and its `--check` passed (run 38453561679), and the pull request still carried a stale `.github/workflows/consumer-gate.yml`. **Cause, read off that run's log:** `actions/upload-artifact` leaves hidden files out by default (`include-hidden-files: false`), the `files-regenerated` upload printed "there will be 1 file uploaded" (`outsider-job.yml`), and `.github/` is a hidden directory, so the consumer gate never reached `write`. Neither "the writer does not run consumer-gate" nor "it ran with the pin kept" was the cause.

Change (`docs-pin-write.yml`): the upload sets `include-hidden-files: true`; `regenerate` declares the files it changed as an output and `write` refuses a delivery short of them, so a dropped file is a red job and never a red pull request. Test (`docs-pin-write.test.ts`): the generators that read README's fence are derived from the scripts (read the root README through `README_PATH`, write a file) and asserted RUN by the `regenerate` job, a `--check` line not counting; the hidden-directory upload and the declared-files refusal are pinned; the regenerated consumer gate names the promoted release wherever the committed one named the previous one.

**Measured at this head:** `pnpm exec rstest run` over the two files below passes 47 tests; `pnpm run typecheck` is clean; eslint on the test reports 0 errors.

**Mutations** (each applied to `docs-pin-write.yml`, run, restored byte-identical with `diff`):
- drop `include-hidden-files: true`: turns red the hidden-directory test and no other.
- delete the consumer-gate run but keep its `--check` line: turns red the every-generator test and the older wiring test, and the control test that mirrors it.
- drop the declared-files loop in `write`: turns red the declared-files test and no other.
- delete the outsider generator run: turns red the every-generator test and the older wiring test.
- a fixture third generator the workflow does not run: named by the enumeration (`generatorsNotRun`), in the control test.

**Not done here (named):** the `decide` job's `docs-repinned` upload keeps the default, since a guarded doc cannot sit under a hidden directory; the first live re-pin after this merges is the real proof and is not run here.

Acceptance: pnpm exec rstest run --config scripts/rstest/rstest.config.ts packages/guards/src/docs-pin-write.test.ts packages/guards/src/generate-consumer-gate.test.ts

Closes #5469
