The reviewer's role file says it reviews with the `row-review` skill (installed by `host:install`, shipped by agent-org#1268, merged as PR 1279), and counts a partial, missing, turned-into-a-notice or deferred Done-when or Change item as a defect in THIS diff, never a `Follow-up:` line. The same file posts no separate comment: the review object is the one write. The switch `review.rowReviewSkill` is turned on by `machinery:flag` (a11ign/a11ign#5325), not by this diff.

Acceptance: bash -c 'grep -q "row-review" .agent-org/roles/reviewer.md && grep -qi "Done-when" .agent-org/roles/reviewer.md'

Mutation: `row-review` replaced by `row-rev` in `.agent-org/roles/reviewer.md`; the same two greps exit 1. Restored from a scratchpad copy, byte-identical by `diff`; the greps exit 0. At `HEAD` the file has zero `row-review` matches, so the Acceptance was red before the change.

Closes #5325
