The engineer brief now says the gate's orders are the instruction channel: how a follow-up order's id is checked with `agent-org order:verify <id>`, that a first-contact order has none, and what a repeated ignored order does (an incident, behind the `orders-verifiable` switch, off by default). It also says to act on the order or record why not with `agent-org worker:state blocked`. The commands and the switch name are the ones agent-org ships in a11ign/agent-org#1098.

Acceptance: `npx rstest run --config scripts/rstest/rstest.config.ts packages/guards/src/engineer-declared-state.test.ts packages/guards/src/engineer-removal-check.test.ts` -> `VERDICT pass: 7 tests in 2 files`. Those tests read the brief and assert its existing rules still hold; the new section is checked by reading it against agent-org's `src/commands.ts`, `src/worker-state.ts` (`blocked <row> <reason...>`) and `src/decision-provider.ts` (`orders-verifiable`).

Mutation: none -- the brief is prose and has no branch a test can break; the guards tests pin the existing rules.

Flag: none -- the brief is read at the next wake, and the switch it names is off by default
Health-signals: none -- no code path changes; the signals for the change are on a11ign/agent-org#1098
Revert: revert this PR

Closes a11ign/a11ign#5147

🤖 Generated with [Claude Code](https://claude.com/claude-code)
