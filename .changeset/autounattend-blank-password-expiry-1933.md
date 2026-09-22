---
"@a11ign/worker-fleet": patch
---

**The shipped bare-metal `autounattend.xml` now stops the worker account's blank password from expiring, and the file is now well-formed XML.**

**Why.** Windows expires every password after 42 days by default, and a blank one is no exception. If the password expires before provisioning sets `PasswordNeverExpires`, auto-logon fails. The box then stops at "Your password has expired", and SSH provisioning never reaches it (#1933). A second problem was in the file itself: a comment contained a bare `--`. XML forbids that, so a strict parser rejected the whole answer file.

**What changes.**
- The `specialize` pass now runs `net accounts /maxpwage:unlimited`, which sets the policy before the account exists.
- It also clears the Winlogon `PasswordExpiryWarning` value.
- The comment's `--` is now an em dash.

**What does not.** The account, its blank password, and the auto-logon and bootstrap steps are all unchanged. The PXE answer file is unchanged too.
