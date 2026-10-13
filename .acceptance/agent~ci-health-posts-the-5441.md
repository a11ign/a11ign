`ci-health` reads every page of #928's comments before it asks whether this week's heading is already posted, by the same paged read `token-cost.ts` uses (`readCommentBodies`, the sibling of #5432's `readComments`). A heading past the first page is found, so a re-run posts nothing (#5441).

Acceptance:
node --test packages/guards/src/ci-health.test.ts
