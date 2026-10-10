The `hand-reroute` class in `.agent-org/failure-classes.json` no longer says `guard: null`. Its `guard` names `classifyLogin` in `src/hand-fix-ledger.ts` of agent-org (a dependency bot is `automation`; row agent-org#560, merged as agent-org#716, b7a247af) and `src/packaging/hand-fix-ledger.test.ts`, as what stops the FALSE occurrences. Its `guardNote` says what is not stopped: the 7 genuine occurrences, all 2026-10-02, and that whether that residual is a guard is `ceo`'s call. `seed` and every other class are untouched.

Class: hand-reroute

- **Measured before:** the row's Acceptance command exits 1 on `origin/main` (`guard` is null).
- **Re-read:** `gh pr view 716 -R a11ign/agent-org` reports MERGED 2026-10-10T19:19:17Z, merge commit b7a247af, and lists `src/hand-fix-ledger.ts` and `src/packaging/hand-fix-ledger.test.ts`; `classifyLogin` at that commit reads `DEPENDENCY_BOT_LOGIN`.
- **Cause:** 23 of the 30 ledger lines were Dependabot PRs, measured on the row (comment 6089529937), not re-derived here.
- **Not claimed:** the ledger was not re-read after #716, so the post-fix count is not measured. No mutation check: the file is data; the guard's mutations are in agent-org#716's acceptance file.

Acceptance: node -e 'const d=JSON.parse(require("fs").readFileSync(".agent-org/failure-classes.json","utf8"));const c=d.classes.find(x=>x.id==="hand-reroute");if(!c||!/hand-fix-ledger/.test(c.guard)||!/agent-org#716/.test(c.guard))process.exit(1)'

Closes #4623
