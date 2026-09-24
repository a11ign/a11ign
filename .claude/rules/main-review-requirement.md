## `main` REQUIRES an approving review (ceo, 2026-09-22, #2022)

- **One approving review, and `bypass_pull_request_allowances` EMPTY** — the allowance goes with it or
  the requirement is decorative. An `a11ign-bot`-authored PR waits; the hatch is a human admin editing
  the protection, which `enforce_admins: true` makes a logged edit rather than a standing hole.
- **Read it back BEHAVIOURALLY, never off the field** (`branch-protection.test.ts`):
  `required_approving_review_count == 1` proves the setting is set, not that it bites. The observable is
  **`reviewDecision`**, EMPTY when the base requires no approval, and needing no admin.
- **A 404 from `branches/main/protection` means absent OR forbidden, never "unprotected".**
  `branches/main.protected` is the discriminator and needs no admin.
- **TWO SURFACES CARRY THE REQUIREMENT, and a reading of one is not a reading of the other (#2086/#2090).**
  `ceo` ruled ADD, NOT SWAP: the `merge-queue-main` ruleset (id `23681721`) carries a `pull_request` rule
  requiring 1, and classic `branches/main/protection` STAYS and stays authoritative — the only surface
  whose exemption list can be ENUMERATED rather than merely queried for one identity. **Requirements
  compose and exemptions do not:** an identity must be exempt in BOTH, so the ruleset rule can only close
  a hole.
- **PICK THE INSTRUMENT BY WHAT YOU HOLD, AND SAY WHICH ONE YOU USED.** With repository admin:
  `branches/main/protection`, behind `A11Y_CHECK_BRANCH_PROTECTION=1` — the only one that can answer
  *nobody is exempt*. Without admin, which is every session and every CI job here: `rules/branches/main`
  plus `rulesets/{id}`, behind `A11Y_CHECK_MAIN_RULESET=1`, answering **for the asking identity only**.
  Both are wired in `branch-protection.test.ts`; the admin read cannot pass where admin is absent.
- **`current_user_can_bypass: "never"` answers FOR ME ALONE and does not mean nobody is exempt.**
  `bypass_actors` is withheld from a token without write access to the ruleset, so **its absence means
  "you may not look", never "the list is empty"**. `CANNOT_TELL` stands unchanged as the verdict for *is anyone else
  exempt*; a non-admin session gains the right to assert **the requirement exists and I cannot walk past
  it**, and no more — **a check that certifies less than it appears to does not become acceptable by being
  cheap** (`ceo`, #2086).

## A review OUTLIVES the head it was posted on (2026-09-23, #2084)

- **`main` KEEPS stale reviews on BOTH surfaces; the defect is closed by READING `reviewDecision`, not by
  dismissing reviews.** `dismiss_stale_reviews` covers APPROVING reviews only, so it could not have
  cleared the `CHANGES_REQUESTED` that stalled #2049 for seven hours — and *Update branch*, which
  `update-branch-sweep.mjs` runs after every merge, would have stalled 15 of the last 40 merges.
- **A refusal posted AFTER queue entry does NOT stop the merge (#2206):** post it BEFORE the arming approval.
- **A grep count in a row body is a reading at a moment: re-run it at YOUR commit.**
