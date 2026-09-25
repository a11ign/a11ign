---
"@a11ign/agent-org": patch
---

**The reviewer's login-loss detector now recognises codex's logged-out startup screen (#2555).** `authFailureShownIn` matched none of its four phrases on what codex 0.157.0's TUI renders at startup on a rejected credential (measured 2026-09-25 with an expired fake credential in a private `CODEX_HOME`: the onboarding screen, `Welcome to Codex, OpenAI's command-line coding agent` / `Sign in with ChatGPT`), so only the 30-minute silence signal could catch it. It now also answers with the welcome line when the same text carries `Sign in with ChatGPT`; either half alone returns `null`, so a reviewer quoting the sign-in phrase is not a login loss. The four phrases, their order and their binary-provenance test are unchanged (a second constant, `CODEX_LOGGED_OUT_SCREEN`). What is NOT measured: what a pane that loses its login mid-session renders.
