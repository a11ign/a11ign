---
"@a11ign/agent-org": patch
---

**The repeating-lines allowlist now covers pnpm's echo of the tick's `primary:update` step.** #2974's cut-over 3 moved the tick unit's `ExecStartPre` from npm to pnpm, and pnpm appends the checkout path to the echo (`> a11ign-monorepo@0.0.0 primary:update /home/agent/repos/a11y-witness`) where npm printed none. The existing entry ended in `$` and so stopped matching: the line was offered to `orchestrator` as a fault after 75 consecutive ticks (about 3 hours). It is the runner announcing a command, not a fault, so the entry takes an optional ` /path` suffix and carries the reason; the entry still names one script and nothing may follow the path.
