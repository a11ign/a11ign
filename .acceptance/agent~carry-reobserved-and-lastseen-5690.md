The sign-in interpreter's `authLoop` mark carries each branch's `reobserved` count and `lastSeen` reading through to the trail, where before it stripped both (#5690, split from #5689). `lastSeen` is carried only where the loop wrote it, so a branch whose screen was never seen again has none. The loop's actions and outcomes are unchanged.

**Measured at this head:** `interpreter.test.ts` runs with `tsx --test`, 54 of 54 pass (53 before, plus the new case). Typecheck and lint as the PR's `pnpm run verify` reports them.

**The two cases, each with a negative control** (`interpreter.test.ts`): the AUTH0 sign-in pins `reobserved: 0` on all three branches, none re-observed, so every one reaches the mark without a `lastSeen`. The new case drives a one-time-code form that stays up with an alert after Continue: its branch carries `reobserved` above 0 and the `lastSeen` it last showed, and the branch the loop never saw again has `reobserved` 0 and no `lastSeen` key at all.

**Mutation evidence:** with the mapper restored to its pre-change form, both tests fail. With `lastSeen` carried unconditionally, both fail. With `reobserved` dropped, both fail. The file was restored byte-identical after each.

**Not done here:** reading the alert (#5679); the third wrong-code falsifier dispatch (orchestrator, #5564).

Acceptance: git grep -q "reobserved" -- packages/cli/src/auth/interpreter.ts && git grep -q "reobserved" -- packages/cli/src/auth/interpreter.test.ts

Closes #5690
