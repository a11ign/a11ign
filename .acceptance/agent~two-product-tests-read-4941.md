Two product tests read the product's own tutorial fixtures, not the lab's laid tree. `packages/judge/src/announced-state-changes.test.ts` now points its three constants (`disclosure-good`, `menus-good`, `disclosure-bad`) at `packages/judge/src/fitness/fixtures/tutorials/`, and `packages/cli/src/action/summary.test.ts` points its `disclosure-good` URL there too, by a relative path. The three fixture copies were added by #4940 and are byte-identical to the lab's (`cmp`-checked). Neither file names `packages/lab/` any more.

**Measured:** with `packages/lab` moved aside (the layer `scripts/lay-layer.ts` lays in, gitignored), the HEAD versions fail `ENOENT` on `packages/lab/src/eval/fixtures/tutorials/disclosure-good.json` (3 of 6 tests) and the changed versions pass (87 tests in 2 files). With the layer present, both pass.

Acceptance:
```bash
bash -c '! git grep -nE "lab/src/eval/fixtures" -- packages/judge/src/announced-state-changes.test.ts packages/cli/src/action/summary.test.ts'
npx rstest run --config=scripts/rstest/rstest.config.ts packages/judge/src/announced-state-changes.test.ts packages/cli/src/action/summary.test.ts
```

Closes #4941
