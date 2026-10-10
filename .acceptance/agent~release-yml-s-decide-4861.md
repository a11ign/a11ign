`release.yml`'s `decide-outsider-pin` job runs `scripts/outsider/generate.ts`, which imports `scripts/repo-identity.ts`, and never cloned the tool, so on a runner it died on `ENOENT /home/agent/repos/agent-org/package.json` (run 38065151444, at `adcc8fc74`). The job gains the clone step `guards` and `decide` already carry, verbatim, between `pnpm install` and the step that needs it; and a guard derives, from the import closure, every job that runs a script reaching `repo-identity.ts` and requires the clone step before it.

**What moved:**
- `.github/workflows/release.yml`: one step added to `decide-outsider-pin`, `node scripts/agent-org-newest-tag.ts --dest="$RUNNER_TEMP/agent-org"`.
- `packages/guards/src/release-jobs-clone-the-tool.test.ts` (new): the guard, with its positive control (below).

**Not done here, and why:** done-when 2 (a `release.yml` run on `main` after the merge, whose `decide-outsider-pin` log shows `WRITE` or `keep`) is `gh workflow run release.yml --ref main -R a11ign/a11ign` AFTER the merge, which this pull request cannot do before it exists. It is named on the row.

platform: nothing built; the step is the one the other two jobs carry, and the reach comes from `@a11ign/toolchain/lib/local-import-closure`.

Acceptance: `bash -c 'f=.github/workflows/release.yml; awk "/^  decide-outsider-pin:/,/^  refresh-outsider-pin:/" $f | grep -q "agent-org-newest-tag.ts --dest" && npx rstest run --config=scripts/rstest/rstest.config.ts packages/guards/src/release-jobs-clone-the-tool.test.ts'`

## Evidence

Measured at this head: the awk/grep line exited 0 and the rstest run printed `VERDICT pass: 4 tests in 1 file`. Measured, by deriving it: the jobs the rule applies to are `guards` (`scripts/generate-consumer-gate.ts`), `decide` (`scripts/release-promote.ts`) and `decide-outsider-pin` (`scripts/outsider/generate.ts`); `scripts/agent-org-newest-tag.ts` itself does not reach `repo-identity.ts`, so no job is unsatisfiable. Measured: `git show adcc8fc74:.github/workflows/release.yml` equals this file with the new step removed, byte for byte, so the control that removes the step IS the job as it stood when run 38065151444 failed.

Closes #4861

Mutation: each restored from a `cp` copy, `diff` empty.
- Never fires (`reachesIdentity` returns `false`): `the jobs the rule applies to are derived...` and `removing the clone step from any one needing job faults exactly that job...` failed (2 of 4); the real-workflow test stayed green, as it must.
- Always fires (`cloned` is always `false`): `every release.yml job ... clones the tool in an earlier step` and the `removing ...` test failed (2 of 4).
- The workflow without the new step (`release.yml` as at `adcc8fc74`): `every release.yml job ...`, `removing ...` (no clone step left to remove, so the control refuses to be built) and `a clone step AFTER ...` failed (3 of 4), and the awk/grep line exits 1.
