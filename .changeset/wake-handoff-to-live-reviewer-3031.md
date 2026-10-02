---
"@a11ign/agent-org": patch
---

**A handoff to a live reviewer instance is delivered instead of refused as "about no pull request" (#3031).**
`reviewerMismatch` read the pull request from the cause key, and a handoff's key (`handoff/<session>/<id>`) names none, so the
author's `prompt:session -- reviewer-<n>` re-prompt, queued while the seat was mid-turn, was refused on every tick once it was
idle. A handoff addressed to the instance is now judged as about its own pull request and re-points its tree like any other
delivery; a handoff to another session, and any derived order about another pull request, are refused as before.
`deliverHandoffs` also forwards the `checkout` seam to `deliver`, which it had dropped.
