# The weekly outsider review

Once a week, a session with no hand in the recent work reads what an outsider would read. It is a review,
**never a gate**: releases keep flowing and nothing waits on it. Its findings arrive up to seven days after
a release, which is the price of not blocking one.

`.github/workflows/weekly-review.yml` files one row a week, titled `Weekly outsider review <ISO week>`.
Filing twice in a week files nothing. The row is built from the documents, so this page does not restate them.

1. **Take the row only if you are eligible.** The row's `Ineligible:` line names the sessions that built the
   window's work. If you are in it, leave the row. If a closed row shows no builder, ask before taking it.
2. **Start from nothing.** A fresh clone of the outsider repository, then only the public documents the row's
   requirements name.
3. **Use a site this project does not own**, with a real task.
4. **Answer the row's questions in writing**, read individually against the stored log wherever the row says so.
   They are the four in [`try-it.md`](./try-it.md#what-we-would-like-back).
5. **File everything you find as its own row**; fix nothing in place, or the record of what a first reader met is lost.
6. **State `Reviewer-session: <your session>` in your reading**, and say you are not in the ineligible list.
   Next week's run checks it against the list and comments on the row if you were in it. It never reopens it.
7. The requirements themselves are in [`RELEASE.md`](../RELEASE.md), under "The V1 rehearsal".

Nobody is named reviewer in advance; `ceo` names one only if nobody takes the row in its week. The first row may
carry `Waiting-for: closed #3182`, the outsider repository it clones; after that nothing waits.
