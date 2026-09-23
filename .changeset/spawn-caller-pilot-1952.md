---
"@a11ign/agent-org": patch
---

**`spawnInvocation` has a production caller: `deliver` now STARTS a process for one cause when no engineer
exists to take it (#1952, `ceo`'s pilot on #1950).** Measured at `f34e5d817` while that row was ruled, the
only reference to `spawnInvocation` outside a test was its own `export function` line — the spawn machinery
was a library with a test suite and no production path, and the standing six sessions carry neither
`--model` nor `--effort`, so `worker-profile.mjs`'s entire per-cause routing table chose nothing for
anybody. That is the argument only spawning answers: a `/clear` cannot change a model.

Wired BESIDE the standing path, never in place of it. `route` is asked first and unchanged, so every order
a standing session can take still goes to one; the spawn runs only where `deliver` used to write
`UNDELIVERED` and move on, and only for `ready-row-unclaimed` addressed to the engineer pool
(`SPAWN_CAUSES`, `isPilotOrder`). An order that was never a candidate reports what `route` said and nothing
more — its refusal text is byte-identical to before.

**The name is a ROSTER ROLE, which is #1951's ruling rather than a shortcut.** `session:<name>` is a routing
address: `arm-pr`'s `LIVE_SESSIONS` refuses a label outside `sessions.json`'s `live`, and B2 caps one row in
build per name — so a process called `eng-2131` starts fine and can claim, label and comment on nothing. So
only an engineer role with NO process at all is spawnable, and the other states are refused each for its own
reason: a `working` role's address may already hold a row in build, a `blocked` one's pane is the only record
of the question it stopped on (`work-tick` prints `BLOCKED` for a human to read), and `unknown` is a pane
with no agent, where a second workspace under the same label would leave `route` with two rows for one
address. `MAX_SPAWNS_PER_TICK` is 1, so a partial workspace-list read costs one process rather than the
roster.

Teardown covers the only window that can orphan anything — between `workspace create` and a successful
`agent start` — because a workspace with no agent reports `agent_status: "unknown"`, which `WAKEABLE`
excludes and the allocator refuses, so an abandoned pane carrying a role's label would silently remove that
engineer from the org. A close that itself fails is reported and names the workspace. A started process whose
prompt is refused is left running and its causeKey left unspent: it is a healthy idle session under a roster
label, and the ordinary route places the order on the next tick.
