`entry-points.test.ts` and `criteria-counts-are-not-spelled-out.test.ts` leave the guard sweep: each drops its `declareTreeWideGuard()` call and the import of it, and its header states why it is not on the sweep and why neither is an ESLint rule (#5560). Both stay plain `ts` tests, which the `ts` job already runs on any change to TypeScript.

- **Before, measured on HEAD:** `git grep -c "declareTreeWideGuard(" HEAD -- <both files>` reads 1 in each, and the grep gate exits 0 on HEAD, so the Acceptance's first half fails there.
- **After, measured:** `node packages/guards/src/tree-wide-guards.ts` prints 3 files, and neither of the two is among them.
- **Guard tests:** rstest on both files: `VERDICT pass: 9 tests in 2 files`.
- **Lint and types:** `eslint` on both files exits 0 with one warning that was already there (`no-magic-numbers` on the `files.length >= 40` floor, a line this change does not touch). `pnpm run typecheck` exits 0.

Acceptance: bash -c '! git grep -q "declareTreeWideGuard(" -- packages/guards/src/entry-points.test.ts packages/judge/src/criteria-counts-are-not-spelled-out.test.ts && npx rstest run --config scripts/rstest/rstest.config.ts --include packages/guards/src/entry-points.test.ts --include packages/judge/src/criteria-counts-are-not-spelled-out.test.ts'
