## What

`reusable-acceptance.yml` now hands the acceptance reader the pull request's author at BOTH calls: the live-body step's `acceptanceSourceOfThisPullRequest(body, process.cwd(), process.env.PR_AUTHOR)` and the full-history step's `acceptanceSourceOfThisPullRequest(process.env.PR_BODY, process.cwd(), process.env.PR_AUTHOR)`. In `agent-org` the exemption `BODY_EXEMPT_AUTHORS` (`dependabot[bot]`, `app/dependabot`) applies only to that third argument, and the tool does not read `PR_AUTHOR` itself on this call, so until now a Dependabot pull request that adds no `.acceptance/` file was narrowed to its `Closes` line and its Acceptance read as missing. `PR_AUTHOR` is still `env:` data from the event, never read from the body, a label or a branch; the 90 s Dependabot re-read loop is untouched.

A new guard, `packages/guards/src/acceptance-hands-author-to-reader.test.ts`, pins it in two halves: the wiring (every call passes `process.env.PR_AUTHOR`, from a step whose `env:` takes it from the event) and the behaviour (the two steps' own scripts run against a stand-in tool that exempts only the two spellings).

## Evidence

- The row's Acceptance, before and after: `calls=2 with-author=0` at `origin/main` (exit 1), `calls=2 with-author=2` on this branch (exit 0), both measured here with the row's own command.
- New test: 7 tests, 0 failed (`npx rstest run`, `VERDICT pass: 7 tests in 1 file`). Positive controls are in the file: the tree holds at least 2 calls, and the two calls as they were at core `da027c092` (inlined) are faulted.
- `eslint` on the test: no output; `pnpm run typecheck`: clean.

**Not measured:** a real Dependabot pull request through the changed steps (none found). The stand-in tool models `resolveAcceptanceSource` from agent-org's source at v0.139.0; the real reader was not run in CI by this change.

platform: the reader's own `author` argument and `BODY_EXEMPT_AUTHORS`; no author check is re-implemented in shell.

Acceptance:

```bash
bash -c 'f=.github/workflows/reusable-acceptance.yml; n=$(grep -c "acceptanceSourceOfThisPullRequest(" $f); m=$(grep "acceptanceSourceOfThisPullRequest(" $f | grep -c PR_AUTHOR); test "$n" -ge 2 && test "$n" = "$m"'
npx rstest run --config=scripts/rstest/rstest.config.ts packages/guards/src/acceptance-hands-author-to-reader.test.ts
```

Mutation: (A) the live-body call without the author -> the wiring test and the live-body behaviour test fail, and no full-history test; (B) the full-history call without the author -> the wiring test and the full-history behaviour test fail, and no live-body test; (C) the workflow as at `origin/main` -> the wiring test and both behaviour tests fail; (D) the full-history step's `PR_AUTHOR` env not from the event -> only the wiring test fails. Each restored byte-identical (`diff` clean).

Closes #4857

🤖 Generated with [Claude Code](https://claude.com/claude-code)
