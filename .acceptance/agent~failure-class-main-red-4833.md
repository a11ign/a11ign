The `main-red` class in `.agent-org/failure-classes.json` no longer says `guard: null`. Its `guard` names the control that stands: row a11ign/agent-org#539, merged as pull request a11ign/agent-org#650, and `src/trunk-red.test.ts` in agent-org, with what it reads (a red push run, a red `checks (cross-repo)` leg beside a green `gate`, a red nightly) and that it wakes the fixer. Its `guardNote` names what it does not cover: a standing red is counted once per run (the ledger ref is the run), so one red leg is N occurrences, which is how #4833 itself was filed; a leg is found by its NAME; only a declared code repository is read. Read from agent-org `origin/main` a6d68f5f (`src/trunk-red.ts`, `src/trunk-red.test.ts`, `src/failure-ledger.ts`), not from the row. `seed` and every other class are untouched.

Acceptance: bash -c 'node -e "const c=JSON.parse(require(\"node:fs\").readFileSync(\".agent-org/failure-classes.json\",\"utf8\")).classes.find(c=>c.id===\"main-red\"); const g=String(c.guard); process.exit(g.includes(\"agent-org#539\")&&g.includes(\"src/trunk-red.test.ts\")?0:1)"'

Mutation: the same predicate run against `HEAD:.agent-org/failure-classes.json` exits 1; against the edited file it exits 0; against the edited file with `agent-org#539` replaced exits 1, and with `src/trunk-red.test.ts` replaced exits 1, so each clause bites on its own.

Closes #4833
