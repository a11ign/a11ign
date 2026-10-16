Octo STS trust policy for agent-org's `board-outside.yml`, the outside home of board report (agent-org#1581; home row agent-org#1574; epic a11ign#5602). The file is `.github/chainguard/outside-board.sts.yaml`: identity `outside-board`, subject by immutable ids (owner 320310787, agent-org 1388747923), `job_workflow_ref` pinned to `main`, grant as `board-report.yml` holds it plus `pull_requests: read`.

- **Parses as YAML** with keys `claim_pattern`, `issuer`, `permissions`, `subject`.
- **Mutation:** the pinned `board-outside\.yml@refs/heads/main` replaced by `…@refs/heads/other` makes the acceptance grep exit 1; restored byte-identical (`diff` against a copy) and the grep exits 0 again.
- **Guards:** `packages/guards/src/octo-sts-policies.test.ts`, `octo-sts-trusted-issuers.test.ts`, `nightly-reads-octo-sts.test.ts`, `auto-arm-octo-sts.test.ts`: 30 of 30 pass; the new file names neither `corpus-backups` nor `auth-capture-check`.
- **Open-check:** `git ls-tree --name-only origin/main .github/chainguard/ | grep -c outside-board` is 0 before the change.

Acceptance: git grep -l -F 'board-outside\.yml@refs/heads/main' -- .github/chainguard/outside-board.sts.yaml
