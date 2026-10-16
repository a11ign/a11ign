The CLI's `left-origin` message no longer says an identity-provider redirect is "SSO, which v1 does not do". It now says a provider the flow does not declare ends the run, names `idp-origins:` as the way to declare one, and keeps the dedicated-account route for SSO beyond that. The same literal is pinned in `idp-origins.test.ts` and quoted in `docs/try-it.md`. The worker's copy of the sentence moved in 0.13.5 (#5648), and this change pins that release, so `interpreter.test.ts` parity holds.

**Measured at this head:** `interpreter.test.ts` 53 of 53 pass (the parity test runs the CLI interpreter and the worker's `auth-flow` over one fake browser). `idp-origins.test.ts` 8 pass, 0 fail, 4 skipped: the skipped four are the real-browser tests, which did NOT run here (no `chromium_headless_shell` installed). The sign-in through a real browser is therefore not exercised by this PR.

The row's Acceptance as first written (`node --test ...`) does not run: the `.js` to `.ts` import is not resolved by plain `node --test`. It runs through `tsx`, as below.

Acceptance: ! git grep -q "which v1 does not do" -- packages/cli/src && pnpm exec tsx --test packages/cli/src/auth/interpreter.test.ts packages/cli/src/auth/idp-origins.test.ts
