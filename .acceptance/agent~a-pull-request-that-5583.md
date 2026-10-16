A PR that edits the reusable build-and-test workflow now runs the `ts` and `python` jobs that call it, so the change is exercised before merge (#5583).

`scripts/ci-changed.ts` classified a diff touching only `.github/workflows/reusable-build-test.yml` as `ts=false python=false`, so the jobs that call that file were skipped on the PR that edits it. The file is now named in `ROOT_TS_FILES` (the `ts` trigger, the same route `action.yml` takes) and in the `python` input list. It is named, not a glob over `.github/workflows/`, so `reusable-acceptance.yml` stays `ts=false` under `pull_request` (the existing pin in `ci-changed.test.ts`).

The side effect of the `ROOT_TS_FILES` route: a diff touching the reusable file marks every package as touched, the same over-approximation `action.yml` already makes. Nothing in a workflow consumes the `packages` output, so only the classifier's own reading changes.

Why not a new `||` in `classify`: `classify` sits at complexity 15, the limit, and CI's lint gate blocks an error. The `python` check lives in its existing `files.some` callback, so it adds nothing to `classify`'s own complexity.

Open-check: the row's own check (`node scripts/ci-changed.ts --event=pull_request --base=origin/main` on a branch whose only change is the reusable file) cannot be run on this branch, because this branch also changes the classifier. The CLI case in `ci-changed.test.ts` runs the real script against a real git diff of exactly that file and asserts `ts=true python=true`.

## Mutation

Each guard was broken on its own, then restored with `cp` and checked with `cmp`:

- the reusable file removed from `ROOT_TS_FILES`: 2 of 37 fail (the classify case and the CLI case), so the `ts` assertion is pinned.
- the reusable file removed from the `python` callback: 2 of 37 fail, so the `python` assertion is pinned.
- every `.github/workflows/` file added to the `python` callback: 1 of 37 fails (the `board-report.yml` control), so the widening is caught.

Acceptance:
```bash
git grep -q "reusable-build-test.yml" -- scripts/ci-changed.ts && git grep -q "reusable-build-test.yml" -- packages/guards/src/ci-changed.test.ts && pnpm exec rstest run --config=scripts/rstest/rstest.config.ts --include packages/guards/src/ci-changed.test.ts
```

Closes #5583

🤖 Generated with [Claude Code](https://claude.com/claude-code)
