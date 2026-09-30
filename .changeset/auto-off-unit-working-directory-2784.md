---
"@a11ign/control": patch
---

**The fleet auto-off service now starts in the control checkout, so the installed timer stops failing on every tick (#2784).** Read live on `a11y-control` at 09:40Z, minutes after `auto-off-schedule.yml` first installed the unit pair: the service's cwd is `/`, `fleet-auto-off.mjs` writes its idle clock to the RELATIVE `runs/fleet-auto-off-state.json`, and every tick died with `ENOENT`. The by-hand `--apply` that proved the shutdown had set `WorkingDirectory` itself, so it could not show this. `fleet-auto-off.test.ts` pins the unit line.
