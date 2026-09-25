---
"@a11ign/agent-org": patch
---

**The engineer brief now carries four habits for keeping an engineer's context small, each naming its tool (#2540).** Read ranges with `Read` `offset`/`limit` after a `git grep -n`, summarise command output with `| tail`, project `gh` JSON with `--jq`, and send exploratory reading to a subagent with `model="haiku"`. One section of `engineer.md`, 922 bytes added, pinned by `engineer-brief-context-habits.test.ts`, which slices the section by its heading so a duplicate spelling elsewhere in the brief does not satisfy it.
