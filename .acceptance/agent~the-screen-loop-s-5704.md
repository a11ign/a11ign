The screen loop's `observeScreen` (`packages/cli/src/auth/interpreter.ts`) now names an unnamed `alert` from the `StaticText` beneath it, as the CLI's `screenOf` (`packages/cli/src/cli.ts`) already did. `textUnder` moves to `interpreter.ts` and both readers import it, so the rule lives in one place. Nothing user-visible changes: the alert gains a name the loop can read, and `screenOf` keeps its behaviour.

**Shared:** the alert predicate is `isUnnamedAlert` in `interpreter.ts`, and both readers call it. Each reader keeps its own one-line `map` that names the matching nodes from `textUnder`, so a change to the naming step itself still needs both lines edited. The `THE HELPERS, through both` test catches a drift in the observed controls and headings.

**Measured at this head:** the Acceptance command below passes, 99 tests across `interpreter.test.ts` and `screen-loop.test.ts`. `pnpm run lint` exits 0 (0 errors, 677 pre-existing warnings). `pnpm run typecheck` exits 0.

**Mutations** (each applied to the named file, run, restored byte-identical with `diff`):
- observer skips alert naming (`const named = nodes;` in `observeScreen`): 3 of 58 `interpreter.test.ts` tests fail, including `POSITIVE CONTROL: an unnamed alert is read from the text beneath it`.
- CLI reader skips alert naming (`const named = nodes;` in `screenOf`): `THE HELPERS, through both` fails (1 of 58 tests).

**Not done here (named):** Done-when 3 of #5564's row (released so `orchestrator` can dispatch the next wrong-code run) is a release step, outside this row. The authLoop mark carries the recovered alert in `lastSeen.alerts` for a re-observed screen; the test for that is `POSITIVE CONTROL: the authLoop mark carries an alert read from the text beneath it`.

Acceptance: bash -c 'git grep -q "textUnder" -- packages/cli/src/auth/interpreter.ts && git grep -q "textUnder" -- packages/cli/src/cli.ts && pnpm exec rstest run --config scripts/rstest/rstest.config.ts --include "packages/cli/src/auth/interpreter.test.ts" --include "packages/cli/src/auth/screen-loop.test.ts"'

Closes #5704
