---
"@a11ign/lab": patch
---

**`row-claim --adopt` is no longer refused by B4 for the row's own `Closes: none` split pull request (#2769).** B4 excused a row's own PR only when its body said `Closes #<row>`, so a released claim whose PR was a sanctioned split (`Closes: none -- Done-when 3 is still open`) could not be adopted: #2760's #2766 needed a fresh CI run, which needed a push, which needed the row claimed, and the refusal said to "sequence with that PR's author", a session that had already left. `--adopt` now tells B4 the branch it is re-stamping, and an open PR of the first repository whose head branch is that one is the row's own work. A fresh claim, a stranger's PR on the same file and a same-named branch in another repository still refuse.
