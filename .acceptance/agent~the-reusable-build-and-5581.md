The reusable build-and-test workflow now sets up Node 24 (was 22), so the `ts` and `python` jobs install and run the `agent-org` tool clone, which declares `engines: node >=24`, under a Node it supports (#5581).

One value in the one reusable file, so `ts`, `python` and `trunk.yml`'s caller move together and match `ci-health.yml` (already 24). The other `node-version: 22` jobs in `ci.yml` are outside the row's Region and untouched. A comment above the step names why, so the pin is not read as drift and lowered again.

## What this PR can and cannot show before merge

`scripts/ci-changed.ts` classifies a diff touching only `.github/workflows/` as `ts=false python=false` (measured: `node scripts/ci-changed.ts --event=pull_request --base=origin/main` on this head prints both `false`), so no CI run on this PR calls the reusable file. The row's done-when 1 and 2 are therefore post-merge readings by their own wording ("a `ci` run at a head containing it"): `trunk.yml` calls the same file on `main` after the merge, and the run id and the `grep -c` result are posted on the row then. Open-check at `85515e7c`, from the row: `gh run view 38830026487 --repo a11ign/a11ign --log | grep -c "Unsupported engine"` printed `4`.

## Mutation

The acceptance below reads the VALUE, so reverting the pin fails it (the first version only listed the line and stayed green under revert, which the review caught):

- pin reverted to `node-version: 22, cache: pnpm`: `pin-present` FAILS and `no-22` FAILS.
- a second `node-version: 22` step appended with the 24 pin kept: `pin-present` passes and `no-22` FAILS, so each assertion breaks on its own mutation.
- the file restored with `cp` from a copy; `cmp` reports byte-identical.

platform: `actions/setup-node` already takes the version, so nothing was built; no worker, fleet or lab command was run.

Acceptance:
```bash
grep -n "node-version" .github/workflows/reusable-build-test.yml
grep -q "node-version: 24, cache: pnpm" .github/workflows/reusable-build-test.yml
grep -c "node-version: 22" .github/workflows/reusable-build-test.yml | grep -qx 0
```

Closes #5581

🤖 Generated with [Claude Code](https://claude.com/claude-code)
