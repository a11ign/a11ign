**The spec writer's prompt (a11ign/a11ign#5116, the Haiku push).** Adds `.agent-org/roles/spec-writer.md`, the one prompt `agent-org:src/spec-writer.ts` reads (a11ign/agent-org#1012): four `### Example` headings from rows Haiku merged first time (#4613, #4955, #4621, #4961), the five parts of a spec, and the rule that the tests must fail on main.

**Not done, and named:** the module has no caller until the one-shot machinery (#4505) lands, and `rows.specWriter` is not set in `.agent-org/project.json`; Done-when 2 (three live rows) is open.

Acceptance: `grep -c '^### Example' .agent-org/roles/spec-writer.md`

The module's own tests (agent-org#1012) read this file through `readSpecWriterPrompt`, which refuses fewer than three or more than five examples: against this worktree it returned `true 4267` (measured).

Closes: #5116
