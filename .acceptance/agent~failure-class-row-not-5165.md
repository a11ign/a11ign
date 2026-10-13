Sets `guard` on the `row-not-finishable` failure class (#5165) to the two merged agent-org controls that each stop one of its occurrences (agent-org#1282 and agent-org#1283, replayed in the PR body), and records what they do not stop in `guardNote`. Hand-written: the change is one value in `.agent-org/failure-classes.json`.

Acceptance:
node -e "const c=JSON.parse(require('node:fs').readFileSync('.agent-org/failure-classes.json','utf8')).classes.find((c)=>c.id==='row-not-finishable'); const h=require('node:crypto').createHash('sha1').update(String(c.guard)).digest('hex'); process.exit(c.guard!==null&&h!=='2be88ca4242c76e8253ac62474851065032d6833'?0:1)"
