---
"@a11ign/agent-org": patch
---

**The reviewers' door is now installed from the repository by a script, and the result is read back byte-for-byte (#2193).** `pr-review-verdict.sh` became reviewable in #2127, but the copy that runs on the host was never replaced, so no review carried the `review/<session>` status the source writes. `install-reviewer-bin.sh [destination]` copies the source over the installed door atomically, keeps what it replaced beside it, refuses to report success unless the installed file is identical to the source, and prints the positive control to read next (a review with no status is an unset `A11Y_REVIEWER_SESSION`, not an uninstalled door).
