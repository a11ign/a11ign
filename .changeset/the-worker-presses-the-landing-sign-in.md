---
"a11ign": patch
---

Locks `@a11ign/screenreader-worker` at `0.13.1`, whose screen loop presses the app's own sign-in button on a signed-out landing page (#5278, ported to the worker in a11ign/screenreader-worker#58). The login of an authenticated capture runs in the worker, so the CLI's fix in #5289 did not reach a run until the worker had it too. Nothing else in the package changed.
