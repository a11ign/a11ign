## What

`.agent-org/roles/product-manager.md`: the "Haiku by default" paragraph is replaced by the chairman's later ruling (#4627 comment 6089878534): the router decides model and effort for every row, `tier:haiku` is a reasoned override by the chairman or `ceo` only, Haiku effort stays `high`, a Haiku medium/low route is not added now, and the #4382 stop rule stays the revert. The guard `role-files-chairman-source-and-haiku-default.test.ts` moves with it: `statesRouterDecides` reads the new sentences, with one negative case per load-bearing phrase.

Measured: the acceptance command run at this head, 3 tests pass.

Acceptance: bash -c 'node --test packages/guards/src/role-files-chairman-source-and-haiku-default.test.ts && grep -q 6089878534 .agent-org/roles/product-manager.md && ! grep -q "Haiku by default" .agent-org/roles/product-manager.md'

Closes #4671

🤖 Generated with [Claude Code](https://claude.com/claude-code)
