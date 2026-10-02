---
"@a11ign/agent-org": patch
---

**A pull request red ONLY from somebody else's hold no longer re-orders its owner (#2993, found in #2969 and #2990).** `failingChecksOrder` asked `redOnlyFromHoldOf`, which exempted a hold only when it was the ADDRESSEE's own (#2400 clause 1), so `#2990` (`session:worker-2969`, `hold:ceo`) sent `worker-2969` five `pr-checks-failing` orders at one head, each answered "no fix needed". It now asks `red-pr.mjs`'s `isHeldRed`, the decider `org-health` already uses (#2956): no order while every red check is the hold's own `deliberateRefusals` and `gate` and the PR carries ANY `hold:*`. A third red job (a real `ts / run` failure) or the hold's removal ends the exemption and the run's count restarts. **This narrows #2400's clause 1 and `ceo` may veto it** (the row carries `answer:ceo`); the real failure under a foreign hold still reaches its owner. `redOnlyFromHoldOf` and its `HOLDING_SESSION` constant are gone.
