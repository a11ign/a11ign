The release reads the lab's `qualification` status from the managers App too (#5057, child of #5044 step 2).

`QUALIFICATION_WRITERS` is the list of the two logins that may say `qualification`: `QUALIFICATION_WRITER`, the user account `a11ign-ai-leads`, kept until a live status from the App is read, and the new `QUALIFICATION_WRITER_APP`, `a11ign-managers[bot]`, the managers App the lab's host posts as since a11ign#4911. The existing export keeps its name and its meaning, so nothing origin/main exports is removed (the pre-push resolve check refuses a removal). A status from anyone else is still ignored and named in the log, in either direction. The shape pin admits a `[bot]` suffix and still refuses an empty login and a bare suffix.

The guard test gains the controls the row names: POSITIVE CONTROL (a `success` from the App qualifies), a `failure` from the App is not softened by an older App `success`, a forged `success` does not soften an App `failure`, and NEGATIVE CONTROL (a creator-less status never counts).

Mutation, both directions, run on this head with the repo's rstest config. Remove the App entry: 5 red, the POSITIVE CONTROL and the two App-`failure` tests and the order test and the identity pin among them. Break the shape pin (drop `[bot]`): 1 red, the shape pin. Make the identity check always fire: 7 red, the forged, another-identity and creator-less tests. Each restored from a copy and compared byte-identical.

platform: nothing new; the decision reuses the existing `qualificationStatusesFrom` filter and its tests.

Acceptance: `bash -c 'git grep -q "POSITIVE CONTROL" -- packages/guards/src/release-promotes-by-evidence.test.ts && git grep -q "NEGATIVE CONTROL" -- packages/guards/src/release-promotes-by-evidence.test.ts && pnpm exec rstest run --config scripts/rstest/rstest.config.ts packages/guards/src/release-promotes-by-evidence.test.ts'`

The row's own command, `pnpm exec rstest run <file>` without `--config`, prints "No test suites found" for this file: the file imports `test` from `node:test`, which the repo's rstest config is what runs. The `--config` form is the one every guard test uses (`assert-glob-not-empty.ts` passes it), so the Acceptance here names it.

Closes #5057
