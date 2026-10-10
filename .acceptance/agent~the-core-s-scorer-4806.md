The core's two scorer tests that name the realism builder by extension now find it under either `.mjs` or `.ts`, so the lab pin can move from `v0.1.27` to `v0.1.28` (step 2a of #4551; found by #4797).

- `packages/scorer/src/model-input.test.ts`: `realismBuilder()` returns the `.ts` when the lab has it (at `v0.1.28` the `.mjs` is a re-export shim with no builder code) and the `.mjs` otherwise; **neither existing is an assertion failure, not a skip.**
- `packages/scorer/src/record-builders.test.ts`: the discovered set is still asserted EXACTLY. `withRealismSpelling()` requires exactly one of the two spellings among the builders (none = vanished, two = duplicated, both fail) and compares the set with that one name.
- Both comments say the `.mjs` spelling goes when #4798 deletes the shims.
- **Measured** (this branch at its commit, 2026-10-10): the Acceptance below passes at the lab laid at `v0.1.27` (6 tests, 2 files) and at `v0.1.28` (throwaway worktree, `layers.json` `pinned.lab.tag` set to `v0.1.28`, layer laid by `pnpm install`, never committed: 6 tests, 2 files). `pnpm run lint` 0 errors, `pnpm run typecheck` clean.

platform: none needed. No fleet, lab or worker command was run; `lay-layer.ts lab` only lays the pinned source.

Acceptance:
```bash
node packages/guards/src/assert-glob-not-empty.ts "packages/scorer/src/{model-input,record-builders}.test.ts" --min=2 --run --runner=rstest
```

Mutation (lab laid at `v0.1.28`, throwaway worktree, measured): with the tolerance removed (both files as at the parent commit) 2 of 6 fail, by name: `model-input.test.ts :: NOBODY builds the model's input except this module` ("../../lab/scripts/build-realism-tier.mjs does not use the shared modelInput builder") and `record-builders.test.ts :: the builders discovered are the ones we think` (actual lists `build-realism-tier.ts`, expected `.mjs`). Guard in both directions: with neither spelling present both tests fail with "exists under neither spelling" / "found 0"; with both spellings discovered as builders (the shim replaced by a copy of the `.ts`) `the builders discovered are the ones we think` fails with "found 2" and no other test does.

Closes #4806

🤖 Generated with [Claude Code](https://claude.com/claude-code)
