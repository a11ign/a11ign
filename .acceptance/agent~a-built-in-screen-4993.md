Adds `packages/cli/src/auth/screen-loop.ts` (pure: `classifyScreen`, `nextAction`, `runLoop`, `unknownScreenStep`) and its test. A login screen is recognised by accessible name, `autocomplete` token and heading, never by CSS; the loop acts only on exactly one match, never acts on the same screen twice running, and ends at once on a blocked account, bot challenge, rate limit or rejected credential/code. No browser, no import of `playwright-driver.ts`.

**Measured at this head:** 21 tests, all pass (`rstest`, the command below).

**Mutations** (each applied to `screen-loop.ts`, run, restored byte-identical with `diff`):
- classify by CSS class instead of accessible name (`IDENTIFIER_NAME.test(c.className ?? c.name)`): turns red `NEGATIVE CONTROL: a control that only LOOKS right by its class name is not a login form`, and no other.
- act on an ambiguous screen (`forms.length >= 1`): turns red `NEGATIVE CONTROL: a screen whose controls match two screens is ambiguous` and `NEGATIVE CONTROL: an ambiguous screen is not acted on, and is acted on once it resolves`.

**Not done here (named):** `nextAction` takes the observation as a third argument, since the target control is read from it; nothing wires the loop into `cli.ts` or a driver (the row's Region is these two files); the recogniser patterns are English and were written from Auth0's documented prompt names, not read off a live tenant.

Acceptance: bash -c 'git grep -q "POSITIVE CONTROL" -- packages/cli/src/auth/screen-loop.test.ts && git grep -q "NEGATIVE CONTROL" -- packages/cli/src/auth/screen-loop.test.ts && npx rstest run --config scripts/rstest/rstest.config.ts --include packages/cli/src/auth/screen-loop.test.ts'

Closes #4993
