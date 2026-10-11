**The product-manager brief writes a build row with its tests first (#5109, the Haiku push, item 1).** `.agent-org/roles/product-manager.md` gains one section: every BUILD row is filed with the exact files, a `Tests-first: <test file path>` line with the cases as Given/When/Then and the exact assertion, the concrete error output when there is any, and the one command that runs the tests; decomposition, investigation and fleet rows carry no `Tests-first:` line and stay on Sonnet; `Tests-first: none` is never written because a line that names no test file is refused at claim. It names what enforces the line (agent-org `row-claim` and `merge-guard`, behind `rows.testsFirst`, shipped by a11ign/agent-org#1007) and the two signals to read.

**This is the docs half of the row.** The claim check and the merge guard are a11ign/agent-org#1007, which carries `Closes a11ign/a11ign#5109` and the mutation evidence. a11ign's own `rows.testsFirst: true` in `.agent-org/project.json` is NOT in this row's Region and is filed as its own row, because it should be flipped only once #1007's release is the tool the host runs.

Evidence: the three guards that read this file pass at this head (`pm-brief-parked-rules`, `role-files-chairman-source-and-haiku-default`, `role-files-no-standing-cron`: 13 tests in 3 files, run through `assert-glob-not-empty.ts --runner=rstest`). The line below fails on `origin/main` (exit 1, the section is absent) and passes here.

Acceptance: `git grep -n "Tests-first: <test file path>" -- .agent-org/roles/product-manager.md`

Closes: none -- the row closes on a11ign/agent-org#1007, which carries the deliverable the Acceptance of #5109 runs; this is the brief half.

platform: n/a (prose in a role brief; nothing built).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
