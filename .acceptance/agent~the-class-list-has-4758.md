`.agent-org/failure-classes.json` gains the class `scope-added-mid-row` with `guard: null` and a `guardNote` saying the gate comparison is the sibling `a11ign/agent-org` row and is not merged; `seed` carries `a11ign/a11ign#4737` (the mirror of `a11ign/agent-org#575`) with basis `chairman-named` and #4627 comment 6095044053. `.agent-org/roles/product-manager.md` gains one bullet stating that scope added to a claimed row is a new row, never folded into it, and that a mirror of a keyed-repository row takes the original's scope and no more.

Class: scope-added-mid-row

- **Measured before** (`origin/main`): `git show origin/main:.agent-org/failure-classes.json | grep -c scope-added-mid-row` prints 0, and `git show origin/main:.agent-org/roles/product-manager.md | grep -c "scope added to a claimed row is a new row"` prints 0.
- **Measured after** (this branch): the Acceptance below prints `true` then `1`, and the file parses as JSON.
- **Re-read:** #4627 comment 6095044053 says the mirror row #4737 was sent while #575 was half built and was absorbed; its words ("Added scope mid-row is a NEW row ... Never fold it into a claimed row") are what the seed note and the bullet restate.
- **Not claimed:** the `guard` stays `null` until the gate row in `a11ign/agent-org` merges (a later edit, not this row's). `scripts/doc-cross-reference-report.ts` was not run: the worktree has no `node_modules`; the edit touches no roster, agent, reporter, lane or ban line that `roles-readme.ts` pins. No mutation check: the change is data and prose.

Acceptance: jq -e '.classes | map(select(.id == "scope-added-mid-row" and .guard == null)) | length == 1' .agent-org/failure-classes.json && grep -c "scope added to a claimed row is a new row" .agent-org/roles/product-manager.md

Closes #4758
