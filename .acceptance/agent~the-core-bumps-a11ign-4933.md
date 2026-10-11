`@a11ign/toolchain` moves from `0.7.1` to `0.9.0` in the root, `cli`, `judge` and `scorer` manifests and `pnpm-lock.yaml` (the lock diff is the toolchain lines alone), and `scripts/ci-changed.ts` and `packages/guards/src/ci-changed.test.ts` drop the `ansible` category (cherry-pick of `98680e172`, unchanged: the published `dist/lib/ci-changed.mjs` has 0 matches for `ansible`, so the copy follows the commit). A changeset with empty frontmatter records the devDependency-only bump, as #3824 did.

**Release used** (measured 2026-10-11, `npm view @a11ign/toolchain dist-tags --json`): `{"reserved":"0.0.0-reserved.0","latest":"0.9.0"}`.

**Copy test against the new pin** (measured, this head, `node_modules/@a11ign/toolchain` is 0.9.0): `VERDICT pass: 6 tests in 1 file` for `bootstrap-copies-gate-match-toolchain.test.ts`; with `ci-changed.test.ts` alongside, `VERDICT pass: 41 tests in 2 files`.

Acceptance: `bash -c '! grep -qE "ansible[:=]" scripts/ci-changed.ts packages/guards/src/ci-changed.test.ts' && bash -c '! grep -q "\"@a11ign/toolchain\": \"0.7.1\"" package.json packages/cli/package.json packages/judge/package.json packages/scorer/package.json' && npx rstest run --config scripts/rstest/rstest.config.ts packages/guards/src/bootstrap-copies-gate-match-toolchain.test.ts packages/guards/src/ci-changed.test.ts` exits 0, with 41 tests passing.

Mutation: restoring the `ansible` category in `scripts/ci-changed.ts` only (the reverse of that file's part of `98680e172`) turns `bootstrap-copies-gate-match-toolchain.test.ts` red (`VERDICT fail: 2 of 6 tests failed`); restored byte-identical (`diff` empty) from a `cp` backup, it reads `VERDICT pass: 6 tests in 1 file` again.

platform: nothing built; a pin bump and a copy brought in line with it.

Closes #4933
