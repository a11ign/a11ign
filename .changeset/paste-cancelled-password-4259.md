---
"@a11ign/judge": minor
---

3.3.8 Accessible Authentication (Minimum) can now produce a finding: a password field whose paste event is cancelled is a REFERRED finding (`secondary`, so `cantTell`, never asserted), read from an optional `formInputs[].pasteCancelled` and silent when it is absent or false. The criterion's coverage note cites the Understanding page's own paste text and no longer cites F109, which is titled "preventing password or code re-entry in the same format" (#4259). No worker-side census populates the field on a real capture yet, so the rule has not fired on a real page.
