`docs/gate-spend-after-snapshot.md` is the reading #4616 asks for: no source file changed. One cause for all three callers (`host/gh` drops the whole read store on every call it classes as a write, about one every 5 s on this account), each caller's call site at a stated commit, the ledger window that produced the numbers, and `Fix file: host/gh`.

- **Measured** (workers ledger, 2026-10-09T18:07:17Z..18:49:09Z, frozen copy): 557 / 199 / 221 calls from `work-gate.ts [pr list]`, `work-gate.ts [issue list]`, `work-tick.ts [issue list]`; 0 / 10 / 0 served from the store; 561 store-dropping calls in 41.9 min (median gap 1 s, longest 62 s); every one of the three callers' calls had a drop in the 60 s before it.
- **Inferred, and said so in the note:** which source lines make the REST writes the ledger records only as `api -X`/`api --method`; why `a11ign/a11ign` and `agent-org` move on every tick (not established).

Acceptance: bash -c 'test -s docs/gate-spend-after-snapshot.md && grep -q "work-gate.ts" docs/gate-spend-after-snapshot.md && grep -q "work-tick.ts" docs/gate-spend-after-snapshot.md && grep -q "^Fix file: " docs/gate-spend-after-snapshot.md'

Closes #4616

🤖 Generated with [Claude Code](https://claude.com/claude-code)
