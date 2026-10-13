Adds a `--week=<Monday>` window to `scripts/token-cost.ts` (`windowFor`, a pure function over argv and the clock) and makes the weekly unit pass the Monday that its timer's day closed, so a start after 00:00Z Tuesday reads the week its CI-health comment is headed for. A `--week=` that is not a Monday is refused.

**Measured at this head:** `packages/guards/src/token-cost.test.ts`, 57 pass, 0 fail (`node --test`).

**Mutations** (each applied in place, run, restored byte-identical with `diff`; re-measured in one pass):
- ignore the flag (`flagValue(argv, "--ignored-week")`): 3 tests red (`reads the week of that Monday ...`, `names a Monday ...`, `an empty --week= is refused ...`).
- disable the Monday check (`if (false) throw`): 2 red (`names a Monday ...`, `an empty --week= is refused ...`).
- an empty value read as no flag (`monday !== undefined` back to `monday`): 1 red (`an empty --week= is refused ...`).
- unit date offset (`+ 6` to `+ 5` in the unit's `ExecStart`): 1 red (`the weekly unit names the week ...`).
- unit hard-coded to a wrong week (`--week="2026-10-06"`): 1 red (`the weekly unit names the week ...`).

**Unit:** `systemd-analyze verify` on the `.service` and `.timer` exits 0. The `ExecStart` line was dry-run with `node` replaced by `echo`: on Tue 2026-10-13 it names `--week=2026-10-05`. A test (`the weekly unit names the week its timer's day closed, under a pinned clock`) runs the unit's own `ExecStart` text through `sh` with a `date` that is pinned: 2026-10-05 for Monday 12:13Z, Tuesday 22:19Z and Sunday 23:59Z, and 2026-10-12 for Monday 2026-10-19 12:13Z. Its executable form is what the Acceptance command reads, so a wrong offset in the unit goes red there, not only on the first real Monday. Nothing was posted: the real `--post` was not run.

**Not done here (named):** the eight-start retry budget is unchanged, so a comment landing after the last start (about 22:19Z Monday on the failure path, 23:53Z on the hang path) is still missed. Done-when 2 (one `--post --week=2026-10-05` to #928) writes to GitHub and is left for a run after merge.

Acceptance: bash -c 'grep -q "week=" scripts/token-cost.ts && node --test packages/guards/src/token-cost.test.ts'

Closes #5399
