`ci-health` reads every page of #928's comments before it asks whether this week's heading is already posted. It does so through `token-cost.ts`'s `readComments` (the paged read #5432 added), not a second loop: `alreadyPostedOn` passes the date and the page reader to it. A heading past the first page is found, so a re-run posts nothing (#5441).

Mutation: `alreadyPostedOn` was broken to read only the first 100 comments (`readComments(...).slice(0, PER_PAGE)`), and the file was restored byte-identical afterwards (`cmp`-checked). The page-2 positive control fails (33 pass, 1 fail), and the restored file passes 34/34. Against the pre-change `scripts/ci-health.ts` both new tests fail with `ci.readCommentBodies is not a function`.

Acceptance:
node --test packages/guards/src/ci-health.test.ts
