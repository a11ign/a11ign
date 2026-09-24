---
"@a11ign/agent-org": patch
---

**The trunk auto-revert is now the fallback, not the default (#2349).** When a merge turns `main` red, `trunk-revert.mjs` still opens the revert as an unarmed draft, but it now comments on the merged PR with the failing test's name, the run and the deadline, and a new `--settle` step in `trunk.yml` waits `FIX_FORWARD_WINDOW_MINUTES` (60) before reading the world once: a PR that names the failing run (or carries a `Fixes-trunk:` line) closes the revert with a comment naming it; otherwise, or at once when no author can be resolved, the revert is readied and armed. The account that opened the revert PR is now printed as `REVERT PR AUTHOR ACCOUNT`.
