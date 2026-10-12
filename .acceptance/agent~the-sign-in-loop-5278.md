## What

The sign-in loop did not press the app's own "Sign in" button. On the test app's signed-out page (heading "Sign in required", one "Sign in" button, no field) `classifyScreen` matched no form, so the loop returned `unknown-screen` and the Auth0 redirect never started (#5114's nightly, read on #5278).

`packages/cli/src/auth/screen-loop.ts` gains a `landing` form screen: no input field and exactly one control named "Sign in" or "Log in". The loop presses it once. A page that comes back unchanged is not pressed again, and a page with two such controls matches nothing and is not pressed.

## Evidence

- `screen-loop.test.ts`: 22 tests before the change, 25 after (the positive control and two negative controls for landing).
- Mutations, each restored byte-identical (`cp` back and `cmp`):
  - M1, the landing guard never fires: 2 of 25 red (the positive control and the pressed-once case).
  - M2, the landing guard fires on two sign-in controls: 1 of 25 red (the two-control case).
  - M3, the landing guard fires on every page: 3 of 25 red.
- `pnpm run typecheck` exit 0; `eslint` on both changed files 0 errors; `packages/cli/src/auth/*.test.ts` 402 pass, 13 skipped.

## Not done here

The dispatch run in `a11ign/auth-capture-check` and the falsifier read are Done-when 2 and 3 of #5114 and wait on this change being released. Nothing here dispatches the private nightly.

## Acceptance

```bash
bash -c 'grep -q "landing screen" packages/cli/src/auth/screen-loop.test.ts && node packages/guards/src/assert-glob-not-empty.ts "packages/cli/src/auth/screen-loop.test.ts" --min=1 --run --runner=rstest'
```

Mutation: the landing guard never firing (`=== 99`) turned 2 of 25 red; firing on two controls (`>= 1`) turned 1 of 25 red; firing on every page turned 3 of 25 red. Each restored byte-identical.

Closes #5278
