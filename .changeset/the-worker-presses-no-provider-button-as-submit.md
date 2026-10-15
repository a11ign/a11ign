---
"a11ign": patch
---

Locks `@a11ign/screenreader-worker` at `0.13.2`, whose screen loop never presses a provider-named control (`Continue with Google`, `Sign in with Apple`, and the other named providers) as a login form's submit (#5493, ported to the worker in a11ign/screenreader-worker#61). The login of an authenticated capture runs in the worker, so the core's fix did not reach a run until the worker had it too. Nothing else in the package changed.
