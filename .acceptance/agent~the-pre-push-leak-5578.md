The pre-push leak scan runs under `env TMPDIR=/tmp`, so a long caller `TMPDIR` no longer makes `tsx` fail with `listen EINVAL` and get reported by the hook as a leak (#5578).

tsx opens its IPC socket at `<TMPDIR>/tsx-<uid>/<pid>.pipe`, and a unix socket path is capped near 108 bytes; the harness's per-session scratchpad alone is over 90 characters. The fix is one prefix on the leak-scan statement in `scripts/git-hooks/pre-push`, with the reason in a comment above it. `/tmp` is short, and the hook already writes its own scratch files there.

The guard `packages/guards/src/pre-push-leak-scan-tmpdir.test.ts` extracts the hook's own `run "leak scan"` statement (its line and continuation lines), never a copy, and runs it under a 120-byte-or-longer real `TMPDIR`. It asserts three things:

- the statement exits 0 with no `EINVAL` in its output;
- with the guard files swapped for a fixture asserting a planted private address absent, the statement still exits non-zero, and the failure is the leak (`✖ planted leak is refused`, `private LAN IPv4 address`), not the socket;
- a control: the same statement with the prefix removed reproduces `listen EINVAL`.

Verification: the Acceptance command below on the fixed hook: `VERDICT pass: 3 tests in 1 file`, exit 0. Open-check of #5578 on the unfixed path (`TMPDIR` of 110 `a`s, directory created first): `listen EINVAL: invalid argument .../tsx-1000/<pid>.pipe`, exit 1, as the row predicted. Running the whole pre-push hook under a 131-byte `TMPDIR` with empty push stdin: `leak scan` ok, `pre-push: ok`, exit 0. `pnpm run lint` 0 errors; `pnpm run typecheck` clean; `control-delete.test.ts` and `lab-delete.test.ts` (the other guard tests that read the hook): 34 tests pass.

Mutation: with `env TMPDIR=/tmp ` removed from the hook (the same run), the test file reads `VERDICT fail: 2 of 3 tests failed`. Claims 1 and 2 fail on `listen EINVAL`; the control passes. Restoring the hook from a backup with `cp` gives byte-identical content (`cmp`).

platform: none needed, no worker, fleet or lab command was run.

Acceptance:
```bash
pnpm exec rstest run --config=scripts/rstest/rstest.config.ts --include packages/guards/src/pre-push-leak-scan-tmpdir.test.ts
```

Closes #5578

🤖 Generated with [Claude Code](https://claude.com/claude-code)
