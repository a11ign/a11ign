---
"@a11ign/agent-org": patch
"@a11ign/lab": patch
---

**A pull request in a repository the gate does not declare is no longer invisible: `agent-org` is declared, and its keyed reviewer has a checkout and the door (#2969).** 2026-10-02: `a11ign/agent-org#6` had green checks, `reviewRequests=[]` and `reviews=[]` for hours and `#3` for a day, because `.agent-org/project.json` declared ONE code repository and `scopesOf` ticks only what is declared, so no pull-request cause (review, red, conflict, stall) ever read the other. `agent-org` is now a code scope (key `agent-org`, no tracker of its own), so `reviewer-agent-org-<n>` is offered for a ready, green, unreviewed pull request there, and a keyed pull request nobody owns falls to `ownerOfPr`'s last rung, `ceo`.

**`noReviewCheckoutFor` is lifted for a DECLARED key whose clone the host names.** `host.json` gains `clones` (`{ "agent-org": "/home/agent/repos/agent-org" }`), and a keyed review tree is fetched from THAT clone's `origin` into `refs/review/<key>/pr-<n>`, added and removed as a worktree of the clone, and has no `packages/` to link (a clone with no `node_modules` needs nothing). A key the project does not declare, or one the host gives no clone, is still refused by name and nothing is fetched. The primary's seat, ref, fetch root, prompt and environment are asserted byte for byte unchanged.

**The door says which repository.** A keyed reviewer's pane starts with `GH_REPO=<repo>`, and its order types `GH_REPO=a11ign/agent-org A11Y_REVIEWER_SESSION=<seat> pr-review-verdict ...` with a sentence saying why, so a verdict cannot land on the primary's pull request of the same number (the door already honoured `GH_REPO`, #2952).

**Also a population check:** a recorded `gh repo list a11ign` is crossed with the declared scopes, and every non-archived repository must be a scope or sit on a shrink-only exemption list with a reason. Seven are exempt; `auth-capture-check`, which has seven open pull requests, is the same class and is routed on the row rather than declared here.
