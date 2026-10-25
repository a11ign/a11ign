A11-252 (https://linear.app/a11ign/issue/A11-252/replace-lockfile-and-dependency-list-snapshot-tests-with-invariants), a11ign's part. `packages/judge/package.json`'s optional `@anthropic-ai/sdk` peer goes from `>=0.106.0 <0.134.0` to `>=0.106.0`. The upper bound was a hand-written snapshot that failed on every later SDK minor; compatibility is shown by this repository's suite running on the bumped SDK. `pnpm-lock.yaml` does not change.

Acceptance:

```bash
grep -n '"@anthropic-ai/sdk": ">=0.106.0",' packages/judge/package.json
pnpm install --frozen-lockfile --ignore-scripts
pnpm exec rstest run --config scripts/rstest/rstest.config.ts --include 'packages/guards/src/{dependency-changeset,declared-versions-match-lockfile,lockfile-in-sync,pnpm-workspace}*.test.ts'
```

**What the block shows:** the grep finds the floor-only peer, the frozen install accepts the lockfile unchanged, and the four guards that read manifests and the lockfile pass (58 tests).
