## What

The nightly Auth0 end-to-end sign-in with MFA was built in `a11ign/a11ign`, which is public, and the product correctly refuses a run that logs in there (`auth-refused-public-repository`, ADR 0038 amendment 3). It now lives in the private `a11ign/auth-capture-check` (PR a11ign/auth-capture-check#13, merged by hand: that repository has no merge queue or auto-merge) and is deleted here.

- `.github/workflows/auth0-e2e.yml` is deleted. There is one copy, in the private repository, so there is no window with two.
- The private workflow resolves the latest `a11ign` release in a secret-free `release` job, checks `a11ign/a11ign` out at that tag's commit (`persist-credentials: false`), builds, and runs the same `login:` block scan with the same `keep` scan, transcript reader, classifier, falsifier input and incident job. `workflow_run` cannot see another repository's workflows, so it runs on its own daily schedule and `workflow_dispatch`.
- `packages/cli/src/auth/auth0-e2e-flows.test.ts` no longer reads the workflow file (it is not in this tree). It keeps the seven checks of the flows file itself: the block of three NAMES and the signed-in heading, what goes on the wire, a literal seed refused `login-literal`, a `url:` check refused `login-check-url`, the one placeholder, no tenant host or routable address. **Not pinned from here any more:** the workflow's secret handling (`${{ secrets.NAME }}` only in an `env:`), its `keep` scan, its transcript reader, its outcome classifier and its failure path. A private repository's file cannot be read by this suite.
- `packages/cli/src/auth/auth0-e2e-flows.yml`: header comment only.

## Evidence

- The ordinary dispatch run in the private repository, https://github.com/a11ign/auth-capture-check/actions/runs/38286376534, ended `failure` with `fault: unknown-screen` (scan exit 2, heading not heard). The guard did NOT fire (private repository, secrets present), so this is the first real reading of the tenant: the loop reached the test app's own signed-out page (heading "Sign in required", one "Sign in" button, no field), which no `FORM_MATCHERS` entry recognises, so nothing presses the button and the Auth0 redirect never starts. Filed as #5278 with the fix named. It is not a missing secret, and `auth-refused-public-repository` is untouched.
- The private repository's incident job filed ONE issue for it, a11ign/auth-capture-check#14, labelled `auth0-e2e`.
- **NOT read: the falsifier run** (wrong seed, must end `auth-login-failed`). It would end `unknown-screen` too until #5278 lands, which would prove nothing about the seed, and ten wrong codes lock the tenant's user.
- `test ! -e .github/workflows/auth0-e2e.yml` and the flows-file test below pass at this head. The row's own Acceptance, `gh run list -R a11ign/auth-capture-check --workflow auth0-e2e.yml --limit 1 ... | grep -qx success`, prints `failure` today, so **#5114's Done-when 1 is OPEN** and this change does not meet it.
- `pnpm run lint`, `pnpm run typecheck` and the flows-file test: 0 errors, 7 of 7.

## What remains, and where it is filed

This change makes Done-when 2 true and carries Done-when 3 (the row for the first reading is #5278). Done-when 1, a green dispatch run and a falsifier read once, waits on #5278's fix being released, so the row's own Acceptance prints `failure` at this head. The PR that is a row's deliverable closes the row (agent-org#744), so this one declares the row it delivers and the merge files the verify row, which reads that Acceptance again. Whether #5114's Done-when 1 moves to #5278 is product-manager's, and is asked on the row.

Outside-Region: packages/cli/src/auth/auth0-e2e-flows.test.ts — the test read the deleted workflow's text, so it stops reading it here
Outside-Region: packages/cli/src/auth/auth0-e2e-flows.yml — its header named the workflow as living in this repository
Outside-Region: .changeset/the-nightly-auth0-end-5114.md — the changeset the repository requires for a change under packages/

## Acceptance

```bash
bash -c 'test ! -e .github/workflows/auth0-e2e.yml && node packages/guards/src/assert-glob-not-empty.ts "packages/cli/src/auth/auth0-e2e-flows.test.ts" --min=1 --run --runner=rstest'
```

Closes #5114
