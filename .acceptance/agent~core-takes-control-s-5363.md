## What

control's `entry-points.test.ts` (#1086) carried one test core's port (#5348) left behind: `the two populations are counted SEPARATELY and must not overlap or lose a file`. It is ported into `packages/guards/src/entry-points.test.ts` as a new test after the symlink-blind ratchet, using the file's own `trackedSources`, `executableSource`, `guardIsPlain` and `guardIsRealpathd`. It asserts three things the ratchet does not: no file is in both the plain and the realpath'd populations; plain plus realpath'd equals every file that compares against `process.argv[1]`; and the realpath'd population is non-empty. It has the positive controls the file's other tests use (`scripts/ci-changed.ts` in the plain population, `scripts/changeset-untracked-check.ts` in the realpath'd one) and a non-empty control on the plain population for the overlap check. Test-only: no source file changed.

Why it is not redundant: the ratchet reads only the plain population, so an empty realpath'd population, or one overlapping the plain population, is invisible to it. The sum check catches a file that carries the argv comparison but that neither predicate admits, which the suffix and concatenation checks in core do not read.

## Evidence

- **Acceptance, on this branch: exit 0.** The string `counted SEPARATELY` is in the file. The row's own Acceptance greps `origin/main`, which cannot hold the sentence until this lands, so it is true only after the merge; the file's Acceptance below is the same grep on this branch's copy of the file.
- **Tests, `pnpm exec tsx --test packages/guards/src/entry-points.test.ts`:** `tests 7, pass 7, fail 0` (the six existing tests and the new one). The new test was not run before the change, since it did not exist; the mutations below show it fails when the populations break.
- **Mutations (each restored byte-identical from a backup, checked with `diff`):**
  - realpath pattern never matches (`guardIsRealpathd`): the new test fails on its realpath'd control; the earlier recommended-form test also fails, as it should.
  - plain pattern never matches (`guardIsPlain`): the new test fails on its plain control, plus the ratchet and the two predicate tests.
  - plain predicate no longer excludes realpath'd files (overlap): the new test fails; the ratchet and the bin test also fail.
  - plain predicate drops the one-line `href) main` spelling (lost files, controls intact): the new test fails on the sum check with `6 plain + 46 realpath'd should be every one of the 58 files`; the ratchet also fails.
- **`pnpm run typecheck`: exit 0.** **`eslint packages/guards/src/entry-points.test.ts`: exit 0.** (The first lint run flagged the overlap assertion as unguarded by a non-empty control; the control is now there.)
- **`pnpm run test:org`: exit 0**, `VERDICT pass: 1302 tests in 92 files (1 skipped)`.

Mutation: four breaks of the predicates, each restored from a backup and `diff`ed byte-identical. An empty realpath'd population turns the new test red on its realpath'd control (the recommended-form test also goes red; the ratchet does not). An empty plain population turns the new test red on its plain control, and the ratchet and the predicate tests go red with it. An overlap (plain admitting realpath'd files) turns the new test red on the overlap check. Dropping the one-line `href) main` spelling from the plain predicate turns it red on the sum check (`6 plain + 46 realpath'd should be every one of the 58`), with the controls intact.

Acceptance:
```
bash -c 'git grep -q "counted SEPARATELY" -- packages/guards/src/entry-points.test.ts'
```
