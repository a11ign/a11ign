---
"@a11ign/agent-org": patch
---

**`host:check` no longer tells a reader that a unit this repository ships was installed by hand.**

**Why.** The finding read *"NO COMMIT HERE EVER SHIPPED IT, so it was installed by hand and this tree has never been able to see what it does"*, and it was derived from `git log --diff-filter=D` — a query that asks only whether a commit DELETED the unit file. Its empty answer is true of three different worlds: a unit that was never here, one shipped on a ref this checkout has not merged, and one shipped and still present. Only two of the three had a case, so the third was reported as the first. That is the state every host-unit row passes through between installing a unit and merging the PR that ships it (#1858's and #1993's included), and the overstatement landed in the one message whose job is to STOP somebody acting. Measured 2026-09-22 from the primary checkout with `agent/worktree-prune-unit-2000` pushed and unmerged: `host:check` called `a11ign-worktree-prune.service` a hand-installed mystery while `git log --all` on the same path, in the same tree seconds later, named d77e47a29 shipping it (#2013).

**What changes.**
- A third orphan state. `orphanOrigin` asks `addedOnSomeRef` — `git log --all --diff-filter=A` — when no commit deleted the file, and reports **`ORPHANED -- SHIPPED ON AN UNMERGED REF <sha>`** when some ref adds it. The remedy is INVERTED rather than reworded: `git branch -a --contains <sha>` names the ref, and the instruction is to MERGE it, not to read the unit's journal and work out whether it is dead.
- The remedy line gains its own third paragraph for that state. It still says DO NOT RUN THE REMEDY YET — `host:install` copies this tree over the host, so it would still delete the unit — but it says the deletion would undo work already done, rather than that the repository has no record of ever shipping it.
- `NEVER SHIPPED HERE` is now EARNED rather than inferred: it is the answer to an addition question over every ref, where it used to be read off a deletion one, and its wording says so (`NO COMMIT ON ANY REF HERE EVER SHIPPED IT`).

**What does not.** The `RETIRED HERE` and `HISTORY UNREADABLE` findings, their remedies and their flags are unchanged, and the new state was not produced by weakening either. The order of the two questions is load-bearing and deletion still decides: every retired unit was also ADDED by some commit, still reachable from `--all` after the deletion, so asking the addition question first would relabel every retirement as pending. `retiredHere`'s `null` still short-circuits, and `addedOnSomeRef` carries the same shallow-clone guard for the same reason — a history that cannot say "never" cannot say "not anywhere either" (#1993).
