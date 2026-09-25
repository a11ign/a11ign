---
"@a11ign/agent-org": patch
---

**The `pr-checks-failing` prompt now states when the failing run started and whether `main` has moved since (#2117).** The gate held the failing check's `startedAt` and discarded it, so two sessions each spent a cycle on #2087 re-deriving it by hand and reached opposite readings. `readBaseTip` (one CORE read of `commits/main`, paid only on a red tick and declared as `GH_READS.conditionalOnRedBase`) supplies the tip; an unread tip or a missing start time reads as UNKNOWN, never "has not moved". The prompt names both regimes, a stale merge ref (a push or `update-branch`; `gh run rerun` cannot clear it) and a check that could not ASK (`gh run rerun`), and chooses neither. No predicate moved: a test pins that session, subject, discriminator and `causeKey` are identical whether the base has moved or not.
