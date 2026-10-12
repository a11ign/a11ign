Flags the agents host's declaration for the last mile of the event feed (#5043, chairman's ruling 2026-10-12 on #5197): `events.tunnel: "tailscale-funnel"` with `publicUrl` `https://agents.tail15a8bb.ts.net/webhook`, the receiver on loopback port 8787 with its secret at `~/.config/agent-org/webhook-secret`. **`source` stays `poll`**: a11ign#5168 flips it once the feed is proven, and the receiver runs beside the poll until then (the gate acts only on `source: webhook`).

**Order matters, and this pull request is held for it.** The release before `a11ign/agent-org#1125` REFUSES a `poll` host that names a receiver, so this file merged first would stop every tick. It merges only after #1125's release is tagged, and then `update-tool` moves the host onto it.

After the merge, the host does the rest and each step is read, never assumed: `agent-org host:install` writes `a11ign-event-receiver.service` and `a11ign-event-tunnel.service`; the chairman's brief on #5197 (`sudo tailscale set --operator=agent`, the tailnet's `funnel` attribute for `tag:agents`, and the scheduler App's webhook Active with that URL and the ten events) must be done first or the unit fails, and says so in its journal; then `node src/event-tunnel.ts register` sets the secret, and `deliveries` reads GitHub's log for the ping and the first `pull_request`.

Flag: events.tunnel
Health-signals: blind-ticks, wakes-held
Revert: set `"tunnel": "none"` in `.agent-org/host.json` and run `agent-org host:install` (the unit is removed and its path leaves Funnel); the chairman then sets the App's webhook inactive

The row's Acceptance, `cd ~/repos/agent-org && AGENT_ORG_HOST=/home/agent/repos/a11y-witness/.agent-org/host.json npx rstest run --config scripts/rstest/rstest.config.ts src/event-tunnel.test.ts`, reads the main checkout's `host.json` and the tool at a release tag, so it can only be read AFTER both pull requests merge and #1125 is tagged; it is quoted on #5197 then. The command below is what this job can run.

Acceptance: `jq -e '.events.source == "poll" and .events.tunnel == "tailscale-funnel" and (.events.publicUrl | test("^https://[^/]+/[A-Za-z0-9_.~-]+$")) and .events.receiver.tunnel == "tailscale"' .agent-org/host.json`

Closes #5197

platform: Tailscale Funnel (`tailscale funnel --bg`) is the mechanism and GitHub's own App webhook is the feed; nothing is reimplemented.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
