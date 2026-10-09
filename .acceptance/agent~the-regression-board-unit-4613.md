## What

`.agent-org/units/a11ign-regression-board.service` runs `%h/repos/agent-org/src/bin.ts` instead of `.../src/bin.mjs`. agent-org renamed its entry (a11ign#4389), so the timer's `row-file --board=` loop failed with `ERR_MODULE_NOT_FOUND` and no `regression` row was boarded. One token changes; the `sh -c` loop, the Node path (`%h/.local/bin/node`, which strips types) and every comment are untouched. The `%h/.local/bin/agent-org` shim is deliberately NOT used: it runs `node` from PATH, which in a unit is `/usr/bin/node` and cannot strip types.

- **Reach count unchanged:** the unit still holds one `agent-org/src/` reach, so `packages/guards/src/agent-org-src-reach.baseline.json` (`".agent-org/units/a11ign-regression-board.service": 1`) is not edited. Lowering it belongs to the migration rows (#4408 to #4411).
- **Entry exists:** `git ls-tree origin/main src/` in agent-org lists `src/bin.ts` and no `src/bin.mjs`.

## Evidence

- Acceptance fails before and passes after. Against `origin/main`'s copy: both checks exit 1. Against this branch: both exit 0.
- Mutation, both directions, in a scratch copy (the worktree file was not touched):
  - revert to `bin.mjs`: the "names bin.ts" check fails (rc 1) and the "no bin.mjs" check fails (rc 1);
  - keep `bin.mjs` alongside `bin.ts`: the "names bin.ts" check passes (rc 0) and the "no bin.mjs" check fails (rc 1), so the absence check bites on its own.
- `pnpm exec tsx --test packages/guards/src/agent-org-src-reach.test.ts`: 20 tests, 20 passed, 0 failed.

platform: a one-token edit to an existing unit; the systemd `ExecStart=` already names the entry, so nothing new is built.

Acceptance:

```bash
bash -c 'grep -E "^ExecStart=" .agent-org/units/a11ign-regression-board.service | grep -q "agent-org/src/bin\.ts"'
bash -c '! grep -E "^ExecStart=" .agent-org/units/a11ign-regression-board.service | grep -q "src/bin\.mjs"'
```

Closes #4613

Host copy: `orchestrator` renews it with `pnpm run host:install`, then `host:check` must show no STALE line for this unit (done-when item 2, not this PR's acceptance).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
