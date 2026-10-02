---
"@a11ign/lab": patch
---

**Nothing pushes `main` into a pull request branch any more (#3046).** The merge queue builds every PR on top of `main` and runs `ci` on that merge commit, so "up to date with main" added only a new head, a new CI run and a new reason to re-review: 123 of the 250 commits on the last 60 merged PRs (49%) were `Merge branch 'main' into ...`. `auto-arm.yml` loses its `update-branch` job (`arm`, `sweep` and `stalled` and every trigger stay), and the `pre-push` hook no longer refuses a push whose HEAD is merely behind `origin/main`; `A11Y_STALE_BASE_REASON` is deleted with the refusal. The 300-deletion warning still prints, and `resolve-toward-main` now names that it skipped a branch that is behind.
