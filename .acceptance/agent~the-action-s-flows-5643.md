`action.yml`'s `flows` input description no longer says "MFA, SSO and CAPTCHA are out of v1". It now says what the Action does: a login cannot get past an MFA prompt, a CAPTCHA or a one-time code; SSO is not supported beyond a username and password on a form at a named origin; an authenticator-app code works on the command line only. It links the scope table in `docs/try-it.md`. No other file changed.

- **Measured:** the Acceptance grep returns `0` for "out of v1" in `action.yml`; `action.yml` parses as YAML with the new description; the CLI action tests that read `action.yml` pass (129 of 129, across the six files that import it) after `pnpm run build`.
- **Read, not run:** each scope claim is read off `docs/try-it.md`'s "What sign-in covers" section and `docs/github-action.md` line 488 and 554 at this commit. The Action itself was not run against a login.

Acceptance: grep -c "out of v1" action.yml | grep -qx 0 && grep -q "cannot get past an MFA prompt" action.yml && grep -q "authenticator-app code works on the command" action.yml && grep -q "docs/try-it.md" action.yml

Closes #5643
