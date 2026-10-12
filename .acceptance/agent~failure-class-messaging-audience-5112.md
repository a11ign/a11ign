The `messaging-audience-misuse` class in `.agent-org/failure-classes.json` no longer says `guard: null`. Its `guard` names the control in force: `deliver()` in `src/messaging/core.ts` of a11ign/agent-org refuses an announcement that asks the chairman something (`refuseAsking`, agent-org#1222, merged as PR 1237), and that refusal is on because the flag `messaging.refuseAskingAnnouncements` is ON (switch row a11ign#5297). The stale `guardNote` (which said the detector was unfixed) is cleared, and the two ledger occurrences are named as false flags fixed by agent-org#999.

Acceptance: node -e "const c=JSON.parse(require('node:fs').readFileSync('.agent-org/failure-classes.json','utf8')).classes.find((c)=>c.id==='messaging-audience-misuse'); const h=require('node:crypto').createHash('sha1').update(String(c.guard)).digest('hex'); process.exit(c.guard!==null&&h!=='2be88ca4242c76e8253ac62474851065032d6833'?0:1)"

Mutation: the same predicate run against `HEAD:.agent-org/failure-classes.json` exits 1; against the edited file exits 0; against the edited file with `guard` set to `null` exits 1.

Closes #5112
