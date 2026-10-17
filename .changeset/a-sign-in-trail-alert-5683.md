---
"a11ign": patch
---

The sign-in trail now records the alert a rejected one-time code raises. The loop acts on a screen once and then skips it while it stays the same screen, so the page that comes back after a wrong code was never written; it is now recorded as an `observed` branch whenever its alerts or controls change, by role and accessible name and never a value (#5683, under #5564).
