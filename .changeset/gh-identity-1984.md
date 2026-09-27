---
"@a11ign/agent-org": patch
---

**Which `gh` account a process is about to act as is now answerable, not inherited from a dotfile
(#1984).** `gh-identity.mjs`'s `declaredGhAccount()` reads the identical three facts
`packages/agent-org/host/gh` (the routing wrapper) reads, in the same order -- an explicit
`GH_CONFIG_DIR`, else `HERDR_WORKSPACE_ID` against `host.json`'s leads list, else the human fallback --
off each config directory's own `hosts.yml`, and answers UNKNOWN rather than guessing when it cannot
tell. It never reads the `oauth_token` beside the login.

`work-gate.mjs`'s `CANNOT ASK` refusal now names the account on a dead pool at no extra `gh` call: the
declared identity fills in exactly where a rate-limited response could only ever name a user ID, and
`api-pool.mjs`'s `refusalPoolLine` keeps both beside each other rather than one replacing the other, so a
declared identity that disagrees with the response's own account is visible rather than silently
resolved one way.

**Scope, stated rather than left implicit:** the ~30 files across the tree that spawn `gh` directly are
outside this row's Region, so none of them is edited here to call `declaredGhAccount()` on its own error
path -- that is real follow-up work. `gh-identity-declared.test.ts` derives the population from the tree
(non-empty positive control), excludes the environments already governed elsewhere (`GH_TOKEN`-required
CI jobs, the fleet, the corpus), and proves the seam the remaining "agent-host" population would depend
on actually resolves a real account, live, against this host's installed `gh` configuration.
