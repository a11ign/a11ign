`docs/gate-exit-codes.md` row for `control-unit-drift` now names the file that exists (`.ts`, since #4268), says the hourly fleet-watch tick (`a11ign-fleet-watch.timer`) runs it, and states what pages: `differs` and `missing-on-host` are ATTENTION, `not-shipped` is printed and never raised, as `fleet-watch.ts` (`ATTENTION_KINDS`, `exitCodeFor`) does. Only that one table row changed.

- **Measured** (agents host, `journalctl --user -u a11ign-fleet-watch.service --utc`, 2026-10-10T09:47:21Z, the tick started 09:47:01Z with the core's `layers.json` control pin at `v0.3.3` and `.layer-ref` of the laid `packages/control` reading `v0.3.3`): `unit-drift, reported and not raised: a11y-bootstrap.service, a11y-fleet-patch-window.service, a11y-fleet-patch-window.timer installed on the control host and shipped by no playbook`.
- **Mutation:** the Acceptance run against `HEAD` before this change exits 1 (the row had no "hourly fleet-watch tick" and named `control-unit-drift.mjs`); against the changed file it exits 0.

Acceptance: bash -c 'git grep -q "hourly fleet-watch tick" -- docs/gate-exit-codes.md && ! git grep -q "control-unit-drift[.]mjs" -- docs/gate-exit-codes.md'

Closes #4730

🤖 Generated with [Claude Code](https://claude.com/claude-code)
