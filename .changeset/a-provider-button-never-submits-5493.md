---
"a11ign": patch
---

The screen loop never presses a provider-named control (`Continue with Google`, `Sign in with Apple`, and the other named providers) as a login form's submit. Among several remaining submit candidates the exact name (`Continue`, `Log in`) wins, and when none is exact the form is `ambiguous` and waits rather than pressing the first by page order (#5493). The worker's copy is #5494.
