Sets `guard` on the `sweep-overrun` failure class (#5193) to the merged agent-org split (agent-org#1314, #1317: a released overrun is the `sweep-window-released` counter, `sweep-overrun` is only a claim refused after the overrun notice) and clears `guardNote`. Hand-written: the change is one class entry in `.agent-org/failure-classes.json`.

Acceptance:
node -e "const c=JSON.parse(require('node:fs').readFileSync('.agent-org/failure-classes.json','utf8')).classes.find((c)=>c.id==='sweep-overrun'); const h=require('node:crypto').createHash('sha1').update(String(c.guard)).digest('hex'); process.exit(c.guard!==null&&h!=='fd108dcbe1c2fa93c2fc19a4e23f0fc8b6e093c8'?0:1)"
