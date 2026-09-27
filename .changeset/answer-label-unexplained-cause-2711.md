---
"@a11ign/agent-org": patch
---

**A bare `answer:<session>` label now wakes the labelling session, not just the addressee (#2711).** Nothing
required an `answer:` label write to carry the question it is waiting for an answer to, so any session could
(and did) apply one with no comment -- `worker-2632` added `answer:ceo` to PR #2649 twice with no comment
either time, and `ceo` cleared it twice with nothing to answer. `answersOwedBy`/`bareAnswerLabel`
(`waiting-condition.mjs`) read the row's own timeline and name a label with nothing posted at or after it as
bare; `readRowTimeline`/`bareAnswerLabelOrders` (`work-gate.mjs`) turn that into a new `answer-label-unexplained`
cause, addressed to the row's own `session:` holder (never the timeline's shared-account actor, which cannot
name a specific session), asking them to post the question or remove the label.
