ADR 0038, known-gaps §51 and the tester's guide describe a login with MFA by authenticator-app seed (TOTP), and agree with the shipped step (`login:` with `totp:` naming an environment variable, `packages/cli/src/auth/auth0-e2e-flows.yml`). Documentation only: the four files are `docs/adr/0038-authenticated-capture.md` (Amendment 10 at Constraint 6), `docs/known-gaps.md` (§51), `docs/try-it.md` (a section on a login with MFA) and `docs/github-action.md`.

**Evidence the claims rest on:** the Auth0 end-to-end pair on `a11ign@0.10.8` in the private `a11ign/auth-capture-check` (read on a11ign#5293, 2026-10-15): the ordinary run https://github.com/a11ign/auth-capture-check/actions/runs/38769795554 ended `success`, and the falsifier run (a wrong seed) https://github.com/a11ign/auth-capture-check/actions/runs/38770567987 ended `auth-login-failed` as its workflow requires. One tenant, one provider; both runs were re-read through `gh run view` at this head (conclusion `success`, status `completed`).

**Verified by following the section, not by reading it (Done-when 3).** The YAML under "3. Write a `login:` block" in `docs/try-it.md` was extracted and parsed by the real flows parser (`parseFlowsFile`, then `resolveAuthentication`, the functions the CLI runs) at this head, with a built `dist`:

```
parsed login: {"url":"https://staging.example.com/","username":"APP_TEST_USER","password":"APP_TEST_PASSWORD","totp":"APP_TOTP_SEED","check":{"role":"heading","name":"Dashboard"},"idpOrigins":["https://login.example.com"]} flows: 0
wire: {"url":"https://staging.example.com/","usernameEnv":"APP_TEST_USER","passwordEnv":"APP_TEST_PASSWORD","totpEnv":"APP_TOTP_SEED","check":{"role":"heading","name":"Dashboard"}} idp: ["https://login.example.com"]
negative control refused: login: has unknown key "totp-from-env"; the keys are url, username, password, totp, check, organization, fields, idp-ori
```

The step is accepted, the wire carries variable NAMES only, and the provisional `totp-from-env:` key the row warned against is refused by the same parser.

**Deviations from the row, stated:** the row asked for the seed to be described as "redacted like a password". It is not: no run prints it, so the text says it is never held in the output (read from the worker's own environment, never on the wire, a literal refused as `login-literal`, a code never recorded). And the Action does NOT take a `login:` block (`flows` and `login-flow` are both required in `action.yml`), so the section is written as the command-line form and says the Action does not read it, rather than describing a path no run has taken.

Acceptance:
git grep -q "Trouble scanning" -- docs/try-it.md
git grep -q "Trouble scanning" -- docs/github-action.md
bash -c '! git grep -q "is deferred" -- docs/try-it.md'
bash -c '! git grep -q -E "TOTP .*out of reach of a scan|computed only by .a11ign login --check" -- docs/try-it.md'
git grep -q "Amendment 10 (#4976" -- docs/adr/0038-authenticated-capture.md
git grep -q "Amended 2026-10-15 (#4976" -- docs/known-gaps.md
git grep -q "auth-refused-public-repository" -- docs/try-it.md
git grep -q "a11ign/auth-capture-check" -- docs/github-action.md

**Mutation:** restoring the old sentence "TOTP (an authenticator-app code) is out of reach of a scan" in `docs/try-it.md`, or removing "Trouble scanning" from either guide, turns the matching command red (exit 1); each is a one-line change.

Closes #4976
