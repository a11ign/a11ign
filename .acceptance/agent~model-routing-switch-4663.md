a11ign's `.agent-org/decisions.json` now carries `{ "model-routing": true }`, which is the one switch agent-org#550 reads (`decision-provider.ts`, `.agent-org/decisions.json`, one boolean per use, absent meaning off). Before this the file did not exist, so the use read off, quietly, and model and effort routing (#4629) merged but ran nowhere. `wake-triage` is not in the file on purpose: `triage-provider.ts` turns it on from the host's own `triage` declaration (#4384), and this file would not change that.

Acceptance: `node -e 'const d=JSON.parse(require("fs").readFileSync(".agent-org/decisions.json","utf8"));if(d["model-routing"]!==true||Object.keys(d).length!==1)process.exit(1)'`

Mutation: with the file absent (`main`) the Acceptance exits 1 on the read; with `"model-routing": false` it exits 1 on the value; with a second key it exits 1 on the count; the committed file exits 0. This change is data only.

Measured: Acceptance exit 0 at this head (run from this worktree).

Closes #4663

platform: n/a (a data file)
