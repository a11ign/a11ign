`.agent-org/roles/engineer.md` gets one section directly after "The resource ban", titled for the rule: **Removal commands the safety check cannot read (a11ign#4957, sixth class)**. It has four rules, each one sentence: a script longer than one line goes in a file in the session scratchpad and is run, never inline in `bash -c '...'` or `node -e "..."`; never `rm` a variable or a glob target, use a literal path or `"${VAR:?}/name"`; do not clean the scratchpad; if a removal is denied by a built-in Claude Code safety check, take the denial, rewrite the command, and never retry the same removal, because only a person may approve one.

`packages/guards/src/engineer-removal-check.test.ts` pins the four rules as the sentences that carry them, in the style of `engineer-declared-state.test.ts`. Positive control: the shipped file passes. Negative controls: each of 15 load-bearing words, replaced in a copy, fails its own rule, and a copy with the section removed fails all four.

- **Measured, fails before, passes after:** the new test run against the base brief (`git show HEAD:.agent-org/roles/engineer.md`) exits 1 with `engineer.md lost the scripts in files rule`. Against the shipped file it exits 0, `pass 3, fail 0`. The shipped file was restored from a copy and `diff`-checked byte-identical.
- **Measured:** the two Acceptance greps exit 0 at this head; `node --test packages/guards/src/engineer-declared-state.test.ts` passes 4 of 4.
- **Measured, rstest** (`pnpm exec rstest run --config scripts/rstest/rstest.config.ts` on the four guard tests above plus the prose and role guards `pm-brief-parked-rules`, `liaison-brief-replies-with-to`, `tracked-prose-leak-guard`, `directive-names-one-owner`): `VERDICT pass: 16 tests in 4 files`, then `VERDICT pass: 42 tests in 8 files`.
- **Measured:** `checkRoster` from `scripts/doc-checks/roles-readme.ts` reports `incomplete: []`. Its `missing: [worker-contracts]` is pre-existing and not touched here.
- **Measured:** `eslint` on both test files exits 0.
- **Environment:** this worktree had no `node_modules`; it was built as the hybrid the repo documents (third-party entries symlinked to the primary checkout, `@a11ign/*` linked to this tree's packages). Measured results are from that tree.
- **Not claimed:** that a worker obeys the section. The pin reads prose. The daily detector in a11ign#4957 counts denials per session per day, and that count is what says whether this brief is enough.

Acceptance: bash -c 'grep -q "denied by a built-in Claude Code safety check" .agent-org/roles/engineer.md && grep -q "never retry the same removal" .agent-org/roles/engineer.md && node --test packages/guards/src/engineer-removal-check.test.ts && node --test packages/guards/src/engineer-declared-state.test.ts'

Mutation: each load-bearing word replaced in a copy is asserted to fail its own rule (the 15 cases in `engineer-removal-check.test.ts`); the section removed entirely is asserted to fail all four.

Closes #4966
