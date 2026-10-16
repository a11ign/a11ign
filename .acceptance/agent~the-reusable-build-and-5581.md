The reusable build-and-test workflow now sets up Node 24 (was 22), so the `ts` and `python` jobs install and run the `agent-org` tool clone, which declares `engines: node >=24`, under a Node it supports (#5581).

One value in the one reusable file, so `ts`, `python` and `trunk.yml`'s caller move together and match `ci-health.yml` (already 24). The other `node-version: 22` jobs in `ci.yml` are outside the row's Region and untouched. A comment above the step names why, so the pin is not read as drift and lowered again.

Open-check (from the row): `gh run view 38830026487 --repo a11ign/a11ign --log | grep -c "Unsupported engine"` printed `4` at `85515e7c`. The post-merge reading of the same command at a head containing this change is the row's done-when and is posted on the row once a `ci` run exists; it is not claimed here.

platform: `actions/setup-node` already takes the version, so nothing was built; no worker, fleet or lab command was run.

Acceptance:
```bash
grep -n "node-version" .github/workflows/reusable-build-test.yml
pnpm exec rstest run --config=scripts/rstest/rstest.config.ts --include packages/guards/src/pr-enforces-coverage-floor.test.ts
```

Closes #5581

🤖 Generated with [Claude Code](https://claude.com/claude-code)
