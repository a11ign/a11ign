Makes the sign-in loop's trail (`auth-trail.ts`, a11ign#5510 under #5495) carry, for each loop branch, the alerts and controls the screen showed, role and accessible name only. `screen-loop.ts` `Branch` gains `alerts` and `controls`, set in `actOn` from the observation (stop branches included); `interpreter.ts` maps them into the `authLoop` mark; the trail writer cuts every node to role and name, so a value a mark carried never reaches the file. The `/progress`-side mark gets nothing new: `authLoop` has one consumer, `authTrailMark`.

Region: widened beyond the row's three files to `screen-loop.ts` (the `Branch` type lives there), `interpreter.ts`, the pinned expectations in `interpreter.test.ts` and `screen-loop.test.ts`, and one comment in `leak-check.test.ts`.

**Measured at this head:** 112 tests pass across auth-trail, leak-check, interpreter and screen-loop (`pnpm exec tsx --test`, the `node:test` runner these files use). `pnpm run lint`: 0 errors, 677 warnings (the count before this change). `pnpm run typecheck`: exit 0.

**Mutations** (each applied, run, then restored from a `cp` backup and checked with `diff`):
- writer drops every alert (`alerts: []` in `loopOf`): turns red the alert POSITIVE CONTROL and the no-value NEGATIVE CONTROL.
- writer passes nodes through uncut (`[...nodes]` in `shownOnly`): turns red the no-value NEGATIVE CONTROL and nothing else.
- `shownBy` drops alerts in `screen-loop.ts` (`alerts: []`): turns red the screen-loop POSITIVE CONTROL for the alert.

**Not done here (named):** the rejected-code path is pinned at the loop and the writer, not through a live rejected code; the interpreter pin covers screens with no alert.

Acceptance: bash -c 'git grep -q "POSITIVE CONTROL" -- packages/cli/src/auth/auth-trail.test.ts && git grep -q "NEGATIVE CONTROL" -- packages/cli/src/auth/auth-trail.test.ts && pnpm exec tsx --test packages/cli/src/auth/auth-trail.test.ts packages/cli/src/auth/leak-check.test.ts packages/cli/src/auth/interpreter.test.ts packages/cli/src/auth/screen-loop.test.ts'

Closes #5674
