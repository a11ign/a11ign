Nine files in `packages/guards/src` and `packages/cli/src/auth/attach-spike.ts` no longer say `--import tsx` (Node 24 strips types since #4389). Where a line was ABOUT the loader it was read first:

- `coverage-failure-classifier.test.ts`, `stale-dist-diagnosis.test.ts`: the assertion is on the usage line the script in `scripts/` prints, which still names its loader until #4697/#4698 land. The regex now accepts the line with or without `--import <loader>`, so it is green before and after those slices.
- `layer-edges.test.ts`, `mutant-survivors.ts`: the comment said a bare `node` cannot run TypeScript, which is no longer true; the spawn still hands the loader explicitly (unchanged), and the comment now says that is so it does not depend on the interpreter's type stripping.
- `layer-repository-protection.test.ts`: the fixture script no longer names a loader; the case still expects `does not run rstest`.
- The other four are prose or fixture strings and lose the loader words.

Acceptance: bash -c '! git grep -qE -- "--import[= ]\S*tsx" -- packages/cli/src/auth/attach-spike.ts packages/guards/src'

Mutation: broke the `stale-dist-diagnosis.test.ts` usage regex (`node` to `nodeX`): 11 passed and 1 failed against 12 passed unmutated; restored byte-identical (`diff` empty). The coverage-failure-classifier regex is the same shape.

Closes #4696

🤖 Generated with [Claude Code](https://claude.com/claude-code)
