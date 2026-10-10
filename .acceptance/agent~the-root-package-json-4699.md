Removes `--import tsx` from the 31 lines of the root `package.json` that carried it, from the untracked-changeset guard in `scripts/git-hooks/pre-push` (line 678), and from the `ExecStart` of `a11ign-token-cost-weekly.service` and `a11ign-weekly-review.service`. Node 24 strips types (a11ign#4389), so `node x.ts` needs no loader. Both units already name `%h/.local/bin/node` (the host's Node 24), not the distro's 22, so no unit line changes beyond the two words. Bare `tsx x.ts` scripts in `package.json` are not `--import tsx`, are outside this row's pattern, and are left to a11ign#4596. `a11ign-fleet-watch.service` is left to a11ign#4596 because #4694 edits it.

Premise check, as read here (measured, not inferred, unless marked):
- `node scripts/changeset-untracked-check.ts` runs under bare `node` v24.21.0, and `pnpm run docs:known-gaps-index` (a changed line) printed `OK  docs/known-gaps.md's index is current.` through pnpm; `pnpm run verify` is itself `node scripts/verify.ts`.
- `pnpm run verify -- --draft-body=<this file>` at this head: changed, ts (1m06s), acceptance, ownedPaths PASS; python, rulesFitness, changeset NOT-NEEDED. The affected set passed against origin/main; the tree-wide guards run in CI only.
- The 17 entries that reach the fleet or lab (`packages/control/src/*`, `packages/worker-fleet/src/*`) were NOT run: the resource ban. Their import closure (44 files, in the layers freshly laid by `scripts/lay-layer.ts` at control v0.2.1 and screenreader-fleet v0.7.2) and the 13 in-repo entries' (31 files) were walked statically: every relative specifier carries an explicit extension and resolves, and `node --check` accepts every `.ts`. 0 problems. Static resolution is not a run: nothing was executed that reaches the fleet or lab.

Hits outside the Region, left alone and for a11ign#4596's other slices: `scripts/known-gaps-index.ts` prints `node --import tsx scripts/known-gaps-index.ts` in its usage text, and `coverage-failure-classifier.test.ts` and `stale-dist-diagnosis.test.ts` assert the same wording; many tests `spawn` with `--import tsx`.

Mutation: re-adding `--import tsx` to one line of each of the four files turns the Acceptance red, one file at a time, and restoring each (checked `cmp`-identical) turns it green again. platform: none needed, a mechanical edit.

Acceptance:
```bash
bash -c '! git grep -qE -- "--import[= ]\S*tsx" -- package.json scripts/git-hooks/pre-push .agent-org/units/a11ign-token-cost-weekly.service .agent-org/units/a11ign-weekly-review.service'
```

Closes #4699
