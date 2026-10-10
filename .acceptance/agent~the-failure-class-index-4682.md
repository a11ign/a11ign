`.agent-org/failure-classes.json` gains the class `answer-label-without-question`, whose `guard` names `answerLabelRefusal` (`src/answer-label-guard.ts`), merged as `a11ign/agent-org#576` (row #4679, 2026-10-10T00:20:59Z), and the test that pins it; `seed` lists #4679 and the twelve rows its body names, each with its basis; `guardNote` says what is not covered.

Class: answer-label-without-question

- **Measured before** (`origin/main`): `git show origin/main:.agent-org/failure-classes.json | grep -c answer-label-without-question` prints 0 and the row's Acceptance command exits 1.
- **Measured after** (this branch): it exits 0, and the file parses as JSON.
- **Re-read:** `gh pr view 576 -R a11ign/agent-org` reports MERGED at 2026-10-10T00:20:59Z and lists `src/answer-label-guard.ts`, `src/answer-label-guard.test.ts` and `src/work-gate/org-health.ts`.
- **Not claimed:** the burst's writer is inferred, not positively identified (guardNote says so). Membership of the twelve burst rows is as #4679's body names them, not re-read. No mutation check: the file is data; the guard's mutations are in agent-org#576's acceptance file.

Acceptance: node -e 'const d=JSON.parse(require("fs").readFileSync(".agent-org/failure-classes.json","utf8"));const c=d.classes.find(x=>x.id==="answer-label-without-question");if(!c||!/answer-label-guard/.test(c.guard)||!/agent-org#576/.test(c.guard))process.exit(1)'

Closes #4682
