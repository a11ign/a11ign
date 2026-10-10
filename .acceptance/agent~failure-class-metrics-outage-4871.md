The `metrics-outage` class in `.agent-org/failure-classes.json` has a corrected `guard` and `guardNote`. The row's premise was that the guard (#498's freshness timer) failed; the reading on the row (product-manager and `ceo`, 2026-10-10) is that it OVER-fired: all three ledger occurrences were false incidents on a healthy store. The guard now names the two merged corrections, agent-org#704 (merged as #706: "working" is a written message, not a touched file) and agent-org#709 (merged as #739: a cold start's old tail is read past), and `src/trace/freshness.test.ts`. `guardNote` states what is still not covered. `seed` and every other class are untouched.

Class: metrics-outage

- **Measured before:** the row's Acceptance command exits 1 on `origin/main` (the guard text hashes to the failed one).
- **Re-read:** `gh api repos/a11ign/agent-org/issues/704/timeline` and `/709/timeline` show PR #706 merged 2026-10-10T18:48:05Z and PR #739 merged 2026-10-10T20:37:15Z; `src/trace/freshness.ts` on agent-org `main` reads `newestMessageAt` and `MESSAGE_TYPES`, and its test file holds the touched-transcript and COLD START cases named in `guard`.
- **Not claimed:** no genuine stale episode was observed after the two corrections, so "the detector fires correctly end to end" is not measured here. No mutation check: the file is data; the detector's mutations belong to agent-org#706 and #739.

Acceptance: node -e "const c=JSON.parse(require('node:fs').readFileSync('.agent-org/failure-classes.json','utf8')).classes.find((c)=>c.id==='metrics-outage'); const h=require('node:crypto').createHash('sha1').update(String(c.guard)).digest('hex'); process.exit(c.guard!==null&&h!=='5b378465fd873c6cff4ca18f8c5b41e5c76c752f'?0:1)"

Closes #4871
