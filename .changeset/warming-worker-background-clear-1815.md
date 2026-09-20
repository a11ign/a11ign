---
"@a11ign/nvda-worker": patch
---

**A worker held by a stray foreground dialog (`ShellExperienceHost`, a notification toast) now clears itself in the background instead of needing a console login or a reboot.** Before, the self-heal added by #1733 only ran at the start of a capture, and a held worker reports `not ready` -- so a capture, and the self-heal it carries, was never dispatched to it. Three real incidents (`a11y-worker-4`, `a11y-worker-10`, `a11y-worker-3`) each ended only in a manual console clear or a reboot.

A slow background timer, off `/health`'s own request path, now retries the same bounded clear (`dismissForegroundBlocker`) whenever the last sample already shows a blocker cached, rate-limited so a worker genuinely held by something the clear cannot dismiss does not spin PowerShell forever (#1815).
