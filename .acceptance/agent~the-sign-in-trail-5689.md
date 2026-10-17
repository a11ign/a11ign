The sign-in trail records, on the branch the loop acted on, how many times that screen was seen again (`reobserved`) and the reading it last showed (`lastSeen`), so a wrong code whose alert never appeared reads as a loop that did not look. The trail writer keeps role and name only. The interpreter maps each branch to the `authLoop` mark, and carries both fields through that map: product-manager widened the Region to `interpreter.ts` and `interpreter.test.ts` for it (#5689, comment 6229355999), because without it the fields never reached the trail. The `observed` branch from #5683 is unchanged.

**Measured at this head:** the three auth test files (`interpreter.test.ts`, `screen-loop.test.ts`, `auth-trail.test.ts`) run with `tsx --test`: 103 tests, 103 pass. Typecheck exits 0. Lint: 0 errors (7 warnings; two are `5_000` budgets in the new tests, the rest sit on existing lines). `pnpm run verify` exits 0 at this head.

**The three cases, each with a negative control** (`screen-loop.test.ts`): never seen again (`reobserved` 0, no `lastSeen`); seen again unchanged (`reobserved` above 0, no `observed` branch); seen again with an alert (`lastSeen.alerts` carries the alert). `auth-trail.test.ts` pins that the count and `lastSeen` are written beside the acted branch, and that a value never reaches the file.

**Not done here:** reading the alert (#5679); the third wrong-code falsifier dispatch (orchestrator, #5564).

Acceptance: bash -c 'git grep -q "reobserved" -- packages/cli/src/auth/screen-loop.ts && git grep -q "reobserved" -- packages/cli/src/auth/screen-loop.test.ts && git grep -q "reobserved" -- packages/cli/src/auth/auth-trail.ts'

Closes #5689
