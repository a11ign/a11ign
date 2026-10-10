`.agent-org/roles/engineer.md` no longer tells a spawned engineer that "the row asks `product-manager` what is left" after its pull request merges. In its place: the row closes on its deliverable's merge, and the chairman's words (#4437) "your row is ONE deliverable. Anything you find beyond it, file as a new row; do not hold your claim for it", with the four things that are never a reason to hold a claim (a live reading after the merge, a decision for another seat, a premise that did not hold, a CI watch).

- **Measured** (this head): the Acceptance command exits 0 (`grep -c` prints 1; the old phrase is absent; the row's command run verbatim also exits 0, though its backticks inside double quotes are command substitution, so the Acceptance below matches them as `.` to test the literal phrase). `checkRoster` from `scripts/doc-checks/roles-readme.ts`, run directly with `node --experimental-strip-types` against this tree, reports `incomplete: []` for every role file that exists, `engineer.md` included. It also reports `missing: [worker-contracts.md]`, which is the same at `origin/main` and not touched by this diff.
- **Not run:** `pnpm run verify` (no `node_modules` in this worktree); the change is one prose paragraph in a Markdown file.

Acceptance: bash -c 'grep -c "your row is ONE deliverable" .agent-org/roles/engineer.md && ! grep -q "the row asks .product-manager. what is left" .agent-org/roles/engineer.md'

Closes #4768

🤖 Generated with [Claude Code](https://claude.com/claude-code)
