---
"@a11ign/agent-org": patch
---

A spawned engineer now starts in its row's worktree: the spawner claims the row first (as the role it is about to start, from that role's own linked worktree), opens the pane with `--cwd` set to the `wt-<row>` the claim created, and releases the claim if the workspace or the agent then fails to start. A refused claim opens no pane. A standing engineer's order names `role-<you>` only when it exists and otherwise gives the command that creates it; no order offers another session's worktree to borrow (#2405).
