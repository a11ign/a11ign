`docs/try-it.md` gains the section "What sign-in covers": three lists (supported, not supported, if your app needs MFA), ADR 0038's Constraint 6 line quoted verbatim, and the Playwright route said plainly to be not built (#4532 sizes it, no document yet). `docs/github-action.md`'s login section links to it. No source file changed.

- **Read, not run:** every scope claim is read off `docs/known-gaps.md` §51, ADR 0038 and `docs/try-it.md`'s existing `idp-origins:` section at this commit. The hosted-provider run is NOT done: it needs a tenant and a test user at a hosted provider, which no org session holds (a decision for the chairman, per the row).

Acceptance: bash -c 'grep -q "^## What sign-in covers" docs/try-it.md && { grep -q "What sign-in covers" docs/github-action.md || grep -q "try-it.md#what-sign-in-covers" docs/github-action.md; }'

Closes #4533
