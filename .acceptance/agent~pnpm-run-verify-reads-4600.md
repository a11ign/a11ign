`pnpm run verify` now hands agent-org's `checkBody` the paths the branch ADDS, so its `acceptance` step reads the `.acceptance/` file a branch adds (ADR 0044) as `pr:open` and CI do, instead of printing `ACCEPTANCE: MISSING` from a body that holds none.

- **Cause (read in the code):** `runAcceptance` passed `diff: { ok: true, files }` with no `added`, so agent-org's `acceptanceSourceOf` found no added `.acceptance/` file and fell back to the body.
- **The fix:** `scripts/verify-acceptance-source.ts` exports `acceptanceDiffOf({ files, added, exists })`; `runAcceptance` takes `added` from `git diff --name-only --diff-filter=A <base>...HEAD` and passes `readFile` to `checkBody`. No-file and two-file branches still go through `checkBody` itself.
- **Tests:** `scripts/verify-acceptance-source.test.ts`, 4 of 4 pass.

Acceptance: bash -c 'node --test scripts/verify-acceptance-source.test.ts && grep -q "acceptanceDiffOf" scripts/verify.ts'

Closes #4600

🤖 Generated with [Claude Code](https://claude.com/claude-code)
