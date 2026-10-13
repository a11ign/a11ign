Adds a `--week=<Monday>` window to `scripts/token-cost.ts` (`windowFor`, a pure function over argv and the clock) and makes the weekly unit pass the Monday that its timer's day closed, so a start after 00:00Z Tuesday reads the week its CI-health comment is headed for. A `--week=` that is not a Monday is refused.

**Measured at this head:** `packages/guards/src/token-cost.test.ts`, 55 pass, 0 fail (`node --test`).

**Mutations** (each applied to `scripts/token-cost.ts`, run, restored byte-identical with `diff`):
- ignore the flag (`flagValue(argv, "--ignored-week")`): turns red `windowFor: --week= reads the week of that Monday ...` and `windowFor: --week= names a Monday ...`.
- disable the Monday check (`if (false) throw`): turns red `windowFor: --week= names a Monday ...` and no other test.

**Unit:** `systemd-analyze verify` on the `.service` and `.timer` exits 0. The `ExecStart` line was dry-run with `node` replaced by `echo`: on Tue 2026-10-13 it names `--week=2026-10-05`. The same date expression with a pinned clock gives 2026-10-05 for Monday 12:13Z and Tuesday 22:19Z, and 2026-10-12 for Monday 2026-10-19 12:13Z. Nothing was posted: the real `--post` was not run.

**Not done here (named):** the eight-start retry budget is unchanged, so a comment landing after the last start (about 22:19Z Monday on the failure path, 23:53Z on the hang path) is still missed. Done-when 2 (one `--post --week=2026-10-05` to #928) writes to GitHub and is left for a run after merge.

Acceptance: bash -c 'grep -q "week=" scripts/token-cost.ts && node --test packages/guards/src/token-cost.test.ts'

Closes #5399
