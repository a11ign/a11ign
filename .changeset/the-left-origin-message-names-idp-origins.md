---
"a11ign": patch
---

The `left-origin` message no longer says an identity-provider redirect is SSO, which v1 does not do. A redirect to a provider the flow does not declare still ends the run, and the message now names `idp-origins:` in the flows file as the way to declare one (#4088). SSO beyond that is still not supported: the message keeps the route to a dedicated test account without MFA or SSO. The worker the lockfile installs is `@a11ign/screenreader-worker` 0.13.5, which carries the same sentence, so the CLI's parity test holds (#5644, under #5648).
