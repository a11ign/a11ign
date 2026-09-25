---
"@a11ign/agent-org": patch
---

**`worker-capture`, `worker-judge` and `worker-tooling` are retired (#2505, chairman's ruling of 2026-09-25 on #2470).** `sessions.json` moves the three standing engineers from `live` to `retired` with `retiredBy: "#2505"`, so a `session:worker-capture` label is now refused as RETIRED while `session:worker-4` and every other `worker-<n>` still passes. The two role briefs (`worker-capture.md`, `worker-judge.md`) are deleted and the roster table no longer lists them; the ban the engineer brief carries is now checked against the eight families the row measured instead of being derived from the deleted files. No role carries `drain` any more, so the drain's tests run against a fixture roster that marks one, and the `_drain` note records that the ruling replaced #1950's 20 clean cycles. `ROUTED_TO["fleet-gated"]` in `work-gate.mjs` still names `worker-capture` and is its own row.
