---
"@a11ign/agent-org": patch
---

**A claim whose holder's workspace is still listed but holds no agent now reads as gone (#2863).** `goneReading` took any listed entry labelled with the session as presence, but herdr keeps a crashed agent's label and reports `agent_status: "unknown"` ("no agent detected"). `worker-2845`'s claude segfaulted, and the gate offered its stall nudge for 30 ticks to a session that could not receive it, with the release waiting on `STALL_UNTOLD_RELEASE_MS` (4h) instead of `GONE_CONFIRM_MS` (10 minutes). An `unknown` holder now starts and matures the same ten-minute clock as a closed workspace; a holder listed with an agent resets it, and a partial listing still proves nothing. The worktree and its unpushed work are kept either way. #2534 closed the same defect for reviewers.
