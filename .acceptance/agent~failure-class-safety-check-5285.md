Failure class `safety-check-denied` now names a guard that is code: a PreToolUse hook on Bash in `.claude/settings.json`, which refuses the shapes the six denied commands share. Five of the six contain no removal (a nested `bash -c` carrying `$`); the sixth is `rm -rf "$S/$m"`. Read from the six transcripts, extracted as the detector does, and pinned verbatim in `scripts/fixtures/safety-check-denied-commands.json`.

Acceptance: `node -e "const c=JSON.parse(require('node:fs').readFileSync('.agent-org/failure-classes.json','utf8')).classes.find((c)=>c.id==='safety-check-denied'); const h=require('node:crypto').createHash('sha1').update(String(c.guard)).digest('hex'); process.exit(c.guard!==null&&h!=='2be88ca4242c76e8253ac62474851065032d6833'?0:1)"`

Mutation: (both directions, on a copy restored and diffed byte-identical) a guard that never fires failed 3 of 6 tests (the fixture loop, the pipe case, the process test); a guard that always fires failed 2 (the allowed list, the process test); the restored file passed 6 of 6.

Limits: the two shapes are inferred from six samples and are not the check's own rule; the hook reaches only sessions whose working directory is this repository, so agent-org, control and lab keep the brief's rule alone. `denialShape` in agent-org still reports `other` for non-`rm` commands: that is a change in agent-org, to be filed as its own row. Nothing here reached the fleet or the lab.

Closes #5285
