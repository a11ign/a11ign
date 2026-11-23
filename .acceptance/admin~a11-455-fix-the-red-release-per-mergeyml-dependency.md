Closes A11-455

Moves `release.yml`'s `release` job call to `a11ign/toolchain/.github/workflows/release-per-merge.yml` from `f8bddcf9b62616c3b4749db8cefef1173f09cad1` to `aeff9f16c34058676959edbb1dc231ec39ea8ed9`: the same one-line change as Dependabot's a11ign/a11ign#5741, which this supersedes. #5741's `gate` stays red on a stale run that read Dependabot's original body, and clearing it needs a rerun no worker may start.

What the command proves: the `release` call is pinned to the new full sha and still passes `kind: npm`, the only input the called workflow requires at `aeff9f16`; and the guard that pins the call's shape (a full-sha pin, `dist-tag: next`) passes. It fails on `main`, where the pin is still `f8bddcf9`.

Acceptance:
grep -qx '    uses: a11ign/toolchain/.github/workflows/release-per-merge.yml@aeff9f16c34058676959edbb1dc231ec39ea8ed9' .github/workflows/release.yml && grep -qx '      kind: npm' .github/workflows/release.yml && pnpm exec rstest run --config=scripts/rstest/rstest.config.ts --include packages/guards/src/release-publishes-to-next.test.ts
