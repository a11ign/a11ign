The class index's `owner-unresolved` guard now says what agent-org#637 (row #4808) added (the `owner-gone` rung also fires for an OPEN, unclaimed closing row; pinned by `pr-owner-gone.test.ts` and the grid oracle in `pr-owner-total.test.ts`), its `guardNote` names the one case still uncovered, and the seed holds #4805 and #4808. `claimed-worker-stalled` is a registered class, guarded by agent-org#597 (stopped-claimant nudge at 10 minutes, restart notice, ledger event) and #599 (a spare is typed only its own row), seeded with #458 and #459. Both rungs were read from the three merged pull requests, not the row.

Acceptance: node -e 'const c=JSON.parse(require("fs").readFileSync(".agent-org/failure-classes.json","utf8")).classes; const o=c.find(x=>x.id==="owner-unresolved"); if(/closing rows are all closed/.test(o.guard)||!/637/.test(o.guard)||!c.some(x=>x.id==="claimed-worker-stalled"))process.exit(1)'

Mutation: the same predicate run against `HEAD:.agent-org/failure-classes.json` (before this change) exits 1; against the edited file it exits 0. A first draft of the edit still contained "closing rows are all closed" in the guard and the command exited 1, so the first clause bites.

Closes #4817

🤖 Generated with [Claude Code](https://claude.com/claude-code)
