Replaces the two stale "under re-measurement" lines with the figures `docs/capture-cost.md` and the README claim block already carry (#4084 outcome 19).

- `README.md` "Where it fits": 105 s to 460 s of worker time per captured page, 166 worker-minutes over 33 captures of 6 pages, CLI wall-clock 4-5 s longer. It says this is worker time per page, not the wall-clock of a sweep. Dated 2026-09-24, protocol 21, and links `docs/capture-cost.md`.
- `docs/try-it.md`: the real-page reading (0 asserted wrongly, 395 referred, 2026-09-24, protocol 21, from the README claim block) plus the same capture-time range, linked to `capture-cost.md`.

Protocol has moved to 22 in code since the measurement, so both lines say "measured 2026-09-24 at protocol 21 and not refreshed since". Nothing was re-measured and no fleet or lab command was run.

Verification: the row's Acceptance, run as written, passes (no "under re-measurement since" in either file; `grep -n 'capture-cost.md' README.md` prints line 285). The worktree has no `node_modules`, so `pnpm run verify` was NOT run locally; CI's `ts` job runs the doc tests (`summary-md-output.test.ts`, `docs-release-pin-currency.test.ts`).

platform: none needed, prose only.

Acceptance:
```bash
bash -c '! grep -rn "under re-measurement since" README.md docs/try-it.md'
grep -n 'capture-cost.md' README.md
```

Closes #4531

🤖 Generated with [Claude Code](https://claude.com/claude-code)
