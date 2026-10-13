The reviewer's role file says it reviews with the `row-review` skill (installed by `host:install`, shipped by agent-org#1268, merged as PR 1279), and counts a partial, missing, turned-into-a-notice or deferred Done-when or Change item as a defect in THIS diff, never a `Follow-up:` line. The same file posts no separate comment: the review object is the one write. The switch `review.rowReviewSkill` is turned on by `machinery:flag` (a11ign/a11ign#5325), not by this diff.

Acceptance: bash -c 'grep -q "row-review" .agent-org/roles/reviewer.md && grep -qi "Done-when" .agent-org/roles/reviewer.md'

Mutation: the one `row-review` token, in the heading at `.agent-org/roles/reviewer.md:127`, replaced by `row-rev`; the same two greps exit 1. Restored from a scratchpad copy, byte-identical by `diff`; the greps exit 0. The token appears once in the file (the install path was taken out of that line so one occurrence cannot satisfy the grep by accident), and at `HEAD` the file has zero matches, so the Acceptance was red before the change. The grep is a presence check the row's Acceptance fixes; it does not prove the rule's wording.

Closes #5325
