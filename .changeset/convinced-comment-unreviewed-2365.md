---
"@a11ign/agent-org": patch
---

**The work gate now notices a `convinced` verdict that is only a COMMENT, and tells the parity reviewer to post
it as a review (#2365).** `settledVerdictOrder` returned `null` for a convinced verdict on a READY pull
request, correctly for "flip it ready" and blind to "did the verdict become a review?". Measured 2026-09-24 on
#2337: `reviewer-2`'s *convinced (provisional)* sat as a comment at 14:02Z, `/reviews` was empty and
`reviewDecision` stayed `REVIEW_REQUIRED` until somebody read the reviews by hand -- `pr-review-verdict.sh`
had refused a malformed first line AFTER `gh pr comment` posted.

The new `verdict-comment-unreviewed` cause fires for a green, unheld, non-draft pull request whose convinced
verdict sits at a reviewable head with no APPROVED review at any head an update-branch made equivalent, and is
addressed to `parityOwner` with the remedy (re-post through `pr-review-verdict`). It is keyed on the last
AUTHORED head like `draft-awaiting-verdict`, so an update-branch does not re-fire it. A DRAFT stays
`draft-convinced-not-ready`'s. `readPrs` gains `reviews` on the call it already makes -- `latestReviews` was
measured and returns an empty `commit.oid`; an absent `reviews` field is unread and yields no order.
