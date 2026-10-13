`token-cost --post` finds the week's CI-health comment on #928 past its first 100 comments (#5432): the comment list is read page by page, and a heading on any page is found, with the PATCH aimed at that comment's id.

Mutation: the page loop's short-page stop removed, so the read stops at page 1. The second-page case and the paged-read case went red, the first with the `is not on #928 yet` refusal; the file was restored byte-identical (`diff` against a copy).

Acceptance:
node --test packages/guards/src/token-cost.test.ts
