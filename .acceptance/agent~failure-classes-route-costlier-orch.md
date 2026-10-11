The work tick has logged `org-health: class-repeat UNKNOWN ... class:route-costlier-than-fallback (not in .agent-org/failure-classes.json: fix the label or add the class)` for 30+ consecutive ticks (first seen 2026-10-11T00:09Z). It is an EVENT kind, not a row label: agent-org `src/engineer-route.ts` (`ROUTE_COSTLIER_THAN_FALLBACK`, a11ign#4764) writes it to the failure ledger, and no row in any a11ign repository carries a `class:route-costlier-than-fallback` label (checked on every repository in the organisation). The kind had no definition, the same shape as #4915's two kinds. This adds the one definition; no other class, `seed` or file is touched.

- `guard` is **null**, deliberately. The detector (`routeCostReading`/`routeCostEvents`) is in force but only records one line a day; it does not stop the provider routing dearer than the fallback, and a control that records is a `guardNote`, not a guard.
- `guardNote` states the two ledger refs (`@2026-10-10` 09:40Z, `@2026-10-11` 00:06Z), so it is a repeat, and that both predate agent-org v0.151.0 (00:42Z), the first release carrying a11ign#4904. Whether that release closes the class has NOT been read; the next ledger line after it is the reading.
- Defining it does not trip `class-repeat` now: its newest occurrence (00:06:42Z) is older than the 90-minute `CLASS_REPEAT_WINDOW_MS` at the time of writing (01:45Z). A new occurrence inside a window WILL trip it, which is the class doing its job.

Re-read against agent-org source and the live ledger (`failure-ledger`), not against the log line.

Acceptance: node -e 'const c=JSON.parse(require("fs").readFileSync(".agent-org/failure-classes.json","utf8")).classes; const o=c.find(x=>x.id==="route-costlier-than-fallback"); if(!o||!o.guardNote||!Array.isArray(o.seed))process.exit(1)'

Mutation: the same command against `HEAD:.agent-org/failure-classes.json` (before this change) exits 1; against the edited file it exits 0. The file is data, so there is no detector to break in the other direction.

Closes: none -- fixes a repeating log line from the work tick (the Boy Scout rule, #2848) and no row asked for it.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
