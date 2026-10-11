platform: GitHub's own `schedule`, `workflow_run` and `concurrency`; secrets are masked by the platform and referenced only as `${{ secrets.NAME }}` in an `env:`; the incident path is `registry-consumer-gate.yml`'s, and the run's setup steps are `action.yml`'s. Nothing here is built that one of them already does.

Adds `.github/workflows/auth0-e2e.yml` (job `e2e` on `windows-2022`, job `incident` on `ubuntu-latest`), the flows file it scans with (`packages/cli/src/auth/auth0-e2e-flows.yml`), and the offline test (`auth0-e2e-flows.test.ts`, 18 tests). It moves the `@a11ign/screenreader-worker` pin from 0.9.0 to 0.12.0 (`package.json` range and `pnpm.overrides`, `pnpm-lock.yaml`; 0.10.0 is the first release that reads `auth.loginBlock` and a TOTP).

**What the run is.** The scan form, `a11ign http://localhost:4173/ --flows <file>`, with no `--login-flow` and not `login --check`. The flows file is a `login:` block of three variable NAMES (`AUTH0_TEST_USER`, `AUTH0_TEST_PASSWORD`, `AUTH0_TOTP_SEED`) and one signed-in check, the heading `Signed in to the a11y-witness test page`. The CLI sends it as `auth.loginBlock` (#5054), and the worker reads the values from its own environment, so the five `AUTH0_*` repository secrets are in the `env:` of the one step that starts the worker. Triggers: `workflow_run` after `release` (success only), a daily `37 6 * * *`, and `workflow_dispatch` with a `falsifier` input. A failure files ONE incident: `incident` lists the open `auth0-e2e` row, comments on it, else creates it, and holds `issues: write` where `e2e` (which reads the secrets) does not.

**The falsifier is in the workflow, not only the test.** `workflow_dispatch` with `falsifier: true` replaces the seed with a random base32 string and then requires the opposite of the ordinary run: exit non-zero, `auth-login-failed`, heading NOT heard. A falsifier that signs in fails the job. That is Done-when 2's wrong-seed run, ready for the chairman's hand-run.

**Measured at this head:** `auth0-e2e-flows.test.ts` 18 tests pass (the command below). `packages/guards/src/**` 1269 tests: one failed, `screenreader-worker-extraction.test.ts`, which hard-codes the consumed version; see "Outside the Region" below, and it passes after that edit (10 tests). `eslint` on the new test file exits 0 (the repo-wide `pnpm run lint` is run by `verify`, below); `pnpm run typecheck` exits 0.

Acceptance:
git grep -q "POSITIVE CONTROL" -- packages/cli/src/auth/auth0-e2e-flows.test.ts
npx rstest run --config scripts/rstest/rstest.config.ts --include packages/cli/src/auth/auth0-e2e-flows.test.ts

Mutation: eleven edits, one at a time, each restored from a copy and compared identical (`restored identical: True` printed by the harness), the unmutated file passing as the control (M12, 18 of 18):
- M1 the placeholder replaced in the flows file: turns red `the placeholder is in the committed file once` and `the scan sends the block's NAMES and the tenant's origin`.
- M2 a literal seed in `totp:`: turns red `a literal seed in the totp: key is refused login-literal`, plus the two positive controls that parse the file.
- M3 the check a `url:`: turns red `a check that is a url: is refused login-check-url` and the positive controls.
- M4 `${{ secrets.AUTH0_TOTP_SEED }}` in a `run:` script: turns red `the workflow's only references to a secret are ... in an env: block`.
- M5 `issues: write` on the `e2e` job; M6 `issues: write` removed from `incident`; M10 the open-row lookup removed (a row on every failure): each turns red `the failure path has the shape registry-consumer-gate.yml's has`.
- M7 `totp-rejected` asked before `mfa-unavailable-on-plan`: turns red `a recorded plan refusal is mfa-unavailable-on-plan and the workflow's outcome list can name it`.
- M8 `keep` stops searching the password: turns red `keep drops a file that holds any of the five values` and `a keep that does not search one of the five values`.
- M9 the reader searches the whole result rather than the `transcript` field: turns red the reader's positive and negative controls.
- M11 the plan cause sentence changed to name the seed: turns red `the incident says the plan is the cause for the plan stop`.

**Outside the Region, said plainly.** `packages/guards/src/screenreader-worker-extraction.test.ts` is not in the row's Region, and it carries three occurrences of the consumed version `0.9.0` (a comment, `CONSUMED_VERSION`, and a test title). Any bump past 0.9.0 turns it red, and the row is a bump; #4442 moved the same constant in its own bump PR (8dfb87ce4). The edit is those three strings and nothing else. If the Region is held to the letter, that file is the one `product-manager` needs to add to it.

**Not done here, and why:**
- **Done-when 2 is the chairman's hand-run on #4084**: a real tenant, the five secrets (`gh secret list` is 403 for this identity) and a Windows runner with NVDA. Nothing in this PR has run against Auth0 or a worker; every statement above is from the offline test and the parser, and the workflow's bash was exercised in pieces (the classifier, `keep`, the transcript reader, the incident's cause text) and never end to end.
- **The tenant's origin is a placeholder in the committed file**, written over in a copy under `$RUNNER_TEMP` by the workflow (`AUTH0_DOMAIN` is a secret, so the file cannot name it). The row's text names `--flows packages/cli/src/auth/auth0-e2e-flows.yml`; the run scans the substituted copy of that file. The test pins that the placeholder appears once.
- **The tenant's origin does ride the wire** as `auth.idpOrigins` (the worker must be told which provider it may pass through), to the local worker on `127.0.0.1`. The credentials and the client id do not. An artifact file that holds the domain is dropped by `keep`, so a failure's stderr that quotes the tenant URL is not uploaded.
- **A possible one-time-code reuse inside one 30 s window**: the CLI's own rule-layer sign-in and the worker's both present a code from the same seed. If the provider rejects a reused code, the second would read `totp-rejected` on a correct seed. I could not run it live; the falsifier and the first real run will show it. If it bites, the owner is the CLI's rule-layer sign-in, not this workflow.
- **`auth-masks.ts` needs `--login-flow`**, which this run does not pass, so the workflow's mask step imports `maskLines` and prints the derived forms itself. A block-aware mask entry point is a finding for the CLI's owner, not part of this diff.
- **`scripts/rstest/rstest.config.ts` does not list the flows file in `READ_FILE_TRIGGERS`.** The test reads it through the path the workflow's `cat` names, so `--changed` selects the test for any workflow change but not for an edit to the flows file alone. CI runs the whole set; adding the one line is the config owner's.

Closes #4975
