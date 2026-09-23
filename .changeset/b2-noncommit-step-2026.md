---
"@a11ign/agent-org": patch
---

**B2 now reads a declared `Delivers: #N`, so a row whose deliverable is a commit PLUS a non-commit step
stops holding its author in build (#2026).** The shape: `undelivered` read only GitHub's resolution of a
PR's `Closes #N`, so a row that needs a host install, a fleet deploy or a measurement after the run —
exactly the rows whose PR MUST say `Closes: none` — read as undelivered with a green open PR, which is
the state #989 rewrote B2 to stop producing. Measured 2026-09-22 21:47Z: `worker-judge` held #2000, whose
PR #2011 was open and green on every required check, and was refused a claim on #2002. It did not clear
on merge either, and the refusal's two named ways out did not fit — "finish it" is what was happening,
and `decline` would have orphaned a green reviewed PR.

A `Delivers: #N` line in the PR body is honoured only while that PR is open or merged AND it changes at
least one path the row's own `## Region` declares, which is what makes it a reading rather than an
author's claim. It is read off GitHub's own `CROSS_REFERENCED_EVENT` timeline, computed server-side the
moment a body is written, so no search index lags the edit the refusal just asked for — and the timeline
is only the candidate set: probed on #2000, three of its four cross-referencing PRs merely mention it.

The refusal names the line by row number and the condition that makes it count. A failed delivery lookup
leaves the row IN BUILD rather than reading as inconclusive, so a clause that can only ever clear a row
cannot make B2's teeth depend on the network. Nothing outside the rule is taught the field: the
merge-blocking body checker still requires only `Acceptance:` and `Closes:`, so a PR omitting it is not
red — the line is opt-in and the unseen case is today's behaviour exactly.
