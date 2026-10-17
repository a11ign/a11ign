The `app-role-silent` entry in `.agent-org/failure-classes.json` now says the detector's report carries the failed mint's reason, exit status and time (agent-org#1682), and its `guardNote` says where that reason is read: the host's stderr line in the journal, not the failure ledger. Only that entry's `guard` and `guardNote` change: `git diff` on the index is two lines, one `-` and one `+` for each.

Re-read: the premise was checked against agent-org's merged PR #1686 (merge commit `af30a70535f914a974c91e43d87caf20d65fdda0`), not against the row's text alone. Its diff puts the reason on `tickAppRoleSilent`'s stderr line in `src/host-units.ts` and leaves the `ref` and `FailureEvent` unchanged, which is what the new `guardNote` says. agent-org#1666 is still OPEN, so "or refuses, once agent-org#1666 lands" stays conditional.

Before the edit, the guard's SHA-1 was `457229d163172210a5249d2e2d16d477b8a97338`, the value the Acceptance rejects; that was computed, not the command run. After the edit the command exits 0, read from `$?`, and the file parses as JSON.

Acceptance: node -e "const c=JSON.parse(require('node:fs').readFileSync('.agent-org/failure-classes.json','utf8')).classes.find((c)=>c.id==='app-role-silent'); const h=require('node:crypto').createHash('sha1').update(String(c.guard)).digest('hex'); process.exit(c.guard!==null&&h!=='457229d163172210a5249d2e2d16d477b8a97338'&&/agent-org#1682/.test(c.guard)&&/reason/.test(c.guard)?0:1)"

Local check, run from a shell with `gh` authenticated (not in CI: the acceptance step passes no `GH_TOKEN`, so `gh` cannot run there): gh issue view 1682 --repo a11ign/agent-org --json state --jq .state | grep -q CLOSED

Closes a11ign/a11ign#5599
