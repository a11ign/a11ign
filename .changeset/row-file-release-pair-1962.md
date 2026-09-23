---
"@a11ign/agent-org": patch
---

**`row-file` writes BOTH release fields when it is given either (#1962).** It accepted a `--milestone
"Out of release"` filing or a `--label out-of-release` one and wrote only the half it was handed, while
`ready-label-audit.mjs` reads the LABEL — so a `--milestone` filing produced a row the next audit run
reported as RELEASE DRIFT, minted by the tool that filed it. Measured 2026-09-22: #1960 filed that way with
no label, and the mirror case #1740 came from the same run; both were repaired by hand. `outOfReleaseArgv`
is now symmetric — either declaration adds the other, a filing already carrying both is untouched, and a
REAL milestone still gets no label, because the milestone's VALUE is read rather than the flag's presence.

The read-back now expects what was FILED rather than what was TYPED. Derived from the caller's own argv,
the half this tool adds was the one field nothing confirmed: a `--label out-of-release` filing expected no
milestone and so never checked the milestone it had just asked for, leaving the remedy for the drift
unverified. `releaseExpectation` derives both from the filed argv, and the refusal names whichever half
did not stick.
