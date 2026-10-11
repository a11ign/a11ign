The engineer brief says to open a pull request READY and never `--draft`, because the reviewer and the merge queue are the gate and an approved draft is a wait with no purpose; the one way through is `pr:open`'s `Draft-because: <reason>` line, which agent-org#953 enforces. This is the Closes half of #5036: the `pr-open` refusal (part 1) is agent-org#953, and parts 3 and 4 moved to their own rows because part 3's premise did not hold (there is no shared `a11ign/toolchain` auto-arm: each of six repositories carries its own `auto-arm.yml`, none with a review trigger; its port is #5045, and the gate's two readings are a11ign/agent-org#958).

Acceptance: `bash -c 'grep -q "Draft-because" .agent-org/roles/engineer.md && cd ~/repos/agent-org && AGENT_ORG_HOST=/home/agent/repos/a11y-witness/.agent-org/host.json npx rstest run --config scripts/rstest/rstest.config.ts src/pr-open.test.ts'`

Mutation: none -- a sentence in a role brief; the brief's guards (`engineer-declared-state.test.ts`, `engineer-removal-check.test.ts`) still pass (7 of 7) with it added, and the refusal it describes is agent-org#953's tests, mutation-checked there.

Not here, and named: the second half of the command runs the primary `~/repos/agent-org` checkout, which holds `pr-open.test.ts` as it is until agent-org#953 merges, so before that merge it proves the existing tests pass and not the new ones; the new ones are `19 passed` in agent-org#953's worktree.

Closes #5036
