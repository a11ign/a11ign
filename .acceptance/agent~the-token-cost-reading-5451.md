The token-cost reading's per-repository verdict now reads ALL calls (both repositories, the same figure as the whole-window table), and the attributed-only figures are printed as labelled comparison rows (`comparison, not the verdict`). The `Unattributed by session` line names the top five sessions and sums the rest as `others <n>`, so it adds to the unattributed total. When no `--hours` band is given the reading states the window as whole UTC days (`Whole UTC days: …`), and a band figure is labelled as not comparable to a whole-day figure. `docs/token-cost.md` states the same three rules.

**Measured at this head:** `packages/guards/src/token-cost.test.ts`, 64 pass, 0 fail (`node --test`). The row's own command (a `grep -c` count of at least 3, then the same test run) also prints OK. The Acceptance line below states the same check as one `grep -q` per phrase, with no `$` in it, because the verifier refuses command substitution. The three new tests (`the per-repository verdict reads all calls …`, `the unattributed line sums to the total …`, `the window is stated as whole UTC days …`) fail before the change and pass after it.

**Mutations** (each applied in place with `sed`, run, restored byte-identical with `cmp`):
- verdict back on attributed dollars (`value: whole.dollarsPerPull` to `r.dollarsPerPull`): 1 red.
- `others` never printed (`others > 0 ?` to `false ?`): 2 red.
- `others` always printed (`others > 0 ?` to `others >= 0 ?`): 2 red, the second caught by the five-session control in the same test.
- whole-day line never printed (`window.hours ? [] :` to `true ? [] :`): 1 red.
- whole-day line always printed (`window.hours ? [] :` to `false ? [] :`): 1 red.

**Local reading** (`node scripts/token-cost.ts --since=2026-10-05 --until=2026-10-06T00:00:00Z`, no `--post`, no `--hours`): prints `Whole UTC days: every hour of each day is in the window …` and `Unattributed by session: worker-<n>, pull request not merged in the window 2532, product-manager 1868, ceo 1386, orchestrator 454, liaison 7.`, which sums to the 6247 unattributed calls. The per-repository verdict rows read 12373 calls over 128 merged pull requests, both repositories, and the attributed rows are labelled `comparison, not the verdict`.

**Not done here (named):** the 5-minute-write whole-window row still shows a MET/MISSED cell beside a comparison label; the row did not ask for it to change, so it is left as a follow-up. `--post` was not run.

Acceptance: bash -c 'grep -q "per-repository verdict reads all calls" packages/guards/src/token-cost.test.ts && grep -q "unattributed line sums to the total" packages/guards/src/token-cost.test.ts && grep -q "window is stated as whole UTC days" packages/guards/src/token-cost.test.ts && node --test packages/guards/src/token-cost.test.ts && echo OK'

Closes #5451
