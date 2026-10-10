The work tick has logged `org-health: class-repeat UNKNOWN ... class:sweep-overrun ... class:chairman-label-not-chairman (not in .agent-org/failure-classes.json: fix the label or add the class)` for 30 consecutive ticks (about 63 minutes, first seen 2026-10-10T21:59Z). Both are EVENT kinds the host writes to the failure ledger and neither had a definition, so `class-repeat` could not read them as classes and said so on every tick. This adds the two definitions; no other class, `seed` or file is touched.

- `sweep-overrun` (ledger: a11ign/a11ign#4278, a11ign/agent-org#522): guard is the CI-fix box in agent-org `src/sweep-window.ts`; `guardNote` says the box bounds the cost, not the overruns, and that two refs make it a repeat.
- `chairman-label-not-chairman` (ledger: seven rows by one login, 2026-10-10 20:11Z-20:27Z): guard is the gate ignoring the label, recording once and ordering `ceo`; `guardNote` says the act is not prevented and that why that login added it has not been read.

Re-read: both guards were checked against agent-org source (`src/sweep-window.ts`, `readChairmanPriority` and `ignoredLabelOrder` in `src/work-gate.ts`, `src/failure-recorders.ts`) and both kinds against the live ledger, not against the log line. Neither new class trips `class-repeat` now: `CLASS_REPEAT_WINDOW_MS` is 90 minutes and each kind's newest occurrence is hours old.

Acceptance: node -e 'const c=JSON.parse(require("fs").readFileSync(".agent-org/failure-classes.json","utf8")).classes; for (const id of ["sweep-overrun","chairman-label-not-chairman"]) { const o=c.find(x=>x.id===id); if(!o||!o.guard||!o.guardNote||!Array.isArray(o.seed))process.exit(1) }'

Mutation: the same command against `HEAD:.agent-org/failure-classes.json` (before this change) exits 1; against the edited file it exits 0. The file is data, so there is no detector to break in the other direction.

Closes: none -- fixes a repeating log line from the work tick (the Boy Scout rule, #2848) and no row asked for it.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
