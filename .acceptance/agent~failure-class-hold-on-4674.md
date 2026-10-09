`.agent-org/failure-classes.json` sets `guard` on `hold-on-idle-row` to the refusal that merged as `a11ign/agent-org#563` (2026-10-09T22:17:43Z, row #4661) and replaces the "none in force" `guardNote` with what is NOT covered.

- **Measured before** (`origin/main`): the row's Acceptance command exits 1 (`guard` is null).
- **Measured after** (this branch): it exits 0, and the file parses as JSON.
- **Re-read:** `gh pr view 563 -R a11ign/agent-org` reports MERGED and lists `src/pr-hold.ts`, `src/pr-hold-state.ts` and `src/packaging/pr-hold-idle-target.test.ts`.
- **Not claimed:** the 15-minute detector `idleHoldIncident` is a pure function not yet wired into the gate (`waitTickFacts` was named for it); the guardNote says so. No mutation check: the file is data, and the guard's own mutations are in agent-org#563's acceptance file.

Acceptance: node -e "const c=JSON.parse(require('node:fs').readFileSync('.agent-org/failure-classes.json','utf8')).classes.find((c)=>c.id==='hold-on-idle-row'); const h=require('node:crypto').createHash('sha1').update(String(c.guard)).digest('hex'); process.exit(c.guard!==null&&h!=='2be88ca4242c76e8253ac62474851065032d6833'?0:1)"

Class: hold-on-idle-row — any `pr:hold --until closed #N` on a row nobody works; guard: a11ign/agent-org#563 refuses it, detector not yet wired (named in the index guardNote)

Closes #4674
