`release.yml`'s `promote-action-tag` now writes `v<older>` for every `a11ign@<older>` that has none, not only for the highest version a promotion names. Backfilled `v0.5.2`.

- **Cause, read from the runs (measured 2026-10-09):** two different things, neither a skipped job.
  - **`v0.5.2` was never named by any promotion.** `a11ign@0.5.2` was cut 05:27Z and superseded by 0.5.3 before it qualified (`release-promote` at 08:29Z: `outcome=wait` for the 0.5.2 commit, `proceed` for 0.5.3). Run 37902742804's `PROMOTED` held only `a11ign@0.5.3`, and the step tags the highest promoted version only. A version leapt over never gets its tag.
  - **`v0.5.4` was only late.** Run 37942150845 wrote it at 14:26:37Z (`v0.5.4: was absent, now 90bb4f03…`), after the row's open-check was taken; it exists at `origin` now.
- **The fix:** after the promoted version's own tag, a loop over every `a11ign@x.y.z` at or below the promoted version creates `v<x.y.z>` at that tag's commit when absent. Newer versions (unqualified) and tags already present are left. Its first run will also write `v0.3.0` and `v0.3.1`, the only other bare ones.
- **Backfill:** `gh api -X POST repos/a11ign/a11ign/git/refs -f ref=refs/tags/v0.5.2 -f sha=01cce699b…` (the commit `a11ign@0.5.2` names), as `a11ign-ai-workers`.
- **Tests** (`outsider-release-tag.test.ts`, which runs the step against a stubbed `git` and `gh`): a bare older version is tagged at its own commit; a newer one and one already tagged are left; the control writes only the promoted tag. Writing the new tests first showed my first loop re-posting the promoted version's own tag (a 422, red), fixed by skipping it. **Mutation check, both directions:** loop never writes (fails 1 test), newer-guard removed (fails 1), existing-guard removed (fails 3), promoted-skip removed (fails 4); restored from a copy, `diff` identical.
- **`release-moves-major-tag.test.ts`** (which also runs the step) gained a `backfilled` expectation per scenario that carries a bare older tag, and its static guard accepts a POST of `v$older` and still refuses a PATCH of it (28 of 28 pass).
- 16 of 16 in the file pass; `release-promotes-by-evidence`, `layer-repository-protection` and `outsider-pin-refresh` pass (171 tests, 12 in the last).

Acceptance: git ls-remote --tags origin | awk '{print $2}' | grep -E 'refs/tags/v0\.5\.[0-9]+$' | sed 's#refs/tags/##' | tr '\n' ' '

Closes #4544

🤖 Generated with [Claude Code](https://claude.com/claude-code)
