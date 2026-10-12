## What

`.agent-org/host.json` `github.identity` gains `reviewer`: `a11ign-reviewer`, App ID 5289999, installation 170704524, key at `/home/agent/.config/agent-org/apps/a11ign-reviewer.pem` (a path, never the key; values from a11ign/a11ign#5090, comment 6129954175). This is the declaration only: `ceo` runs `host:install`, and the live reading (an App-authored approval counting toward `main`'s merge rule) is Done-when 1 of agent-org#959 and is not made here.

**One-line revert:** set `"mode": "user-accounts"` for `reviewer`, then `host:install`.

**Known risk, named before it bites:** #5090 notes GitHub counts approvals only from identities with write access, and this App has Contents: read. If the first App approval does not count, say so on agent-org#959 before any permission is widened.

platform: n/a (one declaration in an existing block)

Acceptance:
```bash
bash -c 'jq -e ".github.identity.reviewer.mode == \"github-apps\" and (.github.identity.reviewer.slug | endswith(\"reviewer\"))" .agent-org/host.json'
```
