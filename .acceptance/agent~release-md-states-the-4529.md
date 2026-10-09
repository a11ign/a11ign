## What

RELEASE.md's deferred-items row said "Test coverage is 47.4%, not the 85.9% the runner reports", an August reading of a tree that has since lost its laid layers and moved from c8 to rstest. It now states the `pnpm run coverage` reading at a named commit, what the number counts, what `.c8rc.json` leaves out, and that the old 85.9 was `node --test --experimental-test-coverage`.

Measured 2026-10-09 at `791552a77615418abf78639e57337ddb4db0f6c8` (`pnpm install --frozen-lockfile`, `pnpm run build`, `pnpm run coverage` in a fresh worktree, exit 0). The totals line it took the figure from:

```
coverage: lines 79.29%  statements 77.46%  (threshold 70%/69%)
```

Not re-measured here: the CI runner's ~0.8-point statement gap (#3998); the row says so. The run also printed 242 `Failed to process coverage` lines for child-process files, which can only lower the total; the row says that too.

Other published documents (README, `docs/try-it.md`, `docs/METHODOLOGY.md`, `docs/known-gaps.md`): `git grep` for a coverage percentage finds none for this repository (METHODOLOGY's and known-gaps' percentages are other measures). `.c8rc.json`'s header comment keeps the historical "85.9% reported against 47.4% actual" as history, not a claim, and is outside the Region.

Both exit 0 (the first prints nothing, the second matches line 406).

## Measured

```
$ pnpm run coverage   # at 791552a77615418abf78639e57337ddb4db0f6c8, 2026-10-09
coverage: lines 79.29%  statements 77.46%  (threshold 70%/69%)
```

Done-when 3 (`pnpm run coverage` at the merge commit within one point of the stated figure) can only be read after merge.

Acceptance:
```bash
bash -c '! grep -n "85\.9" RELEASE.md | grep -vi "node --test"'
grep -nE 'Test coverage is [0-9.]+% (lines|statements).*(measured|read) 20[0-9]{2}-[0-9]{2}-[0-9]{2} at [0-9a-f]{7,}' RELEASE.md
```

Closes #4529

🤖 Generated with [Claude Code](https://claude.com/claude-code)
