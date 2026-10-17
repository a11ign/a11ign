The sign-in trail records, on the branch the loop acted on, how many times that screen was seen again (`reobserved`) and the reading it last showed (`lastSeen`), so a wrong code whose alert never appeared reads as a loop that did not look. The trail writer keeps role and name only, and its tests pin that. The `observed` branch from #5683 is unchanged.

**Not in this PR, and so the trail does not yet record it in a real sign-in:** the interpreter maps each branch to the `authLoop` mark before the trail sees it, and that map drops the two fields. Carrying them through is #5690 (`interpreter.ts` and its test), which is blocked by this row. product-manager restored this row's Region to the four trail and loop files (#5689, comment 6229445600).

**Measured at this head:** `screen-loop.test.ts` and `auth-trail.test.ts` run with `tsx --test` and pass. Typecheck exits 0. Lint: 0 errors. `pnpm run verify` exits 0 at this head.

**The three cases, each with a negative control** (`screen-loop.test.ts`): never seen again (`reobserved` 0, no `lastSeen`); seen again unchanged (`reobserved` above 0, no `observed` branch); seen again with an alert (`lastSeen.alerts` carries the alert). `auth-trail.test.ts` pins that the count and `lastSeen` are written beside the acted branch, and that a value never reaches the file.

**Not done here:** reading the alert (#5679); the third wrong-code falsifier dispatch (orchestrator, #5564).

Acceptance: bash -c 'git grep -q "reobserved" -- packages/cli/src/auth/screen-loop.ts && git grep -q "reobserved" -- packages/cli/src/auth/screen-loop.test.ts && git grep -q "reobserved" -- packages/cli/src/auth/auth-trail.ts'

Closes #5689
