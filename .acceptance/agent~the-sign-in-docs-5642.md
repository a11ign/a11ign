## What

The sign-in docs state the scope that is true now. known-gaps §51 and ADR 0038 Constraint 6 are retitled and lead with the current scope (TOTP from v3 on the command line and not yet in the Action; SSO, push, SMS, a security key and a CAPTCHA not supported; one provider read), the v1 text sits under a `History (v1)` heading at the end of each, and `docs/try-it.md` opens "What sign-in covers" with one table and no longer quotes the "OUT of v1" block. The old ADR and §51 anchors stay as explicit `<a id>` lines.

platform: nothing built; markdown headings, `<a id>` anchors and the existing `docs:known-gaps-index --write`.

Acceptance:
```bash
grep -L -i -E "^#+ .*out of v1" docs/known-gaps.md docs/adr/0038-authenticated-capture.md | wc -l | grep -qx 2
grep -L "OUT of v1" docs/try-it.md | wc -l | grep -qx 1
sed -n "/^## 51\./,/^## 52\./p" docs/known-gaps.md | grep -q -E "^#+ History \(v1\)"
grep -q -E "^#+ History \(v1\)" docs/adr/0038-authenticated-capture.md
grep -q 'id="constraint-6-mfa-sso-and-captcha-are-out-of-v1"' docs/adr/0038-authenticated-capture.md
sed -n "/^## What sign-in covers/,/^### /p" docs/try-it.md | grep -q "^|"
```
