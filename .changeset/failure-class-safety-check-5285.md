---
---

A PreToolUse hook on Bash (`scripts/claude-hooks/refuse-unreadable-command.ts`) refuses the two command shapes Claude Code's safety check denied six times (a nested `bash -c` carrying `$`, a removal with a variable target) and prints the rewrite (#5285).
