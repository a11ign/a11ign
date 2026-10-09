## What

The auth spike's two entry guards (#4087) compared `import.meta.url` with `pathToFileURL(process.argv[1])` raw, so a launch through a symlink never matched and the `main` block silently did not run. control's entry-points ratchet (`KNOWN_PLAIN_ENTRY_GUARDS`, #1086) refuses that form to grow, and it had grown by two (#4575 was red on it). Each guard now realpaths `argv[1]` first: `attach-spike.ts` (the `argv[1] ?? ""` form, with the empty case guarded so `realpathSync("")` is never called) and `fixtures/serve-cross-origin-idp.ts` (its existing `argv[1] &&` prefix kept). `realpathSync` is imported from `node:fs` in each. Neither file is in the published build (`packages/cli/tsconfig.json` excludes both), so the changeset is a no-release note. Nothing else touched; the ratchet baseline is not edited.

## Evidence

- **Acceptance, at this head: exit 0.** At `origin/main` (`41ad9a17e`) the same grep finds 0 occurrences of `realpathSync(process.argv[1]` in both files, so it fails before the change.
- **Symlink launch, measured.** Each file and a symlink to it, run as `node --import tsx <symlink>`, in a scratch directory. The pre-change copies are `git show origin/main:…`:
  - before: `attach-spike` exits 0 silently, `serve-cross-origin-idp` exits 0 silently (the `main` block never runs);
  - after, through the symlink: `attach-spike` prints its usage line and exits 2, `serve-cross-origin-idp` prints its `--out <dir> is required` usage and exits 1, the same as a direct launch.
- **The two files' own tests, with `pnpm exec tsx --test`** (both are `node:test` files, so rstest reports "No test suites found"; that is the runner, not the change). `attach-spike.test.ts`: `tests 10, pass 10, fail 0`. `serve-cross-origin-idp.test.ts`: `tests 12, pass 12, fail 0`.
- **`pnpm run typecheck`: exit 0.** **`eslint` on the two files: 0 errors**, three `no-magic-numbers` warnings, none on a changed line.
- **Guard tests that read `.changeset/`** (the ten files `git grep -l '\.changeset'` finds under `packages/guards`), `tsx --test`: `tests 277, pass 277, fail 0`.

Acceptance:
```
bash -c 'for f in packages/cli/src/auth/attach-spike.ts packages/cli/src/auth/fixtures/serve-cross-origin-idp.ts; do grep -q "realpathSync(process.argv\[1\]" $f || exit 1; done'
```
