`ci-health` reads every page of #928's comments before it asks whether this week's heading is already posted, by the same paged read `token-cost.ts` uses (`readCommentBodies`, the sibling of #5432's `readComments`). A heading past the first page is found, so a re-run posts nothing (#5441).

Mutation: the paging loop in `readCommentBodies` was broken two ways, each with the file restored byte-identical afterwards (`cmp`-checked): (A) it reads one page only, (B) it never stops on a short page. Both made the new `readCommentBodies` tests fail (34 tests, the paging ones red). Against the pre-change `scripts/ci-health.ts` both new tests fail with `ci.readCommentBodies is not a function`.

Acceptance:
node --test packages/guards/src/ci-health.test.ts
