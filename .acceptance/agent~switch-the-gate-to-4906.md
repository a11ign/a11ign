`.agent-org/host.json` gains the `github.identity.scheduler` block of a11ign/agent-org#770 (released as v0.146.0, tagged 2026-10-10T22:00:16Z; the merge commit `1251beec` is contained in that tag, measured with `git tag --contains`): `mode: "github-apps"`, `appId` 5267089, `installationId` 170075049, `keyPath` `/home/agent/.config/agent-org/apps/a11ign-scheduler.pem`, exactly the block worker-4900 posted on #4900. The `workers` and `managers` roles are NOT named, so they stay `user-accounts` (their switches are a separate row each). A `_github` prose key beside it carries the one-line revert.

- **Measured, the tool's own reader** (`readHostConfig` and `roleIdentity` from agent-org at v0.146.0, `AGENT_ORG_HOST` pointed at this worktree's `host.json`): the file parses without a `HostConfigRefusal`, `scheduler` is `github-apps` with the ids above, `workers` and `managers` are `user-accounts`.
- **Key present** (measured, `ls -l`): `/home/agent/.config/agent-org/apps/a11ign-scheduler.pem`, mode 0600.
- **Not done here, and why:** the row's steps 2 and 3 (`host:install` once this merges, then the live reads and writes as `a11ign-scheduler[bot]`, and the Done-when hour of zero `nothing was examined` lines) happen on the host AFTER the merge. They are readings of a tick that has not run, so nothing in this PR claims them.

Acceptance: bash -c 'node -e "const h=require(\"./.agent-org/host.json\"); if(h.github?.identity?.scheduler?.mode!==\"github-apps\") process.exit(1)"'

Mutation: (A) `"mode": "github-apps"` changed to `"mode": "user-accounts"` makes the Acceptance exit 1 (the block present but off); (B) removing the `github` key makes it exit 1 (the block absent). Each is a one-edit change run from outside the file.

Closes #4906
