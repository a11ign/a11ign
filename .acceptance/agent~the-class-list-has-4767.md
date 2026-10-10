`.agent-org/failure-classes.json` gains the class `row-not-finishable` with `guard: null` and a `guardNote` listing the four merged controls (agent-org#546, #545, #547, #556) and what each does not do; `seed` carries a11ign/a11ign#4637 and #4669.

Class: row-not-finishable

- **Measured before** (`origin/main`): `git show origin/main:.agent-org/failure-classes.json | jq -e '.classes | map(select(.id == "row-not-finishable" and .guard == null)) | length == 1'` prints `false` and exits 1.
- **Measured after** (this branch): the Acceptance below prints `true` and exits 0; the diff is 18 insertions and 0 deletions in the one file, and no id appears twice.
- **Re-read:** `gh pr view` reports agent-org#545 MERGED 2026-10-09T20:44:45Z, #546 20:59:00Z, #547 20:53:31Z and #556 21:26:33Z; each guardNote clause restates that PR's own body. The chairman's words are #4437 comments 6088558547 and 6095588368.
- **Deviates from the row, on purpose:** the row asked for basis `chairman-named` on both seeds. Neither comment names #4637 or #4669 (the chairman's own instances in 6088558547 are #3870, #4438 and #4441), and the file's `_doc` defines `chairman-named` as the chairman's direction on #4122, so the bases are `title states it` (#4637) and `ceo read` (#4669, closed by `ceo` in the sweep). #4637 is the remedy row, which its note says.
- **Not claimed:** `guard` stays `null` until the detector for a row left open after its deliverable merged is in force (a later edit, not this row's). #3870, #4438 and #4441 are not seeded here: the row names two seeds. No mutation check: the change is data.

Acceptance: jq -e '.classes | map(select(.id == "row-not-finishable" and .guard == null)) | length == 1' .agent-org/failure-classes.json

Closes #4767
