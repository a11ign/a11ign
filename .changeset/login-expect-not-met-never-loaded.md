---
"a11ign": patch
---

The remediation text for `auth-login-failed` now says `expect-not-met` is also what a page that never loaded ends as, and that the message's step and `could not be loaded (...)` line say which of the two it was, so a reader is no longer sent to fix an `expect:` that was never evaluated (#4015). The set of login-failure reasons is unchanged.
