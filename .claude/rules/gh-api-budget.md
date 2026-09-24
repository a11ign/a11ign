## The API budget — `gh api rate_limit` is a broken gauge (2026-09-22, #1967)

- **Never decide anything from `gh api rate_limit`.** It has reported a FULL pool during a total GraphQL
  outage of that same token, and has lied twice three weeks apart (#1275, #1967).
- **Read `X-Ratelimit-*` off a real call to the pool you care about** — `gh api graphql -f
  query='{viewer{login}}' -i`, or `gh api <rest-path> -i` — and let `X-Ratelimit-Resource` confirm which
  pool answered. **The headers come back on the 403 too**, so an exhausted pool is readable.
- **Pools are per TOKEN and per RESOURCE, and the endpoint can be right about one while lying about the
  other: a sanity check on core is not a sanity check.** Same token, same second: `graphql` off by
  1,360. `gh pr view`/`pr list`/`issue list` spend GRAPHQL;
  `gh api` spends CORE.
- **Per TOKEN means per ACCOUNT, and there are two here.** The default `~/.config/gh` authenticates as a
  person (`DanBeckDev`), and `GH_CONFIG_DIR=/home/agent/workers/gh` as `a11ign-ai-workers` — which is what
  `a11ign-work-tick.service` sets. So an exhausted pool always has a healthy-looking neighbour, and
  **you must not switch to the other config to get past your own limit.** One export changes who every
  subsequent write is attributed to, and that disposition is `ceo`'s (`lane:ceo`, #916) rather than yours.
  Wait out your own reset.
- **You may already be spending an account you did not pick, so name it before you read its pool.**
  `/home/agent/.local/bin/gh` (shipped: `packages/agent-org/host/gh`) is a ROUTING WRAPPER ahead of
  `/usr/bin/gh`, and `git push` goes through it: with `GH_CONFIG_DIR` unset an agent workspace gets the
  workers config UNLESS it is in `human-account-workspaces.txt` (w6 w2 w5, temporary), and no workspace id
  means a person, so a systemd unit must DECLARE `GH_CONFIG_DIR`. **Run `gh api user
  --jq .login` first, then the headers** — PATH and workspace id decide the pool.
