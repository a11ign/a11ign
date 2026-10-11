**The spec writer's prompt (a11ign/a11ign#5116, the Haiku push).** Adds `.agent-org/roles/spec-writer.md`, the one prompt `agent-org:src/spec-writer.ts` reads (a11ign/agent-org#1012): four `### Example` headings from rows Haiku merged first time (#4613, #4955, #4621, #4961), the five parts of a spec, and the rule that the tests must fail on main.

**Not done, and named:** the module has no caller until the one-shot machinery (#4505) lands, and `rows.specWriter` is not set in `.agent-org/project.json`; Done-when 2 (three live rows) is open.

Acceptance: `test -f ~/repos/a11y-witness/.agent-org/roles/spec-writer.md; echo $?` is the row's Open-check, run from the main checkout after merge; before merge, the agent-org module's own reader accepts this file: `node <scratchpad>/read.ts` printed `true 4267` against this worktree.

Acceptance command: `bash -c 'cd ~/repos/agent-org && AGENT_ORG_HOST=/home/agent/repos/a11y-witness/.agent-org/host.json npx rstest run --config scripts/rstest/rstest.config.ts src/spec-writer.test.ts'`

Closes: #5116
