`token-cost --post` finds the week's CI-health comment on #928 past its first 100 comments (#5432): the comment list is read page by page, and a heading on any page is found, with the PATCH aimed at that comment's id.

Acceptance:
node --test packages/guards/src/token-cost.test.ts
